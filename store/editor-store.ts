'use client';

import { create } from 'zustand';
import type { AssetRecord } from '@/lib/persistence';
import {
  createDocument,
  TEMPLATES,
  ZONE_IDS,
  type DesignDocument,
  type LayerTransform,
  type TextLayer,
  type ToolId,
  type ViewId,
  type ZoneId,
  type ZoneStyle,
} from '@/lib/design';
import { clampToSafeZone } from '@/lib/model-manifest';

type LayerPatch = {
  zone?: ZoneId;
  order?: number;
  visible?: boolean;
  locked?: boolean;
  transform?: Partial<LayerTransform>;
  assetId?: string;
  name?: string;
  subtype?: TextLayer['subtype'];
  text?: string;
  font?: string;
  color?: string;
  background?: string | null;
};

type EditorState = {
  document: DesignDocument;
  assets: Record<string, AssetRecord>;
  past: DesignDocument[];
  future: DesignDocument[];
  gestureStart: DesignDocument | null;
  activeTool: ToolId;
  selectedZone: ZoneId;
  selectedLayerId: string | null;
  view: ViewId;
  interactionMode: 'move' | 'rotate';
  autosaveStatus: 'loading' | 'saved' | 'saving' | 'error';
  exportStatus: 'idle' | 'working';
  setActiveTool: (tool: ToolId) => void;
  setSelectedZone: (zone: ZoneId) => void;
  selectLayer: (id: string | null) => void;
  setView: (view: ViewId) => void;
  setInteractionMode: (mode: 'move' | 'rotate') => void;
  setAutosaveStatus: (status: EditorState['autosaveStatus']) => void;
  setExportStatus: (status: EditorState['exportStatus']) => void;
  hydrate: (document: DesignDocument, assets: Record<string, AssetRecord>) => void;
  newDesign: () => void;
  applyTemplate: (templateId: string) => void;
  updateZoneStyle: (zone: ZoneId, patch: Partial<ZoneStyle>, history?: boolean) => void;
  setZoneColor: (zone: ZoneId, color: string) => void;
  setAllZoneColors: (color: string) => void;
  addTextLayer: (subtype: TextLayer['subtype'], text: string, font?: string) => string | null;
  addImageLayer: (asset: AssetRecord) => string | null;
  updateLayer: (id: string, patch: LayerPatch, history?: boolean) => void;
  duplicateLayer: (id: string) => void;
  removeLayer: (id: string) => void;
  toggleLayer: (id: string, property: 'visible' | 'locked') => void;
  moveLayerOrder: (id: string, direction: -1 | 1) => void;
  centerLayer: (id: string) => void;
  beginGesture: () => void;
  updateLayerLive: (id: string, x: number, y: number) => void;
  updateLayerResizeLive: (id: string, scale: number, x: number, y: number) => void;
  endGesture: () => void;
  replaceImportedDesign: (document: DesignDocument, assets: Record<string, AssetRecord>) => void;
  undo: () => void;
  redo: () => void;
};

const stamp = (document: DesignDocument): DesignDocument => ({
  ...document,
  modifiedAt: new Date().toISOString(),
});

const baseStyle = () => createDocument().zones.front;

function resetTemplate(document: DesignDocument, templateId: string) {
  document.templateId = templateId;
  for (const zone of ZONE_IDS) document.zones[zone] = structuredClone(baseStyle());
  const template = TEMPLATES.find((item) => item.id === templateId);
  if (template) {
    const apply = template.apply as Partial<Record<ZoneId, string>>;
    for (const zone of Object.keys(template.apply) as ZoneId[]) {
      document.zones[zone].color = apply[zone] ?? document.zones[zone].color;
    }
  }
  if (templateId === 'duotone') {
    document.zones.sideLeft.color = '#071A2F';
    document.zones.sideRight.color = '#071A2F';
    document.zones.collar.color = '#00A7C4';
  }
  if (templateId === 'shoulders') {
    document.zones.front.gradient = { from: '#E8EDF4', to: '#CBD8E8', angle: 90, offset: -0.15 };
    document.zones.back.gradient = { from: '#E8EDF4', to: '#CBD8E8', angle: 90, offset: -0.15 };
  }
  if (templateId === 'diagonal') {
    document.zones.front.gradient = { from: '#0F2B5B', to: '#F35B04', angle: 32, offset: 0.18 };
    document.zones.back.gradient = { from: '#0F2B5B', to: '#F35B04', angle: 32, offset: 0.18 };
  }
  if (templateId === 'stripe') {
    for (const zone of ['front', 'back'] as ZoneId[]) {
      document.zones[zone].pattern = 'hoops';
      document.zones[zone].patternColor = '#159947';
      document.zones[zone].patternOpacity = 0.86;
      document.zones[zone].patternScale = 1.45;
    }
  }
}

