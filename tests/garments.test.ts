import { beforeEach, describe, expect, it } from 'vitest';
import { renderAtlas } from '@/lib/atlas';
import { createDocument } from '@/lib/design';
import { GARMENTS, getGarment, transferDesign } from '@/lib/garments';
import { GARMENT_ZONES, MODEL_IDS } from '@/lib/garment-types';
import { parseDesignDocument, designDocumentSchema } from '@/lib/schema';
import { useEditorStore } from '@/store/editor-store';
import { getActiveCapture, registerCapture } from '@/lib/stage-capture';
import { localPointFromAtlasUv, zoneFromAtlasUv } from '@/lib/model-manifest';

beforeEach(() =>
  useEditorStore.setState({
    document: createDocument(),
    assets: {},
    past: [],
    future: [],
    gestureStart: null,
    selectedZone: 'front',
    selectedLayerId: null,
    exportStatus: 'idle',
    stageModelId: null,
    stageStatus: 'loading',
  }),
);

describe('prendas y transferencia', () => {
  it('oculta las mangas en camisilla, conserva las capas y permite deshacer', () => {
    const store = useEditorStore.getState;
    store().setSelectedZone('sleeveLeft');
    const id = store().addTextLayer('free', 'MANGA')!;
    const original = structuredClone(store().document);
    store().changeGarment('taller-camisilla-v1');
    expect(store().selectedZone).toBe('front');
    expect(store().document.layers).toEqual(original.layers);
    store().selectLayer(id);
    store().updateLayer(id, { text: 'NO' });
    expect(store().selectedLayerId).toBeNull();
    expect(store().document.layers).toEqual(original.layers);
    store().undo();
    expect(store().document).toEqual(original);
    store().redo();
    store().setSelectedZone('armholeLeft');
    store().addTextLayer('free', 'SISA');
    const camisilla = structuredClone(store().document);
    store().changeGarment('taller-sport-v1');
    store().changeGarment('taller-camisilla-v1');
    expect(store().document.layers).toEqual(camisilla.layers);
    expect(parseDesignDocument(store().document)).toEqual(store().document);
    store().newDesign();
    expect(store().document.modelId).toBe('taller-camisilla-v1');
    expect(store().document.layers).toEqual([]);
  });
  it('recupera el hoodie V2 anterior y añade el bolsillo sin alterar el diseño', () => {
    const source = createDocument('taller-hoodie-v1');
    source.zones.front.color = '#123456';
    delete (source.zones as Partial<typeof source.zones>).pocket;
    const restored = parseDesignDocument(source);
    expect(restored.zones.pocket.color).toBe('#123456');
    expect(restored.zones.pocket.pattern).toBeNull();
    expect(restored.layers).toEqual(source.layers);
    expect(restored.zones.front).toEqual(source.zones.front);
    expect(source.zones.pocket).toBeUndefined();
    const invalid = structuredClone(source);
    delete (invalid.zones as Partial<typeof invalid.zones>).hood;
    expect(() => parseDesignDocument(invalid)).toThrow();
  });

  it('conserva el bolsillo al pasar por camibuso y deshacer el cambio', () => {
    const store = useEditorStore.getState;
    store().changeGarment('taller-hoodie-v1');
    store().setSelectedZone('pocket');
    const id = store().addTextLayer('free', 'BOLSILLO')!;
    store().updateLayer(id, { transform: { scale: 1.2, rotation: 15 } });
    const original = structuredClone(store().document);
    store().changeGarment('taller-camibuso-v1');
    expect(store().selectedZone).toBe('front');
    expect(store().document.layers).toEqual(original.layers);
    store().undo();
    expect(store().document).toEqual(original);
    store().redo();
    store().changeGarment('taller-hoodie-v1');
    expect(store().document.layers).toEqual(original.layers);
  });
  it.each(MODEL_IDS)('crea y serializa %s con sus zonas', (modelId) => {
    const document = createDocument(modelId);
    expect(parseDesignDocument(JSON.parse(JSON.stringify(document)))).toEqual(
      document,
    );
    expect(Object.keys(document.zones).sort()).toEqual(
      [...GARMENT_ZONES[modelId]].sort(),
    );
    expect(
      Object.keys(getGarment(modelId).manifest.atlas.zones).sort(),
    ).toEqual([...GARMENT_ZONES[modelId]].sort());
  });

  it('migra V1 conservando todos los valores de la camiseta', () => {
    const document = createDocument();
    document.zones.front.color = '#123456';
    const legacy = { ...document, schemaVersion: 1 };
    expect(parseDesignDocument(legacy)).toEqual(document);
    expect(() =>
      parseDesignDocument({ ...legacy, modelId: 'taller-hoodie-v1' }),
    ).toThrow();
  });

  it('rechaza modelos, zonas y capas sin una zona guardada', () => {
    const document = createDocument();
    expect(
      designDocumentSchema.safeParse({ ...document, modelId: 'unknown' })
        .success,
    ).toBe(false);
    expect(
      designDocumentSchema.safeParse({
        ...document,
        zones: { ...document.zones, unknown: document.zones.front },
      }).success,
    ).toBe(false);
    const hoodie = createDocument('taller-hoodie-v1');
    delete (hoodie.zones as Partial<typeof hoodie.zones>).hood;
    expect(designDocumentSchema.safeParse(hoodie).success).toBe(false);
  });

  it('transfiere estilos y conserva capucha y recursos al cambiar de prenda', () => {
    const store = useEditorStore.getState;
    store().setZoneColor('front', '#123456');
    store().changeGarment('taller-hoodie-v1');
    expect(store().document.zones.hood.color).toBe('#123456');
    expect(store().document.zones.hood.pattern).toBeNull();
    store().setSelectedZone('hood');
    const id = store().addTextLayer('free', 'CAPUCHA')!;
    store().updateLayer(id, { transform: { scale: 1.7, rotation: 27 } });
    const layer = structuredClone(store().document.layers[0]);
    store().changeGarment('taller-sport-v1');
    expect(store().selectedZone).toBe('front');
    expect(store().document.layers[0]).toEqual(layer);
    store().updateLayer(id, { text: 'NO' });
    store().selectLayer(id);
    expect(store().selectedLayerId).toBeNull();
    expect(store().document.layers[0]).toEqual(layer);
    store().setAllZoneColors('#FFFFFF');
    expect(store().document.zones.hood.color).toBe('#123456');
    store().changeGarment('taller-hoodie-v1');
    expect(store().document.layers[0]).toEqual(layer);
    expect(store().document.zones.hood.color).toBe('#123456');
  });

  it('un cambio constituye un paso del historial y reinicia la disponibilidad del visor', () => {
    const store = useEditorStore.getState;
    store().setStageStatus('taller-sport-v1', 'ready');
    store().changeGarment('taller-camibuso-v1');
    expect(store().past).toHaveLength(1);
    expect(store().stageStatus).toBe('loading');
    store().setStageStatus('taller-sport-v1', 'ready');
    expect(store().stageModelId).toBeNull();
    store().undo();
    expect(store().document.modelId).toBe('taller-sport-v1');
    store().redo();
    expect(store().document.modelId).toBe('taller-camibuso-v1');
    store().newDesign();
    expect(store().document.modelId).toBe('taller-camibuso-v1');
    expect(store().past).toHaveLength(0);
  });

  it('bloquea cambios de prenda durante la exportación', () => {
    const store = useEditorStore.getState;
    store().setExportStatus('working');
    store().changeGarment('taller-hoodie-v1');
    expect(store().document.modelId).toBe('taller-sport-v1');
    expect(store().past).toHaveLength(0);
  });

  it('conserva el límite de 20 elementos aunque las capas no estén disponibles', () => {
    const store = useEditorStore.getState;
    store().changeGarment('taller-hoodie-v1');
    store().setSelectedZone('hood');
    for (let i = 0; i < 20; i++) store().addTextLayer('free', String(i));
    store().changeGarment('taller-sport-v1');
    expect(store().addTextLayer('free', '21')).toBeNull();
    expect(parseDesignDocument(store().document).layers).toHaveLength(20);
  });

  it('ajusta posiciones al área segura sin cambiar escala ni rotación', () => {
    const store = useEditorStore.getState;
    const id = store().addTextLayer('free', 'Texto')!;
    store().updateLayer(id, {
      transform: { x: 0.2, y: 0.8, scale: 2, rotation: 35 },
    });
    const source = structuredClone(store().document);
    for (const modelId of MODEL_IDS) {
      const result = transferDesign(source, modelId);
      expect(result.layers[0].transform).toMatchObject({
        scale: 2,
        rotation: 35,
      });
      expect(result.id).toBe(source.id);
      expect(result.layers[0].id).toBe(id);
    }
    expect(source.modelId).toBe('taller-sport-v1');
  });
});

