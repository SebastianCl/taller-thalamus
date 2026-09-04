'use client';

import { useCallback, useEffect, useState } from 'react';

import { loadSession, saveSession } from '@/lib/persistence';
import { parseDesignDocument } from '@/lib/schema';
import { useEditorStore } from '@/store/editor-store';

export function useAutosave() {
  const document = useEditorStore((state) => state.document);
  const assets = useEditorStore((state) => state.assets);
  const hydrate = useEditorStore((state) => state.hydrate);
  const setAutosaveStatus = useEditorStore((state) => state.setAutosaveStatus);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    const initialDocument = useEditorStore.getState().document;
    void loadSession()
      .then((session) => {
        if (!active) return;
        if (session.document) {
          const current = useEditorStore.getState().document;
          const unchangedSinceMount = current.id === initialDocument.id && current.modifiedAt === initialDocument.modifiedAt;
          try {
            const parsed = parseDesignDocument(session.document);
            if (unchangedSinceMount) hydrate(parsed, session.assets);
            else for (const asset of Object.values(session.assets)) URL.revokeObjectURL(asset.previewUrl);
          } catch {
            for (const asset of Object.values(session.assets)) URL.revokeObjectURL(asset.previewUrl);
          }
        }
        setReady(true);
        setAutosaveStatus('saved');
      })
      .catch(() => {
        if (!active) return;
        setReady(true);
        setAutosaveStatus('error');
      });
    return () => { active = false; };
  }, [hydrate, setAutosaveStatus]);

  useEffect(() => {
    if (!ready) return;
    setAutosaveStatus('saving');
    const timeout = window.setTimeout(() => {
      void saveSession(document, assets)
        .then(() => setAutosaveStatus('saved'))
        .catch(() => setAutosaveStatus('error'));
    }, 750);
    return () => window.clearTimeout(timeout);
  }, [assets, document, ready, setAutosaveStatus]);

  return useCallback(async () => {
    setAutosaveStatus('saving');
    try {
      const state = useEditorStore.getState();
      await saveSession(state.document, state.assets);
      setAutosaveStatus('saved');
    } catch (error) {
      setAutosaveStatus('error');
      throw error;
    }
  }, [setAutosaveStatus]);
}
