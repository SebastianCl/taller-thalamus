import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const SIZE = 4096;
const SIDE_THRESHOLD = Math.tan(Math.PI / 6); // 30 degrees from front/back.
const VERTICAL_MEDIAN_RADIUS = 15;
const VERTICAL_AVERAGE_RADIUS = 64;

const ZONE = {
  empty: 0,
  front: 1,
  back: 2,
  sleeveLeft: 3,
  sleeveRight: 4,
  collar: 5,
  sideLeft: 6,
  sideRight: 7,
};

const ZONE_NAMES = [
  'empty',
  'front',
  'back',
  'sleeveLeft',
  'sleeveRight',
  'collar',
  'sideLeft',
  'sideRight',
];

const PALETTE = [
  [0, 0, 0],
  [255, 0, 0],
  [0, 0, 255],
  [255, 128, 0],
  [0, 255, 255],
  [128, 0, 255],
  [255, 255, 0],
  [0, 255, 0],
];

const inputPath = resolve(
  process.argv[2] ??
    fileURLToPath(
      new URL('../public/models/taller-sport.glb', import.meta.url),
    ),
);
const outputPath = resolve(
  process.argv[3] ??
    fileURLToPath(
      new URL('../public/models/uv-zone-mask.png', import.meta.url),
    ),
);

await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const document = await io.read(inputPath);
const primitives = document
  .getRoot()
  .listMeshes()
  .flatMap((mesh) => mesh.listPrimitives());
if (primitives.length !== 1)
  throw new Error(
    `Se esperaba una primitiva; se encontraron ${primitives.length}.`,
  );

const primitive = primitives[0];
const positions = primitive.getAttribute('POSITION');
const normals = primitive.getAttribute('NORMAL');
const texcoords = primitive.getAttribute('TEXCOORD_0');
const indices = primitive.getIndices();
if (!positions || !normals || !texcoords || !indices) {
  throw new Error(
    'El GLB debe incluir POSITION, NORMAL, TEXCOORD_0 e índices.',
  );
}
if (indices.getCount() % 3 !== 0)
  throw new Error('El índice de la malla no contiene triángulos completos.');

const triangleCount = indices.getCount() / 3;
const triangles = Array.from({ length: triangleCount }, (_, triangle) => [
  indices.getScalar(triangle * 3),
  indices.getScalar(triangle * 3 + 1),
  indices.getScalar(triangle * 3 + 2),
]);

function connectedComponents() {
  const parents = Int32Array.from(
    { length: triangleCount },
    (_, index) => index,
  );
  const find = (value) =>
    parents[value] === value ? value : (parents[value] = find(parents[value]));
  const unite = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
  };
  const triangleByVertex = new Map();

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    for (const vertex of triangles[triangle]) {
      const adjacent = triangleByVertex.get(vertex);
      if (adjacent === undefined) triangleByVertex.set(vertex, triangle);
      else unite(triangle, adjacent);
    }
  }

  const grouped = new Map();
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const root = find(triangle);
    const component = grouped.get(root) ?? [];
    component.push(triangle);
    grouped.set(root, component);
  }
  return [...grouped.values()];
}

function describeComponent(component, id) {
  const vertices = new Set(
    component.flatMap((triangle) => triangles[triangle]),
  );
  const uvMin = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const uvMax = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  const positionMean = [0, 0, 0];

  for (const vertex of vertices) {
    const uv = texcoords.getElement(vertex, []);
    const position = positions.getElement(vertex, []);
    for (let axis = 0; axis < 2; axis += 1) {
      uvMin[axis] = Math.min(uvMin[axis], uv[axis]);
      uvMax[axis] = Math.max(uvMax[axis], uv[axis]);
    }
    for (let axis = 0; axis < 3; axis += 1)
      positionMean[axis] += position[axis] / vertices.size;
  }

  return {
    id,
    triangles: component,
    vertices,
    uvMin,
    uvMax,
    positionMean,
    kind: null,
    primaryZone: null,
  };
}

const components = connectedComponents().map(describeComponent);
const torso = components.filter(
  (component) => component.uvMin[1] > 0.35 && component.triangles.length > 5000,
);
const sleeves = components.filter(
  (component) => component.uvMax[1] < 0.35 && component.triangles.length > 5000,
);
const collars = components.filter(
  (component) => component.triangles.length < 1000,
);
if (
  components.length !== 6 ||
  torso.length !== 2 ||
  sleeves.length !== 2 ||
  collars.length !== 2
) {
  throw new Error(
    `Topología inesperada: ${components.length} islas, torso=${torso.length}, mangas=${sleeves.length}, cuello=${collars.length}.`,
  );
}