describe('aislamiento de mapas y capturas', () => {
  it('excluye del atlas las capas conservadas y las vuelve a dibujar en una prenda compatible', () => {
    const store = useEditorStore.getState;
    store().changeGarment('taller-hoodie-v1');
    store().setSelectedZone('hood');
    store().addTextLayer('free', 'CAPUCHA');
    store().changeGarment('taller-sport-v1');
    const drawn: string[] = [];
    const context = new Proxy(
      {
        measureText: () => ({ width: 80 }),
        fillText: (value: string) => drawn.push(value),
      } as unknown as CanvasRenderingContext2D,
      {
        get: (target, property) => Reflect.get(target, property) ?? (() => {}),
      },
    );
    const canvas = {
      width: 1024,
      getContext: () => context,
    } as unknown as HTMLCanvasElement;
    renderAtlas(canvas, store().document, {}, {});
    expect(drawn).toEqual([]);
    store().changeGarment('taller-hoodie-v1');
    renderAtlas(
      canvas,
      store().document,
      {},
      {},
      null,
      null,
      getGarment('taller-hoodie-v1').manifest,
    );
    expect(drawn).toEqual(['CAPUCHA']);
  });
  it('no habilita la exportación tras un error hasta reiniciar la carga', () => {
    const store = useEditorStore.getState;
    store().changeGarment('taller-hoodie-v1');
    store().setStageStatus('taller-hoodie-v1', 'error');
    store().setStageStatus('taller-hoodie-v1', 'ready');
    expect(store().stageStatus).toBe('error');
    store().setStageStatus('taller-hoodie-v1', 'loading');
    store().setStageStatus('taller-hoodie-v1', 'ready');
    expect(store().stageStatus).toBe('ready');
  });
  it('las coordenadas UV de cada zona nueva se convierten con su propio mapa', () => {
    for (const garment of GARMENTS.filter(
      (item) => item.id !== 'taller-sport-v1',
    )) {
      for (const zone of GARMENT_ZONES[garment.id]) {
        const { rect } = garment.manifest.atlas.zones[zone];
        const u = rect.x + rect.width / 2,
          v = rect.y + rect.height / 2;
        expect(zoneFromAtlasUv(u, v, garment.manifest)).toBe(zone);
        expect(
          localPointFromAtlasUv(zone, u, v, undefined, garment.manifest),
        ).toEqual({ x: expect.closeTo(0.5), y: expect.closeTo(0.5) });
      }
    }
  });

  it('ignora desmontajes anteriores y rechaza capturas de una prenda distinta', () => {
    const first = async () => {
      throw new Error('old');
    };
    const second = async () => {
      throw new Error('new');
    };
    const cleanup = registerCapture('taller-hoodie-v1', first);
    const cleanupSecond = registerCapture('taller-camibuso-v1', second);
    cleanup();
    expect(getActiveCapture('taller-camibuso-v1')).toBe(second);
    expect(() => getActiveCapture('taller-hoodie-v1')).toThrow();
    cleanupSecond();
    expect(() => getActiveCapture('taller-camibuso-v1')).toThrow();
  });
});
