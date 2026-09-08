'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createProject, deleteProject, duplicateProject, getActiveProject, listProjects, listVersions, openProject, renameProject, restoreVersion, saveProject, saveVersion, type ProjectSummary } from '@/lib/persistence';
import { parseDesignDocument } from '@/lib/schema';
import { useEditorStore } from '@/store/editor-store';

export function useAutosave() {
  const document = useEditorStore((state) => state.document);
  const assets = useEditorStore((state) => state.assets);
  const hydrate = useEditorStore((state) => state.hydrate);
  const setAutosaveStatus = useEditorStore((state) => state.setAutosaveStatus);
  const [ready, setReady] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activeProject, setActiveProject] = useState<ProjectSummary | null>(null);
  const writes = useRef(Promise.resolve());
  const projectId = useRef<string | null>(null);
  const enqueue = useCallback(<T,>(operation: () => Promise<T>) => {
    const next = writes.current.then(operation, operation);
    writes.current = next.then(() => undefined, () => undefined);
    return next;
  }, []);
  const refresh = useCallback(async () => setProjects(await listProjects(useEditorStore.getState().document)), []);

  useEffect(() => {
    let alive = true;
    void enqueue(async () => {
      const loaded = await getActiveProject(useEditorStore.getState().document);
      if (!alive) return;
      projectId.current = loaded.project.id;
      hydrate(parseDesignDocument(loaded.document), loaded.assets);
      setActiveProject(loaded.project); await refresh(); setReady(true); setAutosaveStatus('saved');
    }).catch(() => { if (alive) { setReady(true); setAutosaveStatus('error'); } });
    return () => { alive = false; };
  }, [enqueue, hydrate, refresh, setAutosaveStatus]);

  useEffect(() => {
    if (!ready || !projectId.current) return;
    setAutosaveStatus('saving');
    const timeout = window.setTimeout(() => {
      const state = useEditorStore.getState(); const id = projectId.current;
      if (!id) return;
      void enqueue(() => saveProject(id, state.document, state.assets))
        .then((project) => { setActiveProject(project); return refresh(); })
        .then(() => setAutosaveStatus('saved')).catch(() => setAutosaveStatus('error'));
    }, 750);
    return () => window.clearTimeout(timeout);
  }, [assets, document, enqueue, ready, refresh, setAutosaveStatus]);

  const saveNow = useCallback(async (thumbnail: Blob | null = null) => {
    const id = projectId.current; if (!id) return;
    setAutosaveStatus('saving'); const state = useEditorStore.getState();
    await enqueue(() => saveVersion(id, state.document, state.assets, thumbnail));
    const loaded = await openProject(id); setActiveProject(loaded.project); await refresh(); setAutosaveStatus('saved');
  }, [enqueue, refresh, setAutosaveStatus]);

  const load = useCallback(async (id: string) => {
    const state = useEditorStore.getState(); state.endGesture();
    if (projectId.current) await enqueue(() => saveProject(projectId.current!, state.document, state.assets));
    const loaded = await enqueue(() => openProject(id));
    for (const asset of Object.values(useEditorStore.getState().assets)) URL.revokeObjectURL(asset.previewUrl);
    projectId.current = loaded.project.id; hydrate(loaded.document, loaded.assets); setActiveProject(loaded.project); await refresh();
  }, [enqueue, hydrate, refresh]);

  const create = useCallback(async (name = 'Diseño sin título', source = { document: useEditorStore.getState().document, assets: useEditorStore.getState().assets }) => {
    const state = useEditorStore.getState(); state.endGesture();
    if (projectId.current) await enqueue(() => saveProject(projectId.current!, state.document, state.assets));
    const loaded = await enqueue(() => createProject(name, source.document, source.assets));
    for (const asset of Object.values(useEditorStore.getState().assets)) URL.revokeObjectURL(asset.previewUrl);
    projectId.current = loaded.project.id; hydrate(loaded.document, loaded.assets); setActiveProject(loaded.project); await refresh();
  }, [enqueue, hydrate, refresh]);

  return { ready, projects, activeProject, saveNow, load, create, refresh,
    rename: async (id: string, name: string) => { await renameProject(id, name); await refresh(); },
    duplicate: async (id: string) => { const loaded = await duplicateProject(id); await refresh(); return loaded.project; },
    remove: async (id: string) => {
      const nextId = await enqueue(() => deleteProject(id));
      if (nextId && id === projectId.current) {
        projectId.current = null;
        const loaded = await enqueue(() => openProject(nextId));
        for (const asset of Object.values(useEditorStore.getState().assets)) URL.revokeObjectURL(asset.previewUrl);
        projectId.current = loaded.project.id; hydrate(loaded.document, loaded.assets); setActiveProject(loaded.project);
      }
      await refresh();
    },
    versions: listVersions,
    restore: async (versionId: string) => { const id = projectId.current; if (!id) return; const state = useEditorStore.getState(); const loaded = await restoreVersion(id, versionId, state.document, state.assets); for (const asset of Object.values(state.assets)) URL.revokeObjectURL(asset.previewUrl); hydrate(loaded.document, loaded.assets); setActiveProject(loaded.project); await refresh(); },
  };
}
