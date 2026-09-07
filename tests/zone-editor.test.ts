import { beforeEach, describe, expect, it } from 'vitest';
import { getLayerFrame, pixelRects } from '@/lib/atlas';
import { createDocument } from '@/lib/design';
import { GARMENT_ZONES, MODEL_IDS } from '@/lib/garment-types';
import { getGarment } from '@/lib/garments';
import {
  containsLayer,
  fitZone,
  framePoint,
  resizeLayer,
  rotationDelta,
  screenToZone,
} from '@/lib/zone-editor-geometry';
import { useEditorStore } from '@/store/editor-store';

describe('geometría del editor 2D', () => {
  const rect = { x: 0, y: 0, width: 300, height: 400 };
  const frame = { x: 150, y: 200, width: 100, height: 40 };

  it.each([0.5, 1, 4])(
    'convierte coordenadas con zoom %s y lienzo centrado',
    (zoom) => {
      const viewport = fitZone(700, 550, rect, zoom);
      const point = screenToZone(
        {
          x: viewport.x + 70 * viewport.scale,
          y: viewport.y + 120 * viewport.scale,
        },
        viewport,
      );
      expect(point.x).toBeCloseTo(70);
      expect(point.y).toBeCloseTo(120);
    },
  );

  it('selecciona el rectángulo rotado, no su envolvente sin rotar', () => {
    expect(containsLayer(frame, { x: 150, y: 245 }, 90)).toBe(true);
    expect(containsLayer(frame, { x: 195, y: 200 }, 90)).toBe(false);
  });

  it.each([0, 45, 135])(
    'escala proporcionalmente con ancla fija a %s grados',
    (rotation) => {
      const anchor = framePoint(frame, { x: -50, y: -20 }, rotation);
      const target = framePoint(frame, { x: 150, y: 60 }, rotation);
      const next = resizeLayer(frame, 'bottom-right', rotation, 1, target);
      expect(next.scale).toBeCloseTo(2);
      const newAnchor = framePoint(
        { ...frame, ...next, width: 200, height: 80 },
        { x: -100, y: -40 },
        rotation,
      );
      expect(newAnchor.x).toBeCloseTo(anchor.x);
      expect(newAnchor.y).toBeCloseTo(anchor.y);
    },
  );

  it('limita el tamaño manteniendo el ancla', () => {
    const next = resizeLayer(frame, 'bottom-right', 0, 1, {
      x: 10000,
      y: 10000,
    });
    expect(next.scale).toBe(4);
    expect(next.x - 200).toBe(frame.x - 50);
    expect(next.y - 80).toBe(frame.y - 20);
  });

  it('calcula rotación y cruza el límite de 180 grados sin saltos', () => {
    expect(rotationDelta({ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 0 })).toBe(
      90,
    );
    const angle = (degrees: number) => ({
      x: Math.cos((degrees * Math.PI) / 180),
      y: Math.sin((degrees * Math.PI) / 180),
    });
    expect(rotationDelta(angle(179), angle(-179), { x: 0, y: 0 })).toBeCloseTo(
      2,
    );
  });

  it.each(MODEL_IDS)(
    'usa las proporciones del atlas para todas las zonas de %s',
    (modelId) => {
      const manifest = getGarment(modelId).manifest;
      for (const zone of GARMENT_ZONES[modelId]) {
        const [source] = pixelRects(zone, 1024, null, manifest);
        expect(source.width).toBeGreaterThan(0);
        expect(source.height).toBeGreaterThan(0);
        const viewport = fitZone(320, 200, source, 1);
        expect(Number.isFinite(viewport.scale)).toBe(true);
        expect(source.width * viewport.scale).toBeLessThanOrEqual(320);
        expect(source.height * viewport.scale).toBeLessThanOrEqual(200);
      }
    },
  );

  it('respeta el rectángulo principal derivado de una máscara con regiones secundarias', () => {
    const mask = {
      rects: {
        sideLeft: [
          { x: 0.1, y: 0.2, width: 0.03, height: 0.5 },
          { x: 0.8, y: 0.2, width: 0.03, height: 0.5 },
        ],
      },
    };
    const rects = pixelRects(
      'sideLeft',
      1024,
      mask as Parameters<typeof pixelRects>[2],
    );
    expect(rects).toHaveLength(2);
    expect(rects[0]).toEqual({ x: 102, y: 205, width: 31, height: 512 });
  });
});