function commit(state: EditorState, change: (document: DesignDocument) => void) {
  const document = structuredClone(state.document);
  change(document);
  return {
    document: stamp(document),
    past: [...state.past, state.document].slice(-50),
    future: [],
  };
}

function patchLayer(document: DesignDocument, id: string, patch: LayerPatch) {
  const layer = document.layers.find((item) => item.id === id);
  if (!layer) return;
  const zone = patch.zone ?? layer.zone;
  if (patch.transform) {
    const transform = { ...layer.transform, ...patch.transform };
    const point = clampToSafeZone(zone, transform.x, transform.y);
    layer.transform = {
      ...transform,
      ...point,
      scale: Math.max(0.1, Math.min(4, transform.scale)),
      rotation: Math.max(-3600, Math.min(3600, transform.rotation)),
    };
  } else if (patch.zone) {
    const point = clampToSafeZone(zone, layer.transform.x, layer.transform.y);
    layer.transform = { ...layer.transform, ...point };
  }
  const { transform: _transform, ...rest } = patch;
  if (typeof rest.text === 'string') rest.text = rest.text.slice(0, 120);
  Object.assign(layer, rest);
}

export const useEditorStore = create<EditorState>((set, get) => ({
  document: createDocument(),
  assets: {},
  past: [],
  future: [],
  gestureStart: null,
  activeTool: 'color',
  selectedZone: 'front',
  selectedLayerId: null,
  view: 'front',
  interactionMode: 'rotate',
  autosaveStatus: 'loading',
  exportStatus: 'idle',
  setActiveTool: (activeTool) => set({ activeTool }),
  setSelectedZone: (selectedZone) => set({ selectedZone }),
  selectLayer: (selectedLayerId) => set({ selectedLayerId }),
  setView: (view) => set({ view }),
  setInteractionMode: (interactionMode) => set({ interactionMode }),
  setAutosaveStatus: (autosaveStatus) => set({ autosaveStatus }),
  setExportStatus: (exportStatus) => set({ exportStatus }),
  hydrate: (document, assets) => set({ document, assets, past: [], future: [], autosaveStatus: 'saved' }),
  newDesign: () => {
    for (const asset of Object.values(get().assets)) URL.revokeObjectURL(asset.previewUrl);
    set({ document: createDocument(), assets: {}, past: [], future: [], selectedLayerId: null, selectedZone: 'front', activeTool: 'color' });
  },
  applyTemplate: (templateId) => {
    if (!TEMPLATES.some((template) => template.id === templateId)) return;
    set((state) => commit(state, (document) => resetTemplate(document, templateId)));
  },
  updateZoneStyle: (zone, patch, history = true) => set((state) => {
    if (history) return commit(state, (document) => {
      document.zones[zone] = { ...document.zones[zone], ...patch };
    });
    const document = structuredClone(state.document);
    document.zones[zone] = { ...document.zones[zone], ...patch };
    return { document: stamp(document) };
  }),
  setZoneColor: (zone, color) => {
    if (get().document.zones[zone].color === color) return;
    get().updateZoneStyle(zone, { color });
  },
  setAllZoneColors: (color) => {
    if (ZONE_IDS.every((zone) => get().document.zones[zone].color === color)) return;
    set((state) => commit(state, (document) => {
      for (const zone of ZONE_IDS) {
        document.zones[zone] = { ...document.zones[zone], color };
      }
    }));
  },
  addTextLayer: (subtype, text, font = 'Inter') => {
    const state = get();
    if (state.document.layers.length >= 20 || !text.trim()) return null;
    const id = crypto.randomUUID();
    set((current) => commit(current, (document) => {
      document.layers.push({
        id,
        type: 'text',
        subtype,
        text: text.trim(),
        font,
        color: '#FFFFFF',
        background: null,
        zone: current.selectedZone,
        order: document.layers.length,
        visible: true,
        locked: false,
        transform: { x: 0.5, y: subtype === 'name' ? 0.22 : subtype === 'number' ? 0.48 : 0.36, scale: subtype === 'number' ? 1.2 : 1, rotation: 0 },
      });
    }));
    set({ selectedLayerId: id, activeTool: 'layers', interactionMode: 'move' });
    return id;
  },
  addImageLayer: (asset) => {
    const state = get();
    if (state.document.layers.length >= 20) return null;
    const id = crypto.randomUUID();
    set((current) => ({
      ...commit(current, (document) => {
        document.layers.push({
          id,
          type: 'image',
          assetId: asset.id,
          name: asset.fileName,
          zone: current.selectedZone,
          order: document.layers.length,
          visible: true,
          locked: false,
          transform: { x: 0.5, y: 0.36, scale: 0.9, rotation: 0 },
        });
      }),
      assets: { ...current.assets, [asset.id]: asset },
      selectedLayerId: id,
      activeTool: 'layers' as ToolId,
      interactionMode: 'move' as const,
    }));
    return id;
  },
  updateLayer: (id, patch, history = true) => set((state) => {
    const layer = state.document.layers.find((item) => item.id === id);
    if (!layer || layer.locked) return state;
    if (!history) {
      const document = structuredClone(state.document);
      patchLayer(document, id, patch);
      return { document: stamp(document) };
    }
    return commit(state, (document) => patchLayer(document, id, patch));
  }),
  duplicateLayer: (id) => set((state) => {
    if (state.document.layers.length >= 20) return state;
    const source = state.document.layers.find((layer) => layer.id === id);
    if (!source) return state;
    const clone = structuredClone(source);
    clone.id = crypto.randomUUID();
    clone.order = state.document.layers.length;
    clone.locked = false;
    const point = clampToSafeZone(clone.zone, clone.transform.x + 0.05, clone.transform.y + 0.05);
    clone.transform.x = point.x;
    clone.transform.y = point.y;
    const result = commit(state, (document) => document.layers.push(clone));
    return { ...result, selectedLayerId: clone.id };
  }),
  removeLayer: (id) => set((state) => ({
    ...commit(state, (document) => {
      document.layers = document.layers.filter((layer) => layer.id !== id);
      [...document.layers].sort((a, b) => a.order - b.order).forEach((layer, order) => { layer.order = order; });
    }),
    selectedLayerId: state.selectedLayerId === id ? null : state.selectedLayerId,
  })),
  toggleLayer: (id, property) => set((state) => commit(state, (document) => {
    const layer = document.layers.find((item) => item.id === id);
    if (layer) layer[property] = !layer[property];
  })),
  moveLayerOrder: (id, direction) => set((state) => commit(state, (document) => {
    const ordered = [...document.layers].sort((a, b) => a.order - b.order);
    const index = ordered.findIndex((layer) => layer.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    ordered.forEach((layer, order) => { layer.order = order; });
    document.layers = ordered;
  })),
  centerLayer: (id) => set((state) => {
    const layer = state.document.layers.find((item) => item.id === id);
    if (!layer || layer.locked) return state;
    return commit(state, (document) => patchLayer(document, id, { transform: { x: 0.5, y: 0.5 } }));
  }),
  beginGesture: () => set((state) => ({ gestureStart: state.gestureStart ?? structuredClone(state.document) })),
  updateLayerLive: (id, x, y) => set((state) => {
    const layer = state.document.layers.find((item) => item.id === id);
    if (!layer || layer.locked) return state;
    const point = clampToSafeZone(layer.zone, x, y);
    if (point.x === layer.transform.x && point.y === layer.transform.y) return state;
    const document = structuredClone(state.document);
    patchLayer(document, id, { transform: point });
    return { document: stamp(document) };
  }),
  updateLayerResizeLive: (id, scale, x, y) => set((state) => {
    const layer = state.document.layers.find((item) => item.id === id);
    if (!layer || layer.locked) return state;
    const nextScale = Math.max(0.1, Math.min(4, scale));
    if (layer.transform.scale === nextScale && layer.transform.x === x && layer.transform.y === y) return state;
    const document = structuredClone(state.document);
    patchLayer(document, id, { transform: { scale: nextScale, x, y } });
    return { document: stamp(document) };
  }),
  endGesture: () => set((state) => {
    if (!state.gestureStart) return state;
    if (state.gestureStart === state.document || JSON.stringify(state.gestureStart) === JSON.stringify(state.document)) {
      return { gestureStart: null };
    }
    return { past: [...state.past, state.gestureStart].slice(-50), future: [], gestureStart: null };
  }),
  replaceImportedDesign: (document, assets) => {
    for (const asset of Object.values(get().assets)) URL.revokeObjectURL(asset.previewUrl);
    set({ document, assets, past: [], future: [], selectedLayerId: null, autosaveStatus: 'saving' });
  },
  undo: () => set((state) => {
    const previous = state.past.at(-1);
    if (!previous) return state;
    return { document: previous, past: state.past.slice(0, -1), future: [state.document, ...state.future].slice(0, 50), selectedLayerId: null };
  }),
  redo: () => set((state) => {
    const next = state.future[0];
    if (!next) return state;
    return { document: next, past: [...state.past, state.document].slice(-50), future: state.future.slice(1), selectedLayerId: null };
  }),
}));
