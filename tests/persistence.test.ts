import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';

import { createDocument } from '@/lib/design';
import { clearSession, loadSession, saveSession, type AssetRecord } from '@/lib/persistence';

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
