import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { createDocument, type ViewId } from '@/lib/design';
import { exportProject, importProject } from '@/lib/project-io';
import type { AssetRecord } from '@/lib/persistence';

describe('exportación de proyecto', () => {
  it('incluye documento, manifiesto, créditos y cuatro vistas', async () => {
    const document = createDocument();
    document.zones.front.pattern = 'stripes';
    const image = new Blob(['png'], { type: 'image/png' });
    const views = Object.fromEntries((['front', 'back', 'left', 'right'] as ViewId[]).map((view) => [view, image])) as Record<ViewId, Blob>;
    const result = await exportProject(document, {}, views);
    const zip = await JSZip.loadAsync(await result.arrayBuffer());
    expect(zip.file('design.json')).toBeTruthy();
    expect(zip.file('assets/manifest.json')).toBeTruthy();
    expect(zip.file('LICENCIA-Y-CREDITOS.txt')).toBeTruthy();
    for (const view of ['front', 'back', 'left', 'right']) expect(zip.file(`vistas/${view}.png`)).toBeTruthy();
    const restored = JSON.parse(await zip.file('design.json')!.async('string'));
    expect(restored.zones.front.pattern).toBe('stripes');
  });

  it('exporta únicamente recursos usados y permite round-trip', async () => {
    const document = createDocument();
    const usedId = crypto.randomUUID();
    const orphanId = crypto.randomUUID();
    document.layers.push({
      id: crypto.randomUUID(), type: 'image', assetId: usedId, name: 'logo.png', zone: 'front', order: 0,
      visible: true, locked: false, transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0 },
    });
    const makeAsset = (id: string): AssetRecord => ({
      id, fileName: 'logo.png', mime: 'image/png', width: 1, height: 1,
      originalBlob: new Blob(['png'], { type: 'image/png' }), renderBlob: new Blob(['png'], { type: 'image/png' }),
      previewUrl: `blob:${id}`, createdAt: new Date().toISOString(),
    });
    const view = new Blob(['png'], { type: 'image/png' });
    const views = Object.fromEntries((['front', 'back', 'left', 'right'] as ViewId[]).map((name) => [name, view])) as Record<ViewId, Blob>;
    const result = await exportProject(document, { [usedId]: makeAsset(usedId), [orphanId]: makeAsset(orphanId) }, views);
    const zip = await JSZip.loadAsync(await result.arrayBuffer());
    const manifest = JSON.parse(await zip.file('assets/manifest.json')!.async('string'));
    expect(manifest).toHaveLength(1);
    expect(manifest[0].id).toBe(usedId);
  });

  it('reimporta un proyecto sin recursos con el mismo documento', async () => {
    const document = createDocument();
    document.zones.back.color = '#123456';
    const image = new Blob(['png'], { type: 'image/png' });
    const views = Object.fromEntries((['front', 'back', 'left', 'right'] as ViewId[]).map((view) => [view, image])) as Record<ViewId, Blob>;
    const exported = await exportProject(document, {}, views);
    const restored = await importProject(new File([exported], 'diseno-camiseta.zip', { type: 'application/zip' }));
    expect(restored.document).toEqual(document);
    expect(Object.keys(restored.assets)).toHaveLength(0);
  });
});
