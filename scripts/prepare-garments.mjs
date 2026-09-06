import { writeFile, mkdir } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { Document, NodeIO } from '@gltf-transform/core';
import { MeshoptSimplifier } from 'meshoptimizer';
import { sources, readGarment, projection } from './sketchfab-garments.mjs';
await MeshoptSimplifier.ready;

// This pipeline deliberately never reads or writes the stable shirt assets.
const ZONES = [
  'front',
  'back',
  'sleeveLeft',
  'sleeveRight',
  'collar',
  'sideLeft',
  'sideRight',
  'hood',
  'pocket',
  'cuffLeft',
  'cuffRight',
  'waistband',
];
const COLORS = [
  [255, 0, 0],
  [0, 0, 255],
  [255, 128, 0],
  [0, 255, 255],
  [128, 0, 255],
  [255, 255, 0],
  [0, 255, 0],
  [128, 128, 0],
  [128, 0, 0],
  [0, 128, 128],
  [0, 128, 0],
  [128, 128, 255],
];
const RECTS = {
  front: [0.02, 0.02, 0.35, 0.5],
  back: [0.39, 0.02, 0.35, 0.5],
  sideLeft: [0.76, 0.02, 0.1, 0.5],
  sideRight: [0.88, 0.02, 0.1, 0.5],
  sleeveLeft: [0.02, 0.55, 0.2, 0.31],
  sleeveRight: [0.24, 0.55, 0.2, 0.31],
  hood: [0.46, 0.55, 0.3, 0.18],
  pocket: [0.46, 0.75, 0.3, 0.11],
  collar: [0.78, 0.55, 0.2, 0.07],
  cuffLeft: [0.78, 0.65, 0.09, 0.19],
  cuffRight: [0.89, 0.65, 0.09, 0.19],
  waistband: [0.02, 0.89, 0.96, 0.09],
};
const SIZE = 4096;

