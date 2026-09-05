import { ZONE_IDS, type ZoneId } from '@/lib/design';
import { MODEL_MANIFEST, type NormalizedRect } from '@/lib/model-manifest';

export type UvZoneMaskLookup = {
  width: number;
  height: number;
  zones: Uint8Array;
  rects?: Partial<Record<ZoneId, NormalizedRect[]>>;
};

export const ZONE_MASK_CODE = Object.fromEntries(
  ZONE_IDS.map((zone, index) => [zone, index + 1]),
) as Record<ZoneId, number>;

export function uvMaskGutter(size: number) {
  return Math.max(2, Math.round(size * 0.003));
}

const ZONE_FROM_CODE = [null, ...ZONE_IDS] as const;
const COLOR_TO_CODE = new Map<number, number>();

for (const zone of ZONE_IDS) {
  for (const [red, green, blue] of MODEL_MANIFEST.atlas.mask.colors[zone]) {
    COLOR_TO_CODE.set((red << 16) | (green << 8) | blue, ZONE_MASK_CODE[zone]);
  }
}

export function decodeUvZoneMaskPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): UvZoneMaskLookup {
  if (pixels.length !== width * height * 4) throw new Error('La máscara UV tiene dimensiones inválidas.');
  const zones = new Uint8Array(width * height);
  for (let pixel = 0, offset = 0; pixel < zones.length; pixel += 1, offset += 4) {
    zones[pixel] = COLOR_TO_CODE.get((pixels[offset] << 16) | (pixels[offset + 1] << 8) | pixels[offset + 2]) ?? 0;
  }
  return { width, height, zones };
}

export function padUvZoneMask(mask: UvZoneMaskLookup, padding: number): UvZoneMaskLookup {
  let zones = mask.zones.slice();
  const passes = Math.max(0, Math.floor(padding));

  for (let pass = 0; pass < passes; pass += 1) {
    const next = zones.slice();
    for (let y = 0; y < mask.height; y += 1) {
      for (let x = 0; x < mask.width; x += 1) {
        const pixel = y * mask.width + x;
        if (zones[pixel] !== 0) continue;
        const code = (x > 0 ? zones[pixel - 1] : 0)
          || (x + 1 < mask.width ? zones[pixel + 1] : 0)
          || (y > 0 ? zones[pixel - mask.width] : 0)
          || (y + 1 < mask.height ? zones[pixel + mask.width] : 0);
        if (code) next[pixel] = code;
      }
    }
    zones = next;
  }

  return { ...mask, zones };
}

export function expandTorsoSideZones(mask: UvZoneMaskLookup, ratio: number): UvZoneMaskLookup {
  const zones = mask.zones.slice();
  const torsoIslands = [
    { rect: MODEL_MANIFEST.atlas.zones.back.rect, primary: 'back', left: 'sideLeft', right: 'sideRight' },
    { rect: MODEL_MANIFEST.atlas.zones.front.rect, primary: 'front', left: 'sideRight', right: 'sideLeft' },
  ] as const;

  for (const island of torsoIslands) {
    const primaryCode = ZONE_MASK_CODE[island.primary];
    const allowedCodes = new Set([primaryCode, ZONE_MASK_CODE.sideLeft, ZONE_MASK_CODE.sideRight]);
    const minX = Math.max(0, Math.floor(island.rect.x * mask.width));
    const maxX = Math.min(mask.width - 1, Math.ceil((island.rect.x + island.rect.width) * mask.width));
    const minY = Math.max(0, Math.floor(island.rect.y * mask.height));
    const maxY = Math.min(mask.height - 1, Math.ceil((island.rect.y + island.rect.height) * mask.height));

    for (let y = minY; y <= maxY; y += 1) {
      let firstPrimary = -1;
      let lastPrimary = -1;
      for (let x = minX; x <= maxX; x += 1) {
        if (zones[y * mask.width + x] !== primaryCode) continue;
        if (firstPrimary < 0) firstPrimary = x;
        lastPrimary = x;
      }
      if (firstPrimary < 0) continue;
      const inset = Math.round((lastPrimary - firstPrimary + 1) * Math.max(0, Math.min(0.45, ratio)));
      const leftBoundary = firstPrimary + inset;
      const rightBoundary = lastPrimary - inset;
      for (let x = minX; x <= maxX; x += 1) {
        const pixel = y * mask.width + x;
        if (!allowedCodes.has(zones[pixel])) continue;
        zones[pixel] = x < leftBoundary
          ? ZONE_MASK_CODE[island.left]
          : x > rightBoundary
            ? ZONE_MASK_CODE[island.right]
            : primaryCode;
      }
    }
  }

  return { ...mask, zones };
}

