import { describe, expect, it } from 'vitest';

import { localPointFromAtlasUv } from '@/lib/model-manifest';
import { ZONE_MASK_CODE, decodeUvZoneMaskPixels, deriveSideZoneRects, expandTorsoSideZones, padUvZoneMask, zoneFromUvMask } from '@/lib/uv-zone-mask';

function pixels(colors: [number, number, number][]) {
  return new Uint8ClampedArray(colors.flatMap(([red, green, blue]) => [red, green, blue, 255]));
}

describe('máscara UV por zona', () => {
  it('decodifica todos los colores exactos del manifiesto', () => {
    const mask = decodeUvZoneMaskPixels(pixels([
      [255, 0, 0],
      [0, 0, 255],
      [255, 128, 0],
      [0, 255, 255],
      [128, 0, 255],
      [255, 0, 255],
      [255, 255, 0],
      [0, 255, 0],
    ]), 8, 1);

    expect(Array.from({ length: 8 }, (_, index) => zoneFromUvMask(mask, (index + 0.5) / 8, 0.5))).toEqual([
      'front',
      'back',
      'sleeveLeft',
      'sleeveRight',
      'collar',
      'collar',
      'sideLeft',
      'sideRight',
    ]);
  });

  it('ignora fondo, colores desconocidos y coordenadas fuera del atlas', () => {
    const mask = decodeUvZoneMaskPixels(pixels([[0, 0, 0], [10, 20, 30]]), 2, 1);

    expect(zoneFromUvMask(mask, 0.25, 0.5)).toBeNull();
    expect(zoneFromUvMask(mask, 0.75, 0.5)).toBeNull();
    expect(zoneFromUvMask(mask, -0.01, 0.5)).toBeNull();
    expect(zoneFromUvMask(mask, 0.5, 1.01)).toBeNull();
    expect(zoneFromUvMask(mask, Number.NaN, 0.5)).toBeNull();
  });

  it('rechaza buffers con dimensiones inconsistentes', () => {
    expect(() => decodeUvZoneMaskPixels(new Uint8ClampedArray(3), 1, 1)).toThrow('dimensiones inválidas');
  });

  it('extiende el color solo hacia el margen vacío del atlas', () => {
    const zones = new Uint8Array([
      0, ZONE_MASK_CODE.front, 0,
      ZONE_MASK_CODE.back, 0, ZONE_MASK_CODE.sideRight,
      0, ZONE_MASK_CODE.sideLeft, 0,
    ]);
    const padded = padUvZoneMask({ width: 3, height: 3, zones }, 1);

    expect(padded.zones[4]).toBe(ZONE_MASK_CODE.back);
    expect(padded.zones[1]).toBe(ZONE_MASK_CODE.front);
    expect(padded.zones[3]).toBe(ZONE_MASK_CODE.back);
    expect(padded.zones[5]).toBe(ZONE_MASK_CODE.sideRight);
  });

  it('amplía ambos laterales sin partir el bloque central del torso', () => {
    const size = 100;
    const zones = new Uint8Array(size * size);
    for (let x = 2; x <= 43; x += 1) zones[50 * size + x] = x < 11 ? ZONE_MASK_CODE.sideLeft : x > 35 ? ZONE_MASK_CODE.sideRight : ZONE_MASK_CODE.back;

    const expanded = expandTorsoSideZones({ width: size, height: size, zones }, 0.2);
    expect(zoneFromUvMask(expanded, 0.115, 0.505)).toBe('sideLeft');
    expect(zoneFromUvMask(expanded, 0.235, 0.505)).toBe('back');
    expect(zoneFromUvMask(expanded, 0.345, 0.505)).toBe('sideRight');
  });

  it('usa los mismos límites expandidos para pintar y manipular una capa lateral', () => {
    const size = 100;
    const zones = new Uint8Array(size * size);
    for (let y = 40; y <= 95; y += 1) {
      for (let x = 56; x <= 70; x += 1) zones[y * size + x] = ZONE_MASK_CODE.sideRight;
      for (let x = 71; x <= 85; x += 1) zones[y * size + x] = ZONE_MASK_CODE.front;
      for (let x = 86; x <= 98; x += 1) zones[y * size + x] = ZONE_MASK_CODE.sideLeft;
    }
    const mask = { width: size, height: size, zones };
    const rects = deriveSideZoneRects(mask);
    const point = localPointFromAtlasUv('sideRight', 0.7, 0.6, rects.sideRight);

    expect(zoneFromUvMask(mask, 0.7, 0.6)).toBe('sideRight');
    expect(rects.sideRight).toHaveLength(1);
    expect(point.x).toBeGreaterThan(0.8);
    expect(point.x).toBeLessThan(1);
  });
});
