// Keep the original seven zone identifiers and their ordering stable.
export const SHIRT_ZONE_IDS = [
  'front',
  'back',
  'sleeveLeft',
  'sleeveRight',
  'collar',
  'sideLeft',
  'sideRight',
] as const;
export const EXTRA_ZONE_IDS = [
  'hood',
  'pocket',
  'cuffLeft',
  'cuffRight',
  'waistband',
  'armholeLeft',
  'armholeRight',
] as const;
export const ALL_ZONE_IDS = [...SHIRT_ZONE_IDS, ...EXTRA_ZONE_IDS] as const;
export type GarmentZoneId = (typeof ALL_ZONE_IDS)[number];
export const MODEL_IDS = [
  'taller-sport-v1',
  'taller-hoodie-v1',
  'taller-camibuso-v1',
  'taller-camisilla-v1',
] as const;
export type ModelId = (typeof MODEL_IDS)[number];

export const GARMENT_ZONES: Record<ModelId, readonly GarmentZoneId[]> = {
  'taller-camisilla-v1': [
    'front',
    'back',
    'collar',
    'sideLeft',
    'sideRight',
    'armholeLeft',
    'armholeRight',
  ],
  'taller-sport-v1': SHIRT_ZONE_IDS,
  'taller-hoodie-v1': [
    ...SHIRT_ZONE_IDS.filter((zone) => zone !== 'collar'),
    'hood',
    'pocket',
    'cuffLeft',
    'cuffRight',
    'waistband',
  ],
  'taller-camibuso-v1': [
    ...SHIRT_ZONE_IDS,
    'cuffLeft',
    'cuffRight',
    'waistband',
  ],
};

export function supportsZone(modelId: ModelId, zone: GarmentZoneId) {
  return GARMENT_ZONES[modelId].includes(zone);
}
