import { describe, expect, it } from 'vitest';

import { MODEL_MANIFEST, clampToSafeZone, localPointFromAtlasUv, zoneFromAtlasUv } from '@/lib/model-manifest';
import { ZONE_IDS } from '@/lib/design';

describe('ModelManifest', () => {
  it('mantiene todas las zonas dentro del atlas normalizado', () => {
    for (const zone of ZONE_IDS) {
      const config = MODEL_MANIFEST.atlas.zones[zone];
      for (const rect of [config.rect, ...(config.secondaryRects ?? [])]) {
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.width).toBeLessThanOrEqual(1);
        expect(rect.y + rect.height).toBeLessThanOrEqual(1);
      }
    }
  });

  it('mantiene todas las regiones de la máscara dentro del atlas', () => {
    expect(MODEL_MANIFEST.atlas.mask.torsoSideExpansion).toBe(0);
    for (const zone of ZONE_IDS) {
      expect(MODEL_MANIFEST.atlas.mask.colors[zone].length).toBeGreaterThan(0);
      expect(MODEL_MANIFEST.atlas.mask.rects[zone].length).toBeGreaterThan(0);
      for (const rect of MODEL_MANIFEST.atlas.mask.rects[zone]) {
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.width).toBeLessThanOrEqual(1);
        expect(rect.y + rect.height).toBeLessThanOrEqual(1);
      }
    }
  });

  it('convierte UV del centro a coordenadas locales', () => {
    const rect = MODEL_MANIFEST.atlas.zones.front.rect;
    const point = localPointFromAtlasUv('front', rect.x + rect.width / 2, rect.y + rect.height / 2);
    expect(point.x).toBeCloseTo(0.5, 5);
    expect(point.y).toBeCloseTo(0.5, 5);
  });

  it('prioriza laterales sobre la isla completa del frente', () => {
    const rect = MODEL_MANIFEST.atlas.zones.sideLeft.rect;
    expect(zoneFromAtlasUv(rect.x + rect.width / 2, rect.y + rect.height / 2)).toBe('sideLeft');
  });

  it('proyecta capas externas sobre el polígono seguro', () => {
    const point = clampToSafeZone('front', -4, 8);
    expect(point.x).toBeCloseTo(0.14, 5);
    expect(point.y).toBeCloseTo(0.9, 5);
  });
});