for (const component of torso) {
  component.kind = 'torso';
  component.primaryZone =
    component.positionMean[2] >= 0 ? ZONE.front : ZONE.back;
}
for (const component of sleeves) {
  component.kind = 'fixed';
  component.primaryZone =
    component.positionMean[0] >= 0 ? ZONE.sleeveLeft : ZONE.sleeveRight;
}
for (const component of collars) {
  component.kind = 'fixed';
  component.primaryZone = ZONE.collar;
}

const zones = new Uint8Array(SIZE * SIZE);
const owners = new Uint8Array(SIZE * SIZE);
let overlapPixels = 0;

function rasterizeTriangle(triangleIndex, component) {
  const vertexIds = triangles[triangleIndex];
  const uv = vertexIds.map((vertex) => texcoords.getElement(vertex, []));
  const normal = vertexIds.map((vertex) => normals.getElement(vertex, []));
  const points = uv.map(([u, v]) => [u * SIZE, v * SIZE]);
  const denominator =
    (points[1][1] - points[2][1]) * (points[0][0] - points[2][0]) +
    (points[2][0] - points[1][0]) * (points[0][1] - points[2][1]);
  if (Math.abs(denominator) < 1e-12) return;

  const minX = Math.max(
    0,
    Math.floor(Math.min(points[0][0], points[1][0], points[2][0])),
  );
  const maxX = Math.min(
    SIZE - 1,
    Math.ceil(Math.max(points[0][0], points[1][0], points[2][0])) - 1,
  );
  const minY = Math.max(
    0,
    Math.floor(Math.min(points[0][1], points[1][1], points[2][1])),
  );
  const maxY = Math.min(
    SIZE - 1,
    Math.ceil(Math.max(points[0][1], points[1][1], points[2][1])) - 1,
  );
  const ownerCode = component.id + 1;

  for (let y = minY; y <= maxY; y += 1) {
    const py = y + 0.5;
    for (let x = minX; x <= maxX; x += 1) {
      const px = x + 0.5;
      const w0 =
        ((points[1][1] - points[2][1]) * (px - points[2][0]) +
          (points[2][0] - points[1][0]) * (py - points[2][1])) /
        denominator;
      const w1 =
        ((points[2][1] - points[0][1]) * (px - points[2][0]) +
          (points[0][0] - points[2][0]) * (py - points[2][1])) /
        denominator;
      const w2 = 1 - w0 - w1;
      if (w0 < -1e-8 || w1 < -1e-8 || w2 < -1e-8) continue;

      const pixel = y * SIZE + x;
      if (owners[pixel] !== 0 && owners[pixel] !== ownerCode)
        overlapPixels += 1;
      owners[pixel] = ownerCode;

      if (component.kind === 'fixed') {
        zones[pixel] = component.primaryZone;
        continue;
      }

      const nx = normal[0][0] * w0 + normal[1][0] * w1 + normal[2][0] * w2;
      const nz = normal[0][2] * w0 + normal[1][2] * w1 + normal[2][2] * w2;
      zones[pixel] =
        Math.abs(nx) > SIDE_THRESHOLD * Math.abs(nz)
          ? nx >= 0
            ? ZONE.sideLeft
            : ZONE.sideRight
          : component.primaryZone;
    }
  }
}

