import { describe, expect, it } from 'vitest';

import { getLayerFrame, hitTestLayerHandle, type LayerFrame } from '@/lib/atlas';
import type { ImageLayer, TextLayer } from '@/lib/design';

const rect = { x: 0.1, y: 0.2, width: 0.5, height: 0.6 };
const context = { measureText: (value: string) => ({ width: value.length * 0.02 }) } as CanvasRenderingContext2D;

function imageLayer(scale = 1): ImageLayer {
  return {
    id: 'image', type: 'image', assetId: 'asset', name: 'logo', zone: 'front', order: 0,
    visible: true, locked: false, transform: { x: 0.5, y: 0.5, scale, rotation: 0 },
  };
}

describe('handles de capas', () => {
  it('detecta las cuatro esquinas y rechaza el exterior', () => {
    const frame = getLayerFrame(context, rect, imageLayer(), 2);
    const handles = [
      ['top-left', frame.x - frame.width / 2, frame.y - frame.height / 2],
      ['top-right', frame.x + frame.width / 2, frame.y - frame.height / 2],
      ['bottom-right', frame.x + frame.width / 2, frame.y + frame.height / 2],
      ['bottom-left', frame.x - frame.width / 2, frame.y + frame.height / 2],
    ] as const;
    for (const [handle, x, y] of handles) expect(hitTestLayerHandle(frame, x, y, 0, 0.01)).toBe(handle);
    expect(hitTestLayerHandle(frame, frame.x, frame.y, 0, 0.01)).toBeNull();
  });

  it('detecta handles después de rotar la capa', () => {
    const frame = getLayerFrame(context, rect, imageLayer(), 1);
    const radians = Math.PI / 4;
    const x = frame.x - (frame.width / 2) * Math.cos(radians) + (frame.height / 2) * Math.sin(radians);
    const y = frame.y - (frame.width / 2) * Math.sin(radians) - (frame.height / 2) * Math.cos(radians);
    expect(hitTestLayerHandle(frame, x, y, 45, 0.01)).toBe('top-left');
  });

  it('calcula el marco de texto usando su contenido', () => {
    const layer: TextLayer = {
      id: 'text', type: 'text', subtype: 'free', text: 'Hola', font: 'Inter', color: '#fff', background: null,
      zone: 'front', order: 0, visible: true, locked: false, transform: { x: 0.25, y: 0.75, scale: 1, rotation: 0 },
    };
    const frame: LayerFrame = getLayerFrame(context, rect, layer);
    expect(frame.x).toBeCloseTo(0.225);
    expect(frame.y).toBeCloseTo(0.65);
    expect(frame.width).toBeGreaterThan(0);
    expect(frame.height).toBeGreaterThan(0);
  });
});
