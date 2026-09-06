import { createDocument, type DesignDocument, type ZoneId } from '@/lib/design';
import {
  GARMENT_ZONES,
  MODEL_IDS,
  supportsZone,
  type ModelId,
} from '@/lib/garment-types';
import {
  MODEL_MANIFEST,
  clampToSafeZone,
  type ModelManifest,
} from '@/lib/model-manifest';
import manifests from '@/lib/garment-manifests.json';

export const GARMENTS = [
  {
    id: 'taller-sport-v1',
    label: 'Camiseta',
    url: '/models/taller-sport.glb',
    manifest: MODEL_MANIFEST,
  },
  {
    id: 'taller-hoodie-v1',
    label: 'Hoodie',
    url: '/models/garments/taller-hoodie-v1-sketchfab.glb',
    manifest: manifests['taller-hoodie-v1'] as ModelManifest,
  },
  {
    id: 'taller-camibuso-v1',
    label: 'Camibuso',
    url: '/models/garments/taller-camibuso-v1-sketchfab.glb',
    manifest: manifests['taller-camibuso-v1'] as ModelManifest,
  },
] as const;

export function getGarment(modelId: ModelId) {
  const garment = GARMENTS.find((item) => item.id === modelId);
  if (!garment) throw new Error('Prenda desconocida.');
  return garment;
}

export function transferDesign(
  source: DesignDocument,
  modelId: ModelId,
): DesignDocument {
  if (!MODEL_IDS.includes(modelId)) throw new Error('Prenda desconocida.');
  if (source.modelId === modelId) return source;
  const document = structuredClone(source);
  document.modelId = modelId;
  const defaults = createDocument(modelId);
  for (const zone of GARMENT_ZONES[modelId]) {
    if (!document.zones[zone]) {
      document.zones[zone] = {
        ...defaults.zones[zone],
        color: source.zones.front.color,
      };
    }
  }
  for (const layer of document.layers) {
    if (!supportsZone(modelId, layer.zone)) continue;
    Object.assign(
      layer.transform,
      clampToSafeZone(
        layer.zone,
        layer.transform.x,
        layer.transform.y,
        getGarment(modelId).manifest,
      ),
    );
  }
  return document;
}

export function activeZone(document: DesignDocument, zone: ZoneId): ZoneId {
  return supportsZone(document.modelId, zone) ? zone : 'front';
}
