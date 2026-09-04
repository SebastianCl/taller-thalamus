import type { ViewId, ZoneId } from '@/lib/design';

export type NormalizedRect = { x: number; y: number; width: number; height: number };

export type ModelManifest = {
  version: 1;
  modelId: 'taller-sport-v1';
  source: {
    kind: 'licensed-glb';
    name: string;
    author: string;
    license: string;
    sourceUrl: string;
    modifications: string[];
  };
  meshes: Record<ZoneId, string[]>;
  materials: string[];
  atlas: {
    desktopSize: 2048;
    mobileSize: 1024;
    zones: Record<ZoneId, { rect: NormalizedRect; secondaryRects?: NormalizedRect[]; safePolygon: [number, number][]; margin: number }>;
  };
  cameras: Record<ViewId, { rotationY: number; label: string }>;
};

const rectangularSafePolygon = (margin: number) => [
  [margin, margin],
  [1 - margin, margin],
  [1 - margin, 1 - margin],
  [margin, 1 - margin],
] as [number, number][];

const zoneDefinition = (
  x: number,
  y: number,
  width: number,
  height: number,
  margin = 0.06,
  secondaryRects?: NormalizedRect[],
  safePolygon = rectangularSafePolygon(margin),
) => ({
  rect: { x, y, width, height },
  safePolygon,
  margin,
  secondaryRects,
});

const TORSO_SAFE: [number, number][] = [
  [0.34, 0.13], [0.66, 0.13], [0.82, 0.38], [0.86, 0.9],
  [0.14, 0.9], [0.18, 0.38],
];

const SLEEVE_SAFE: [number, number][] = [
  [0.2, 0.16], [0.57, 0.17], [0.72, 0.38], [0.86, 0.72],
  [0.82, 0.86], [0.18, 0.86], [0.1, 0.58],
];

export const MODEL_MANIFEST: ModelManifest = {
  version: 1,
  modelId: 'taller-sport-v1',
  source: {
    kind: 'licensed-glb',
    name: 'Men Regular Apparel Fit Sporty T-Shirt',
    author: 'BINARYCLOTH (@binaryclothofficial)',
    license: 'CC BY 4.0',
    sourceUrl: 'https://sketchfab.com/3d-models/men-regular-apparel-fit-sporty-t-shirt-4d055bb8c1e04549a4b2dac7b27ebb2c',
    modifications: ['Original graphics and texture channels removed', 'BaseColor replaced with a dynamic 1K/2K atlas', 'Meshopt compression', 'Runtime scaling and audited printable safe zones'],
  },
  meshes: {
    front: ['default'],
    back: ['default'],
    sleeveLeft: ['default'],
    sleeveRight: ['default'],
    collar: ['default'],
    sideLeft: ['default'],
    sideRight: ['default'],
  },
  materials: ['Default_material'],
  atlas: {
    desktopSize: 2048,
    mobileSize: 1024,
    zones: {
      front: zoneDefinition(0.55894, 0.4007, 0.42905, 0.5559, 0.14, undefined, TORSO_SAFE),
      back: zoneDefinition(0.01326, 0.38117, 0.43047, 0.57543, 0.14, undefined, TORSO_SAFE),
      sleeveLeft: zoneDefinition(0.59154, 0.01188, 0.36384, 0.32855, 0.1, undefined, SLEEVE_SAFE),
      sleeveRight: zoneDefinition(0.02076, 0.01188, 0.36384, 0.32855, 0.1, undefined, SLEEVE_SAFE),
      sideLeft: zoneDefinition(
        0.9116,
        0.597,
        0.0767,
        0.36,
        0.08,
        [{ x: 0.0142, y: 0.6346, width: 0.0947, height: 0.3224 }],
      ),
      sideRight: zoneDefinition(
        0.5594,
        0.597,
        0.0767,
        0.36,
        0.08,
        [{ x: 0.3517, y: 0.6356, width: 0.0689, height: 0.3214 }],
      ),
      collar: zoneDefinition(
        0.28942,
        0.08584,
        0.40771,
        0.0154,
        0.04,
        [{ x: 0.36521, y: 0.13966, width: 0.25612, height: 0.00616 }],
      ),
    },
  },
  cameras: {
    front: { rotationY: 0, label: 'Frente' },
    back: { rotationY: Math.PI, label: 'Espalda' },
    left: { rotationY: -Math.PI / 2, label: 'Lado izquierdo' },
    right: { rotationY: Math.PI / 2, label: 'Lado derecho' },
  },
};

export function localPointFromAtlasUv(zone: ZoneId, u: number, v: number) {
  const config = MODEL_MANIFEST.atlas.zones[zone];
  const rects = [config.rect, ...(config.secondaryRects ?? [])];
  const rect = rects.find((candidate) => u >= candidate.x && u <= candidate.x + candidate.width && v >= candidate.y && v <= candidate.y + candidate.height) ?? config.rect;
  return {
    x: Math.max(0, Math.min(1, (u - rect.x) / rect.width)),
    y: Math.max(0, Math.min(1, (v - rect.y) / rect.height)),
  };
}

const inside = (rect: NormalizedRect, u: number, v: number) => u >= rect.x && u <= rect.x + rect.width && v >= rect.y && v <= rect.y + rect.height;

export function zoneFromAtlasUv(u: number, v: number): ZoneId | null {
  // Narrow seam/collar patches and side masks must win over the larger torso islands.
  for (const zone of ['collar', 'sideLeft', 'sideRight', 'sleeveLeft', 'sleeveRight', 'front', 'back'] as ZoneId[]) {
    const config = MODEL_MANIFEST.atlas.zones[zone];
    if ([config.rect, ...(config.secondaryRects ?? [])].some((rect) => inside(rect, u, v))) return zone;
  }
  return null;
}

export function clampToSafeZone(zone: ZoneId, x: number, y: number) {
  const polygon = MODEL_MANIFEST.atlas.zones[zone].safePolygon;
  const point = { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  let insidePolygon = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const [x1, y1] = polygon[index];
    const [x2, y2] = polygon[previous];
    if ((y1 > point.y) !== (y2 > point.y) && point.x < ((x2 - x1) * (point.y - y1)) / (y2 - y1) + x1) insidePolygon = !insidePolygon;
  }
  if (insidePolygon) return point;

  let closest = { x: polygon[0][0], y: polygon[0][1] };
  let closestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < polygon.length; index += 1) {
    const [ax, ay] = polygon[index];
    const [bx, by] = polygon[(index + 1) % polygon.length];
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    const amount = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - ax) * dx + (point.y - ay) * dy) / lengthSquared));
    const candidate = { x: ax + dx * amount, y: ay + dy * amount };
    const distance = (candidate.x - point.x) ** 2 + (candidate.y - point.y) ** 2;
    if (distance < closestDistance) {
      closest = candidate;
      closestDistance = distance;
    }
  }
  return closest;
}