function createSmoothNormals(positions, indices, sourceNormals) {
  const normals = new Float64Array(positions.length);
  for (let offset = 0; offset < indices.length; offset += 3) {
    const [a, b, c] = indices.slice(offset, offset + 3);
    const ax = positions[a * 3],
      ay = positions[a * 3 + 1],
      az = positions[a * 3 + 2];
    const bx = positions[b * 3],
      by = positions[b * 3 + 1],
      bz = positions[b * 3 + 2];
    const cx = positions[c * 3],
      cy = positions[c * 3 + 1],
      cz = positions[c * 3 + 2];
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const sourceDot = [a, b, c].reduce(
      (sum, index) =>
        sum +
        nx * sourceNormals[index * 3] +
        ny * sourceNormals[index * 3 + 1] +
        nz * sourceNormals[index * 3 + 2],
      0,
    );
    if (sourceDot < 0) [nx, ny, nz] = [-nx, -ny, -nz];
    for (const index of [a, b, c]) {
      normals[index * 3] += nx;
      normals[index * 3 + 1] += ny;
      normals[index * 3 + 2] += nz;
    }
  }

  const sharedPositions = new Map();
  for (let index = 0; index < positions.length / 3; index++) {
    const key = positions.slice(index * 3, index * 3 + 3).join(',');
    const sum = sharedPositions.get(key) ?? [0, 0, 0];
    sum[0] += normals[index * 3];
    sum[1] += normals[index * 3 + 1];
    sum[2] += normals[index * 3 + 2];
    sharedPositions.set(key, sum);
  }

  const result = new Float32Array(positions.length);
  for (let index = 0; index < positions.length / 3; index++) {
    const key = positions.slice(index * 3, index * 3 + 3).join(',');
    const [x, y, z] = sharedPositions.get(key);
    const length = Math.hypot(x, y, z) || 1;
    result[index * 3] = x / length;
    result[index * 3 + 1] = y / length;
    result[index * 3 + 2] = z / length;
  }
  return result;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
function png(mask) {
  const raw = Buffer.alloc(SIZE * (SIZE * 3 + 1));
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const rgb = COLORS[mask[y * SIZE + x] - 1] ?? [0, 0, 0];
      const at = y * (SIZE * 3 + 1) + 1 + x * 3;
      raw[at] = rgb[0];
      raw[at + 1] = rgb[1];
      raw[at + 2] = rgb[2];
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(SIZE);
  header.writeUInt32BE(SIZE, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
await mkdir('public/models/garments', { recursive: true });
const manifests = {};
for (const src of sources) {
  const {
    positions,
    normals,
    texcoords,
    triangleZones,
    removedStitchTriangles,
    triangles: inputTriangles,
  } = await readGarment(src);
  let triangles = inputTriangles;
  const groups = {};
  const planes = [
    [0, -src.sideBoundary],
    [0, src.sideBoundary],
    [2, src.centerZ],
  ];
  const output = [];
  triangles.forEach((ids, triangleIndex) => {
    let polygons = [ids];
    for (const [axis, limit] of ['body', 'front', 'back'].includes(
      triangleZones[triangleIndex],
    )
      ? planes
      : []) {
      const next = [];
      for (const polygon of polygons) {
        const values = polygon.map((id) => positions[id][axis] - limit);
        if (values.every((v) => v >= -1e-9) || values.every((v) => v <= 1e-9)) {
          next.push(polygon);
          continue;
        }
        const halves = [[], []];
        for (let i = 0; i < polygon.length; i++) {
          const a = polygon[i],
            b = polygon[(i + 1) % polygon.length],
            da = positions[a][axis] - limit,
            db = positions[b][axis] - limit;
          if (da >= 0) halves[0].push(a);
          if (da <= 0) halves[1].push(a);
          if (da * db < 0) {
            const t = da / (da - db),
              id = positions.length;
            positions.push(
              positions[a].map((v, j) => v + (positions[b][j] - v) * t),
            );
            normals.push(normals[a].clone().lerp(normals[b], t).normalize());
            texcoords.push(
              texcoords[a].map((v, j) => v + (texcoords[b][j] - v) * t),
            );
            halves[0].push(id);
            halves[1].push(id);
          }
        }
        next.push(...halves.filter((p) => p.length >= 3));
      }
      polygons = next;
    }
    for (const polygon of polygons)
      for (let i = 1; i < polygon.length - 1; i++) {
        const face = [polygon[0], polygon[i], polygon[i + 1]];
        const center = [0, 1, 2].map(
          (a) => face.reduce((n, id) => n + positions[id][a], 0) / 3,
        );
        let zone = triangleZones[triangleIndex];
        if (zone === 'body') zone = center[2] > src.centerZ ? 'front' : 'back';
        if (
          ['front', 'back'].includes(zone) &&
          Math.abs(center[0]) > src.sideBoundary
        )
          zone = center[0] > 0 ? 'sideLeft' : 'sideRight';
        (groups[zone] ??= []).push(face);
        output.push(face);
      }
  });
  triangles = output;
  const document = new Document();
  const buffer = document.createBuffer();
  const scene = document.createScene();
  const material = document
    .createMaterial('Fabric')
    .setBaseColorFactor([1, 1, 1, 1])
    .setRoughnessFactor(0.85)
    .setMetallicFactor(0)
    .setDoubleSided(true);
  const mask = new Uint8Array(SIZE * SIZE);
  let crossZoneOverlaps = 0;
  const manifest = {
    version: 1,
    modelId: src.id,
    source: {
      kind: 'licensed-glb',
      name: src.name,
      author: src.author,
      license: src.license,
      sourceUrl: src.sourceUrl,
      modifications: [
        'Original graphics removed; fabric material replaced',
        'Independent zone UV atlas and 4K mask',
        'Source GLB transforms baked; indexed geometry simplified with locked boundaries',
        'Mirrored sleeves and torso UVs separated; normalized scale',
        ...(removedStitchTriangles
          ? [
              'Sub-pixel stitch tube geometry removed; fabric shell and hems preserved',
            ]
          : []),
      ],
    },
    meshes: {},
    materials: ['Fabric'],
    atlas: {
      desktopSize: 2048,
      mobileSize: 1024,
      mask: {
        url: `/models/garments/${src.id}-sketchfab-mask.png`,
        sourceSize: SIZE,
        torsoSideExpansion: 0,
        colors: {},
        rects: {},
      },
      zones: {},
    },
    cameras: {
      front: { rotationY: 0, label: 'Frente' },
      back: { rotationY: Math.PI, label: 'Espalda' },
      left: { rotationY: (-Math.PI * 65) / 180, label: 'Lado izquierdo' },
      right: { rotationY: (Math.PI * 65) / 180, label: 'Lado derecho' },
    },
  };
  const counts = {},
    optimization = {};
  for (const [zone, faces] of Object.entries(groups)) {
    const rectArray = RECTS[zone];
    if (!rectArray) throw Error(`Missing atlas rect: ${zone}`);
    const [rx, ry, rw, rh] = rectArray;
    const rect = { x: rx, y: ry, width: rw, height: rh };
    const projected = faces.map((ids) =>
      ids.map((i) => projection(positions[i], zone, src, texcoords[i])),
    );
    // Unwrap triangles that cross the cylindrical seam without stretching across the atlas.
    if (zone === 'waistband')
      for (const points of projected) {
        const xs = points.map((p) => p[0]);
        if (Math.max(...xs) - Math.min(...xs) > Math.PI)
          points.forEach((p) => {
            if (p[0] < 0) p[0] += Math.PI * 2;
          });
      }
    const all = projected.flat();
    const min = [0, 1].map((a) =>
      all.reduce((n, p) => Math.min(n, p[a]), Infinity),
    );
    const max = [0, 1].map((a) =>
      all.reduce((n, p) => Math.max(n, p[a]), -Infinity),
    );
    const pos = [],
      norm = [],
      uv = [],
      indices = [];
    const vertices = new Map();
    const code = ZONES.indexOf(zone) + 1;
    faces.forEach((ids, faceIndex) => {
      const tex = projected[faceIndex].map((p) => [
        rx + ((p[0] - min[0]) / (max[0] - min[0])) * rw,
        ry + ((p[1] - min[1]) / (max[1] - min[1])) * rh,
      ]);
      ids.forEach((id, i) => {
        const key = `${id}:${tex[i].join(',')}`;
        let index = vertices.get(key);
        if (index === undefined) {
          index = pos.length / 3;
          vertices.set(key, index);
          const [x, y, z] = positions[id];
          pos.push(
            (x / src.height) * 3.85,
            ((y - src.bottom - src.height / 2) / src.height) * 3.85,
            ((z - src.centerZ) / src.height) * 3.85,
          );
          norm.push(...normals[id].toArray());
          uv.push(...tex[i]);
        }
        indices.push(index);
      });
      const pts = tex.map((p) => p.map((v) => v * SIZE));
      const [a, b, c] = pts;
      const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      if (Math.abs(d) < 1e-9) return;
      const xmin = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[0])))),
        xmax = Math.min(SIZE - 1, Math.ceil(Math.max(...pts.map((p) => p[0]))));
      const ymin = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[1])))),
        ymax = Math.min(SIZE - 1, Math.ceil(Math.max(...pts.map((p) => p[1]))));
      for (let y = ymin; y <= ymax; y++)
        for (let x = xmin; x <= xmax; x++) {
          const w0 =
            ((b[1] - c[1]) * (x + 0.5 - c[0]) +
              (c[0] - b[0]) * (y + 0.5 - c[1])) /
            d;
          const w1 =
            ((c[1] - a[1]) * (x + 0.5 - c[0]) +
              (a[0] - c[0]) * (y + 0.5 - c[1])) /
            d;
          if (w0 < 0 || w1 < 0 || 1 - w0 - w1 < 0) continue;
          const pixel = y * SIZE + x;
          if (mask[pixel] && mask[pixel] !== code) crossZoneOverlaps++;
          mask[pixel] = code;
        }
    });
    const [reduced, error] = MeshoptSimplifier.simplifyWithAttributes(
      new Uint32Array(indices),
      new Float32Array(pos),
      3,
      new Float32Array(uv),
      2,
      [0.2, 0.2],
      null,
      Math.max(12, Math.floor((indices.length * 0.25) / 3) * 3),
      0.001,
      ['LockBorder'],
    );
    const remap = new Map(),
      finalPos = [],
      sourceFinalNorm = [],
      finalUv = [];
    const finalIndices = Array.from(reduced, (id) => {
      if (!remap.has(id)) {
        remap.set(id, remap.size);
        finalPos.push(...pos.slice(id * 3, id * 3 + 3));
        sourceFinalNorm.push(...norm.slice(id * 3, id * 3 + 3));
        finalUv.push(...uv.slice(id * 2, id * 2 + 2));
      }
      return remap.get(id);
    });
    const finalNorm = createSmoothNormals(
      finalPos,
      finalIndices,
      sourceFinalNorm,
    );
    optimization[zone] = {
      sourceTriangles: faces.length,
      triangles: finalIndices.length / 3,
      error,
    };
    const accessor = (name, array, type) =>
      document
        .createAccessor(name)
        .setBuffer(buffer)
        .setType(type)
        .setArray(array);
    const primitive = document
      .createPrimitive()
      .setAttribute(
        'POSITION',
        accessor('position', new Float32Array(finalPos), 'VEC3'),
      )
      .setAttribute(
        'NORMAL',
        accessor('normal', finalNorm, 'VEC3'),
      )
      .setAttribute(
        'TEXCOORD_0',
        accessor('uv', new Float32Array(finalUv), 'VEC2'),
      )
      .setIndices(accessor('index', new Uint32Array(finalIndices), 'SCALAR'))
      .setMaterial(material);
    scene.addChild(
      document
        .createNode(zone)
        .setMesh(document.createMesh(zone).addPrimitive(primitive)),
    );
    manifest.meshes[zone] = [zone];
    manifest.atlas.mask.colors[zone] = [COLORS[code - 1]];
    manifest.atlas.mask.rects[zone] = [rect];
    manifest.atlas.zones[zone] = {
      rect,
      margin: 0.08,
      safePolygon: [
        [0.08, 0.08],
        [0.92, 0.08],
        [0.92, 0.92],
        [0.08, 0.92],
      ],
    };
    counts[zone] = finalIndices.length / 3;
  }
  if (crossZoneOverlaps) throw Error(`${src.id}: overlapping zones`);
  const coverage = Object.fromEntries(
    Object.keys(groups).map((z) => [
      z,
      mask.reduce((n, c) => n + Number(c === ZONES.indexOf(z) + 1), 0),
    ]),
  );
  if (Object.values(coverage).some((n) => n === 0))
    throw Error('Empty UV zone');
  await new NodeIO().write(
    `public/models/garments/${src.id}-sketchfab.glb`,
    document,
  );
  await writeFile(
    `public/models/garments/${src.id}-sketchfab-mask.png`,
    png(mask),
  );
  manifests[src.id] = manifest;
  await writeFile(
    `public/models/garments/${src.id}-audit.json`,
    JSON.stringify(
      {
        sourceSha256: src.sha256,
        sourceTriangles: inputTriangles.length + removedStitchTriangles,
        removedStitchTriangles,
        triangles: Object.values(counts).reduce((a, b) => a + b, 0),
        counts,
        optimization,
        coverage,
        crossZoneOverlaps,
      },
      null,
      2,
    ),
  );
  console.log(src.id, JSON.stringify(counts));
}
await writeFile(
  'lib/garment-manifests.json',
  JSON.stringify(manifests, null, 2) + '\n',
);