for (const component of components) {
  for (const triangle of component.triangles)
    rasterizeTriangle(triangle, component);
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function fillMissing(values) {
  const result = values.slice();
  let previous = -1;
  for (let index = 0; index < result.length; index += 1) {
    if (Number.isFinite(result[index])) {
      if (previous < 0) {
        for (let fill = 0; fill < index; fill += 1)
          result[fill] = result[index];
      } else if (index - previous > 1) {
        for (let fill = previous + 1; fill < index; fill += 1) {
          const amount = (fill - previous) / (index - previous);
          result[fill] =
            result[previous] * (1 - amount) + result[index] * amount;
        }
      }
      previous = index;
    }
  }
  if (previous >= 0) {
    for (let fill = previous + 1; fill < result.length; fill += 1)
      result[fill] = result[previous];
  }
  return result;
}

function smoothBoundaries(values) {
  const filled = fillMissing(values);
  const medians = filled.map((_, index) => {
    const window = filled
      .slice(
        Math.max(0, index - VERTICAL_MEDIAN_RADIUS),
        Math.min(filled.length, index + VERTICAL_MEDIAN_RADIUS + 1),
      )
      .filter(Number.isFinite);
    return window.length ? median(window) : Number.NaN;
  });
  return medians.map((_, index) => {
    const window = medians
      .slice(
        Math.max(0, index - VERTICAL_AVERAGE_RADIUS),
        Math.min(medians.length, index + VERTICAL_AVERAGE_RADIUS + 1),
      )
      .filter(Number.isFinite);
    return window.length
      ? window.reduce((sum, value) => sum + value, 0) / window.length
      : Number.NaN;
  });
}

function enforceTorsoContinuity(component) {
  const ownerCode = component.id + 1;
  const minX = Math.max(0, Math.floor(component.uvMin[0] * SIZE));
  const maxX = Math.min(SIZE - 1, Math.ceil(component.uvMax[0] * SIZE));
  const minY = Math.max(0, Math.floor(component.uvMin[1] * SIZE));
  const maxY = Math.min(SIZE - 1, Math.ceil(component.uvMax[1] * SIZE));
  const rowCount = maxY - minY + 1;
  const leftBoundaries = Array(rowCount).fill(Number.NaN);
  const rightBoundaries = Array(rowCount).fill(Number.NaN);

  for (let y = minY; y <= maxY; y += 1) {
    const primaryRuns = [];
    let start = -1;
    for (let x = minX; x <= maxX + 1; x += 1) {
      const primary =
        x <= maxX &&
        owners[y * SIZE + x] === ownerCode &&
        zones[y * SIZE + x] === component.primaryZone;
      if (primary && start < 0) start = x;
      if (!primary && start >= 0) {
        primaryRuns.push({ start, end: x - 1, length: x - start });
        start = -1;
      }
    }
    if (!primaryRuns.length) continue;
    const longest = Math.max(...primaryRuns.map((run) => run.length));
    const meaningful = primaryRuns.filter(
      (run) => run.length >= Math.max(4, longest * 0.12),
    );
    leftBoundaries[y - minY] = Math.min(...meaningful.map((run) => run.start));
    rightBoundaries[y - minY] = Math.max(...meaningful.map((run) => run.end));
  }

  const left = smoothBoundaries(leftBoundaries);
  const right = smoothBoundaries(rightBoundaries);
  const leftZone =
    component.primaryZone === ZONE.front ? ZONE.sideRight : ZONE.sideLeft;
  const rightZone =
    component.primaryZone === ZONE.front ? ZONE.sideLeft : ZONE.sideRight;

  for (let y = minY; y <= maxY; y += 1) {
    const row = y - minY;
    if (!Number.isFinite(left[row]) || !Number.isFinite(right[row])) continue;
    const leftBoundary = Math.min(left[row], right[row] - 1);
    const rightBoundary = Math.max(right[row], left[row] + 1);
    for (let x = minX; x <= maxX; x += 1) {
      const pixel = y * SIZE + x;
      if (owners[pixel] !== ownerCode) continue;
      zones[pixel] =
        x < leftBoundary
          ? leftZone
          : x > rightBoundary
            ? rightZone
            : component.primaryZone;
    }
  }
}

for (const component of torso) enforceTorsoContinuity(component);

const unclassifiedPixels = zones.reduce(
  (count, zone, pixel) => count + Number(owners[pixel] !== 0 && zone === 0),
  0,
);
if (overlapPixels > 0)
  throw new Error(
    `Se detectaron ${overlapPixels} píxeles de solapamiento entre islas UV.`,
  );
if (unclassifiedPixels > 0)
  throw new Error(
    `Quedaron ${unclassifiedPixels} píxeles de geometría sin clasificar.`,
  );

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1)
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, payload) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, payload])));
  return Buffer.concat([length, name, payload, checksum]);
}

function encodeIndexedPng(width, height, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 3;
  const palette = Buffer.from(PALETTE.flat());
  const scanlines = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width + 1);
    scanlines[row] = 0;
    Buffer.from(pixels.buffer, pixels.byteOffset + y * width, width).copy(
      scanlines,
      row + 1,
    );
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('PLTE', palette),
    pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

await writeFile(outputPath, encodeIndexedPng(SIZE, SIZE, zones));

const counts = new Uint32Array(PALETTE.length);
for (const zone of zones) counts[zone] += 1;
const assigned = counts.reduce(
  (sum, count, code) => sum + (code === 0 ? 0 : count),
  0,
);
const componentSummary = components
  .map((component) => ({
    zone: ZONE_NAMES[component.primaryZone],
    triangles: component.triangles.length,
    uv: [component.uvMin, component.uvMax].map((point) =>
      point.map((value) => Number(value.toFixed(6))),
    ),
  }))
  .sort((left, right) => right.triangles - left.triangles);
const zoneSummary = Object.fromEntries(
  ZONE_NAMES.slice(1).map((name, index) => [
    name,
    {
      pixels: counts[index + 1],
      percentOfGarment: Number(
        ((counts[index + 1] * 100) / assigned).toFixed(2),
      ),
    },
  ]),
);

console.log(
  JSON.stringify(
    {
      input: inputPath,
      output: outputPath,
      size: [SIZE, SIZE],
      sideHalfAngleDegrees: 30,
      smoothing: {
        medianRows: VERTICAL_MEDIAN_RADIUS * 2 + 1,
        averageRows: VERTICAL_AVERAGE_RADIUS * 2 + 1,
      },
      components: componentSummary,
      zones: zoneSummary,
      overlapPixels,
      unclassifiedPixels,
    },
    null,
    2,
  ),
);