describe('gestos 2D e historial compartido', () => {
  beforeEach(() =>
    useEditorStore.setState({
      document: createDocument(),
      assets: {},
      past: [],
      future: [],
      gestureStart: null,
      selectedLayerId: null,
      selectedZone: 'front',
      exportStatus: 'idle',
    }),
  );
  const state = () => useEditorStore.getState();

  it('agrupa transformaciones y permite deshacer y rehacer desde el estado compartido', () => {
    const id = state().addTextLayer('free', 'Taller')!;
    const before = structuredClone(state().document);
    state().beginGesture();
    state().updateLayerTransformLive(id, { x: 0.6, y: 0.5 });
    state().updateLayerTransformLive(id, { scale: 1.5, rotation: 45 });
    state().endGesture();
    const after = structuredClone(state().document);
    expect(state().past).toHaveLength(2);
    state().undo();
    expect(state().document).toEqual(before);
    state().redo();
    expect(state().document).toEqual(after);
    expect(after.schemaVersion).toBe(2);
  });

  it('Escape restaura el documento sin crear historial y conserva rehacer', () => {
    const id = state().addTextLayer('free', 'Taller')!;
    state().updateLayer(id, { transform: { rotation: 30 } });
    state().undo();
    const before = state().document;
    const future = state().future;
    state().beginGesture();
    state().updateLayerTransformLive(id, { rotation: 80 });
    state().cancelGesture();
    expect(state().document).toEqual(before);
    expect(state().future).toEqual(future);
    expect(state().past).toHaveLength(1);
    expect(state().gestureStart).toBeNull();
  });

  it('no añade historial al seleccionar sin mover', () => {
    const id = state().addTextLayer('free', 'Taller')!;
    state().beginGesture();
    state().updateLayerTransformLive(id, state().document.layers[0].transform);
    state().endGesture();
    expect(state().past).toHaveLength(1);
  });

  it('no transforma capas bloqueadas, ocultas ni durante la exportación', () => {
    const id = state().addTextLayer('free', 'Taller')!;
    for (const property of ['locked', 'visible'] as const) {
      state().toggleLayer(id, property);
      const before = state().document;
      state().beginGesture();
      state().updateLayerTransformLive(id, { rotation: 90 });
      state().endGesture();
      expect(state().document).toEqual(before);
      state().toggleLayer(id, property);
    }
    state().setExportStatus('working');
    const before = state().document;
    state().beginGesture();
    state().updateLayerTransformLive(id, { rotation: 90 });
    state().endGesture();
    expect(state().document).toEqual(before);
  });

  it('finaliza el gesto al cambiar de zona', () => {
    const id = state().addTextLayer('free', 'Taller')!;
    state().beginGesture();
    state().updateLayerTransformLive(id, { rotation: 45 });
    state().setSelectedZone('back');
    expect(state().gestureStart).toBeNull();
    expect(state().past).toHaveLength(2);
    state().undo();
    expect(state().document.layers[0].transform.rotation).toBe(0);
  });

  it.each(MODEL_IDS)(
    'conserva el diseño y geometría al cambiar a %s',
    (modelId) => {
      const id = state().addTextLayer('free', 'Taller')!;
      state().beginGesture();
      state().updateLayerTransformLive(id, { rotation: 25 });
      state().endGesture();
      state().changeGarment(modelId);
      const layer = state().document.layers.find((item) => item.id === id)!;
      expect(layer.transform.rotation).toBe(25);
      const rect = pixelRects(
        'front',
        1024,
        null,
        getGarment(modelId).manifest,
      )[0];
      const ctx = {
        measureText: () => ({ width: 30 }),
      } as unknown as CanvasRenderingContext2D;
      const frame = getLayerFrame(ctx, { ...rect, x: 0, y: 0 }, layer);
      expect(frame.x).toBeCloseTo(layer.transform.x * rect.width);
      expect(frame.y).toBeCloseTo(layer.transform.y * rect.height);
    },
  );
});
