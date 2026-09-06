import 'fake-indexeddb/auto';
import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDocument, type ViewId } from '@/lib/design';
import { transferDesign, getGarment } from '@/lib/garments';
import { MODEL_IDS } from '@/lib/garment-types';
import {
  clearSession,
  loadSession,
  saveSession,
  type AssetRecord,
} from '@/lib/persistence';
import { exportProject, importProject } from '@/lib/project-io';

afterEach(async () => {
  vi.unstubAllGlobals();
  await clearSession();
});
const views = Object.fromEntries(
  (['front', 'back', 'left', 'right'] as ViewId[]).map((view) => [
    view,
    new Blob(['png'], { type: 'image/png' }),
  ]),
) as Record<ViewId, Blob>;

function retainedImage() {
  const hoodie = createDocument('taller-hoodie-v1');
  const id = crypto.randomUUID();
  const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' });
  const asset: AssetRecord = {
    id,
    fileName: 'logo.png',
    mime: 'image/png',
    width: 1,
    height: 1,
    originalBlob: blob,
    renderBlob: blob,
    previewUrl: URL.createObjectURL(blob),
    createdAt: new Date().toISOString(),
  };
  hoodie.layers.push({
    id: crypto.randomUUID(),
    zone: 'hood',
    type: 'image',
    name: 'logo.png',
    assetId: id,
    order: 0,
    visible: true,
    locked: false,
    transform: { x: 0.5, y: 0.5, scale: 1, rotation: 20 },
  });
  return { document: transferDesign(hoodie, 'taller-sport-v1'), asset };
}

describe('persistencia y archivos de prendas', () => {
  it('autoguarda las imágenes de zonas conservadas y permite recuperarlas', async () => {
    const { document, asset } = retainedImage();
    await saveSession(document, { [asset.id]: asset });
    const session = await loadSession();
    expect(session.document).toEqual(document);
    expect(await session.assets[asset.id].originalBlob.arrayBuffer()).toEqual(
      await asset.originalBlob.arrayBuffer(),
    );
    expect(
      transferDesign(session.document!, 'taller-hoodie-v1').layers[0].zone,
    ).toBe('hood');
    URL.revokeObjectURL(asset.previewUrl);
    URL.revokeObjectURL(session.assets[asset.id].previewUrl);
  });

  it.each(MODEL_IDS)(
    'exporta e importa %s con los créditos de su modelo',
    async (modelId) => {
      const document = createDocument(modelId);
      const exported = await exportProject(document, {}, views);
      const zip = await JSZip.loadAsync(await exported.arrayBuffer());
      expect(
        await zip.file('LICENCIA-Y-CREDITOS.txt')!.async('string'),
      ).toContain(getGarment(modelId).manifest.source.author);
      const restored = await importProject(
        new File([exported], 'prenda.zip', { type: 'application/zip' }),
      );
      expect(restored.document).toEqual(document);
    },
  );

  it('incluye e importa el recurso original aunque su zona no exista en la prenda activa', async () => {
    // Only browser image decoding is substituted; ZIP, validation and IDB use their real implementations.
    vi.stubGlobal(
      'Image',
      class {
        naturalWidth = 1;
        naturalHeight = 1;
        onload: (() => void) | null = null;
        set src(_value: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    );
    const { document, asset } = retainedImage();
    const exported = await exportProject(
      document,
      { [asset.id]: asset },
      views,
    );
    const restored = await importProject(
      new File([exported], 'prenda.zip', { type: 'application/zip' }),
    );
    expect(restored.document).toEqual(document);
    expect(await restored.assets[asset.id].originalBlob.arrayBuffer()).toEqual(
      await asset.originalBlob.arrayBuffer(),
    );
    URL.revokeObjectURL(asset.previewUrl);
    URL.revokeObjectURL(restored.assets[asset.id].previewUrl);
  });
});
