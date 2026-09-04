import { beforeEach, describe, expect, it } from 'vitest';

import { createDocument } from '@/lib/design';
import { useEditorStore } from '@/store/editor-store';

describe('historial del editor', () => {
  beforeEach(() => {
    useEditorStore.setState({ document: createDocument(), assets: {}, past: [], future: [], gestureStart: null, selectedLayerId: null });
  });

  it('deshace y rehace una plantilla', () => {
    const initial = useEditorStore.getState().document.zones.front.color;
    useEditorStore.getState().applyTemplate('duotone');
    expect(useEditorStore.getState().document.zones.front.color).toBe('#102A43');
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().document.zones.front.color).toBe(initial);
    useEditorStore.getState().redo();
    expect(useEditorStore.getState().document.zones.front.color).toBe('#102A43');
  });

  it('registra un arrastre completo como una sola operación', () => {
    const id = useEditorStore.getState().addTextLayer('free', 'Prueba')!;
    const historyBefore = useEditorStore.getState().past.length;
    useEditorStore.getState().beginGesture();
    useEditorStore.getState().updateLayerLive(id, 0.4, 0.4);
    useEditorStore.getState().updateLayerLive(id, 0.45, 0.46);
    useEditorStore.getState().updateLayerLive(id, 0.52, 0.51);
    useEditorStore.getState().endGesture();
    expect(useEditorStore.getState().past.length).toBe(historyBefore + 1);
  });

  it('aplica el límite de 20 elementos', () => {
    for (let index = 0; index < 20; index += 1) useEditorStore.getState().addTextLayer('number', String(index));
    expect(useEditorStore.getState().document.layers).toHaveLength(20);
    expect(useEditorStore.getState().addTextLayer('free', 'Extra')).toBeNull();
  });

  it('respeta el bloqueo y limita la posición al polígono seguro', () => {
    const id = useEditorStore.getState().addTextLayer('free', 'Seguro')!;
    useEditorStore.getState().updateLayer(id, { transform: { x: -3, y: 9 } });
    const clamped = useEditorStore.getState().document.layers[0];
    expect(clamped.transform.x).toBeGreaterThanOrEqual(0);
    expect(clamped.transform.y).toBeLessThanOrEqual(1);
    useEditorStore.getState().toggleLayer(id, 'locked');
    useEditorStore.getState().updateLayer(id, { transform: { x: 0.5, y: 0.5 } });
    expect(useEditorStore.getState().document.layers[0].transform).toEqual(clamped.transform);
  });

  it('renumera el orden después de eliminar una capa', () => {
    const first = useEditorStore.getState().addTextLayer('free', 'Uno')!;
    useEditorStore.getState().addTextLayer('free', 'Dos');
    useEditorStore.getState().addTextLayer('free', 'Tres');
    useEditorStore.getState().removeLayer(first);
    expect(useEditorStore.getState().document.layers.map((layer) => layer.order)).toEqual([0, 1]);
  });

  it('no registra un gesto sin movimiento', () => {
    useEditorStore.getState().addTextLayer('free', 'Quieto');
    const before = useEditorStore.getState().past.length;
    useEditorStore.getState().beginGesture();
    useEditorStore.getState().endGesture();
    expect(useEditorStore.getState().past.length).toBe(before);
  });
});
