import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';

import { createDocument } from '@/lib/design';
import { clearSession, createProject, deleteProject, getActiveProject, listProjects, listVersions, loadSession, restoreVersion, saveProject, saveSession, saveVersion, type AssetRecord } from '@/lib/persistence';

describe('persistencia local', () => {
  afterEach(async () => clearSession());

  it('no conserva blobs que ya no están referenciados por el diseño', async () => {
    const document = createDocument();
    const usedId = crypto.randomUUID();
    const orphanId = crypto.randomUUID();
    document.layers.push({
      id: crypto.randomUUID(), type: 'image', assetId: usedId, name: 'logo.png', zone: 'front', order: 0,
      visible: true, locked: false, transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0 },
    });
    const asset = (id: string): AssetRecord => ({
      id, fileName: 'logo.png', mime: 'image/png', width: 1, height: 1,
      originalBlob: new Blob(['x'], { type: 'image/png' }), renderBlob: new Blob(['x'], { type: 'image/png' }),
      previewUrl: URL.createObjectURL(new Blob(['x'])), createdAt: new Date().toISOString(),
    });
    await saveSession(document, { [usedId]: asset(usedId), [orphanId]: asset(orphanId) });
    const restored = await loadSession();
    expect(Object.keys(restored.assets)).toEqual([usedId]);
    for (const item of Object.values(restored.assets)) URL.revokeObjectURL(item.previewUrl);
  });
});

describe('biblioteca de proyectos', () => {
  afterEach(async () => clearSession());

  it('mantiene proyectos independientes y restaura una versión sin perder el estado actual', async () => {
    const first = createDocument();
    const created = await createProject('Equipo azul', first, {});
    first.zones.front.color = '#123456';
    await saveProject(created.project.id, first, {});
    const version = await saveVersion(created.project.id, first, {}, null);
    first.zones.front.color = '#ABCDEF';
    await saveProject(created.project.id, first, {});
    const second = await createProject('Equipo rojo', createDocument(), {});
    expect((await listProjects(createDocument())).map((project) => project.name)).toContain('Equipo azul');
    expect((await getActiveProject(createDocument())).project.id).toBe(second.project.id);
    await restoreVersion(created.project.id, version.id, first, {});
    expect((await listVersions(created.project.id)).length).toBeGreaterThanOrEqual(2);
  });

  it('elimina un proyecto y activa el proyecto restante', async () => {
    const first = await createProject('Primero', createDocument(), {});
    const second = await createProject('Segundo', createDocument(), {});
    await deleteProject(second.project.id);
    expect((await listProjects(createDocument())).map((project) => project.id)).toEqual([first.project.id]);
    expect((await getActiveProject(createDocument())).project.id).toBe(first.project.id);
    await expect(deleteProject(first.project.id)).rejects.toThrow('Debe permanecer');
  });
});