function zoneBoundsWithin(mask: UvZoneMaskLookup, code: number, area: NormalizedRect): NormalizedRect | null {
  const minX = Math.max(0, Math.floor(area.x * mask.width));
  const maxX = Math.min(mask.width, Math.ceil((area.x + area.width) * mask.width));
  const minY = Math.max(0, Math.floor(area.y * mask.height));
  const maxY = Math.min(mask.height, Math.ceil((area.y + area.height) * mask.height));
  let left = mask.width;
  let right = -1;
  let top = mask.height;
  let bottom = -1;

  for (let y = minY; y < maxY; y += 1) {
    for (let x = minX; x < maxX; x += 1) {
      if (mask.zones[y * mask.width + x] !== code) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) return null;
  return {
    x: left / mask.width,
    y: top / mask.height,
    width: (right - left + 1) / mask.width,
    height: (bottom - top + 1) / mask.height,
  };
}

export function deriveSideZoneRects(mask: UvZoneMaskLookup): Partial<Record<ZoneId, NormalizedRect[]>> {
  const torsoIslands = [
    MODEL_MANIFEST.atlas.zones.front.rect,
    MODEL_MANIFEST.atlas.zones.back.rect,
  ];
  const rects: Partial<Record<ZoneId, NormalizedRect[]>> = {};
  for (const zone of ['sideLeft', 'sideRight'] as const) {
    rects[zone] = torsoIslands
      .map((island) => zoneBoundsWithin(mask, ZONE_MASK_CODE[zone], island))
      .filter((rect): rect is NormalizedRect => rect !== null);
  }
  return rects;
}

export function createUvZoneMaskLookup(image: CanvasImageSource, size: number): UvZoneMaskLookup {
  const canvas = window.document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('No se pudo preparar la máscara UV.');
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0, size, size);
  const decoded = decodeUvZoneMaskPixels(context.getImageData(0, 0, size, size).data, size, size);
  const expanded = expandTorsoSideZones(decoded, MODEL_MANIFEST.atlas.mask.torsoSideExpansion);
  return padUvZoneMask({ ...expanded, rects: deriveSideZoneRects(expanded) }, uvMaskGutter(size));
}

export function loadUvZoneMask(size: number, signal?: AbortSignal): Promise<UvZoneMaskLookup> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const abort = () => {
      image.src = '';
      reject(new DOMException('Carga cancelada', 'AbortError'));
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener('abort', abort, { once: true });
    image.onload = () => {
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) return;
      try {
        if (image.naturalWidth !== MODEL_MANIFEST.atlas.mask.sourceSize || image.naturalHeight !== MODEL_MANIFEST.atlas.mask.sourceSize) {
          throw new Error('La máscara UV no coincide con las dimensiones declaradas del modelo.');
        }
        resolve(createUvZoneMaskLookup(image, size));
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => {
      signal?.removeEventListener('abort', abort);
      reject(new Error('No se pudo cargar la máscara UV del modelo.'));
    };
    image.src = MODEL_MANIFEST.atlas.mask.url;
  });
}

export function zoneFromUvMask(mask: UvZoneMaskLookup, u: number, v: number): ZoneId | null {
  if (!Number.isFinite(u) || !Number.isFinite(v) || u < 0 || u > 1 || v < 0 || v > 1) return null;
  const x = Math.min(mask.width - 1, Math.floor(u * mask.width));
  const y = Math.min(mask.height - 1, Math.floor(v * mask.height));
  return ZONE_FROM_CODE[mask.zones[y * mask.width + x]] ?? null;
}
