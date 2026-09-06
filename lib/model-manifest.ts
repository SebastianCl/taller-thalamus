import type { ViewId, ZoneId } from '@/lib/design';
import type { ModelId } from '@/lib/garment-types';

export type NormalizedRect = { x: number; y: number; width: number; height: number };

export type ModelManifest = {
  version: 1;
  modelId: ModelId;
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
    mask: {
      url: string;
      sourceSize: 4096;
      torsoSideExpansion: number;
      colors: Record<ZoneId, [number, number, number][]>;
      rects: Record<ZoneId, NormalizedRect[]>;
    };
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

const FRONT_TORSO_MASK: NormalizedRect = { x: 0.56689453125, y: 0.400634765625, width: 0.4052734375, height: 0.555908203125 };
const BACK_TORSO_MASK: NormalizedRect = { x: 0.013671875, y: 0.381103515625, width: 0.43017578125, height: 0.575439453125 };
const SIDE_PREVIEW_ANGLE = Math.PI * (65 / 180);

export const MODEL_MANIFEST = {
  version: 1,
  modelId: 'taller-sport-v1',
  source: {
    kind: 'licensed-glb',
    name: 'Men Regular Apparel Fit Sporty T-Shirt',
    author: 'BINARYCLOTH (@binaryclothofficial)',
    license: 'CC BY 4.0',
    sourceUrl: 'https://sketchfab.com/3d-models/men-regular-apparel-fit-sporty-t-shirt-4d055bb8c1e04549a4b2dac7b27ebb2c',
    modifications: ['Original graphics and texture channels removed', 'BaseColor replaced with a dynamic 1K/2K atlas', 'Meshopt compression', 'Runtime scaling and a 4K UV zone mask with straight model-space side boundaries'],
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
    mask: {
      url: '/models/uv-zone-mask.png',
      sourceSize: 4096,
      torsoSideExpansion: 0,
      colors: {
        front: [[255, 0, 0]],
        back: [[0, 0, 255]],
        sleeveLeft: [[255, 128, 0]],
        sleeveRight: [[0, 255, 255]],
        collar: [[128, 0, 255], [255, 0, 255]],
        sideLeft: [[255, 255, 0]],
        sideRight: [[0, 255, 0]],
      },
      rects: {
        front: [FRONT_TORSO_MASK],
        back: [BACK_TORSO_MASK],
        sleeveLeft: [{ x: 0.59130859375, y: 0.011962890625, width: 0.364013671875, height: 0.32861328125 }],
        sleeveRight: [{ x: 0.020751953125, y: 0.011962890625, width: 0.364013671875, height: 0.32861328125 }],
        collar: [
          { x: 0.289306640625, y: 0.0859375, width: 0.407958984375, height: 0.015625 },
          { x: 0.365234375, y: 0.1396484375, width: 0.256103515625, height: 0.00634765625 },
        ],
        sideLeft: [
          { x: 0.877197265625, y: 0.587158203125, width: 0.11083984375, height: 0.369384765625 },
          { x: 0.01318359375, y: 0.58642578125, width: 0.113037109375, height: 0.3701171875 },
        ],
        sideRight: [
          { x: 0.558837890625, y: 0.590576171875, width: 0.115478515625, height: 0.365966796875 },
          { x: 0.330322265625, y: 0.59130859375, width: 0.113525390625, height: 0.365234375 },
        ],
      },
    },
    zones: {
      front: zoneDefinition(0.55894, 0.4007, 0.42905, 0.5559, 0.14, undefined, TORSO_SAFE),
      back: zoneDefinition(0.01326, 0.38117, 0.43047, 0.57543, 0.14, undefined, TORSO_SAFE),
      sleeveLeft: zoneDefinition(0.59154, 0.01188, 0.36384, 0.32855, 0.1, undefined, SLEEVE_SAFE),
      sleeveRight: zoneDefinition(0.02076, 0.01188, 0.36384, 0.32855, 0.1, undefined, SLEEVE_SAFE),
      sideLeft: zoneDefinition(
        0.877197265625,
        0.587158203125,
        0.11083984375,
        0.369384765625,
        0.08,
        [{ x: 0.01318359375, y: 0.58642578125, width: 0.113037109375, height: 0.3701171875 }],
      ),
      sideRight: zoneDefinition(
        0.558837890625,
        0.590576171875,
        0.115478515625,
        0.365966796875,
        0.08,
        [{ x: 0.330322265625, y: 0.59130859375, width: 0.113525390625, height: 0.365234375 }],
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
    left: { rotationY: -SIDE_PREVIEW_ANGLE, label: 'Lado izquierdo' },
    right: { rotationY: SIDE_PREVIEW_ANGLE, label: 'Lado derecho' },
  },
} as ModelManifest;

export function localPointFromAtlasUv(zone: ZoneId, u: number, v: number, runtimeRects?: NormalizedRect[], manifest = MODEL_MANIFEST) {
  const config = manifest.atlas.zones[zone];
  const rects = runtimeRects?.length ? runtimeRects : [config.rect, ...(config.secondaryRects ?? [])];
  const rect = rects.find((candidate) => u >= candidate.x && u <= candidate.x + candidate.width && v >= candidate.y && v <= candidate.y + candidate.height)
    ?? rects.reduce((nearest, candidate) => {
      const distance = (target: NormalizedRect) => {
        const dx = Math.max(target.x - u, 0, u - target.x - target.width);
        const dy = Math.max(target.y - v, 0, v - target.y - target.height);
        return dx * dx + dy * dy;
      };
      return distance(candidate) < distance(nearest) ? candidate : nearest;
    }, rects[0]);
  return {
    x: Math.max(0, Math.min(1, (u - rect.x) / rect.width)),
    y: Math.max(0, Math.min(1, (v - rect.y) / rect.height)),
  };
}

const inside = (rect: NormalizedRect, u: number, v: number) => u >= rect.x && u <= rect.x + rect.width && v >= rect.y && v <= rect.y + rect.height;

export function zoneFromAtlasUv(u: number, v: number, manifest = MODEL_MANIFEST): ZoneId | null {
  // Narrow seam/collar patches and side masks must win over the larger torso islands.
  for (const zone of ['hood', 'pocket', 'cuffLeft', 'cuffRight', 'waistband', 'collar', 'sideLeft', 'sideRight', 'sleeveLeft', 'sleeveRight', 'front', 'back'] as ZoneId[]) {
    const config = manifest.atlas.zones[zone];
    if (!config) continue;
    if ([config.rect, ...(config.secondaryRects ?? [])].some((rect) => inside(rect, u, v))) return zone;
  }
  return null;
}

export function clampToSafeZone(zone: ZoneId, x: number, y: number, manifest = MODEL_MANIFEST) {
  const polygon = manifest.atlas.zones[zone].safePolygon;
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
