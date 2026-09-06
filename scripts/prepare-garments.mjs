import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { Document, NodeIO } from '@gltf-transform/core';
import { Vector3 } from 'three';

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
  hood: [0.46, 0.55, 0.3, 0.31],
  collar: [0.78, 0.55, 0.2, 0.07],
  cuffLeft: [0.78, 0.65, 0.09, 0.19],
  cuffRight: [0.89, 0.65, 0.09, 0.19],
  waistband: [0.02, 0.89, 0.96, 0.09],
};
const sources = [
  {
    id: 'taller-hoodie-v1',
    file: 'ladieshoodiedown1.obj',
    label: 'Hoodie',
    name: 'elvs_hooded_sweat_jacket1',
    author: 'Elvaerwyn',
    license: 'CC BY (as declared by the author)',
    sourceUrl:
      'https://static.makehumancommunity.org/assets/assetpacks/shirts02.html',
    height: 6.2516,
    bottom: -0.3978,
    centerZ: 0.4,
  },
  {
    id: 'taller-camibuso-v1',
    file: 'sweater_fisherman.obj',
    label: 'Camibuso',
    name: 'toigo_fisherman_sweater',
    author: 'MargaretToigo',
    license: 'CC0 1.0',
    sourceUrl:
      'https://static.makehumancommunity.org/assets/assetpacks/shirts01.html',
    height: 5.7783,
    bottom: 1.1552,
    centerZ: 0.5,
  },
];
const SIZE = 4096;
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
function classify([x, y, z], src) {
  const a = Math.abs(x),
    side = x >= 0 ? 'Left' : 'Right';
  if (src.id === 'taller-camibuso-v1') {
    if (a > 4.4) return `cuff${side}`;
    if (a > 2.02 || (a > 1.62 && y > 4.6)) return `sleeve${side}`;
    if (y < 1.68) return 'waistband';
    if (y > 6.3 && a < 0.92) return 'collar';
    if (a > 1.48 && y < 5.4) return `side${side}`;
    return z > 0.24 ? 'front' : 'back';
  }
  if (a > 3.84 && y < 2.1) return `cuff${side}`;
  if (a > 2.05 || (a > 1.55 && y > 2.9 && y < 4.65)) return `sleeve${side}`;
  if (y < 0.17) return 'waistband';
  if (y > 4.7 || (y > 4.15 && z < -0.63)) return 'hood';
  if (a > 1.42 && y < 4.3) return `side${side}`;
  return z > 0.4 ? 'front' : 'back';
}
function projection(p, zone, src) {
  const [x, y, z] = p;
  if (zone === 'front') return [x, -y];
  if (zone === 'back') return [-x, -y];
  if (zone === 'sideLeft') return [-z, -y];
  if (zone === 'sideRight') return [z, -y];
  if (zone === 'hood') return [Math.atan2(x, z - src.centerZ), -y];
  if (zone === 'collar' || zone === 'waistband')
    return [Math.atan2(x, z - src.centerZ), -y];
  // Sleeve axis follows the relaxed arm pose; a cylindrical unwrap exposes its entire circumference.
  const side = zone.endsWith('Left') ? 1 : -1;
  const cx = Math.max(
    1.7,
    1.7 + (src.id === 'taller-hoodie-v1' ? 4.8 - y : 6.0 - y) * 0.72,
  );
  return [
    Math.atan2(
      z - (src.id === 'taller-hoodie-v1' ? 0.65 : 0.55),
      x * side - cx,
    ),
    -y,
  ];
}
await mkdir('public/models/garments', { recursive: true });
const manifests = {};
for (const src of sources) {
  const text = await readFile(`scripts/model-sources/${src.file}`, 'utf8');
  const positions = [];
  let triangles = [];
  const uvParents = [];
  const triangleUvs = [];
  const findUv = (id) => {
    while (uvParents[id] !== id) {
      uvParents[id] = uvParents[uvParents[id]];
      id = uvParents[id];
    }
    return id;
  };
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim().split(/\s+/);
    if (t[0] === 'v') positions.push(t.slice(1, 4).map(Number));
    if (t[0] === 'vt') uvParents.push(uvParents.length);
    if (t[0] === 'f') {
      const ids = t.slice(1).map((v) => Number(v.split('/')[0]) - 1);
      const uvIds = t.slice(1).map((v) => Number(v.split('/')[1]) - 1);
      for (const uvId of uvIds.slice(1))
        uvParents[findUv(uvId)] = findUv(uvIds[0]);
      for (let i = 1; i < ids.length - 1; i++) {
        triangles.push([ids[0], ids[i], ids[i + 1]]);
        triangleUvs.push(uvIds[0]);
      }
    }
  }
  const normals = positions.map(() => new Vector3());
  const groups = {};
  for (const ids of triangles) {
    const p = ids.map((i) => positions[i]);
    const n = new Vector3()
      .subVectors(new Vector3(...p[1]), new Vector3(...p[0]))
      .cross(
        new Vector3().subVectors(new Vector3(...p[2]), new Vector3(...p[0])),
      );
    ids.forEach((i) => normals[i].add(n));
  }
  normals.forEach((n) => n.normalize());
  const islands = new Map();
  triangles.forEach((ids, i) => {
    const root = findUv(triangleUvs[i]);
    const vertices = islands.get(root) ?? [];
    vertices.push(...ids);
    islands.set(root, vertices);
  });
  const islandZones = new Map();
  for (const [root, ids] of islands) {
    const ps = ids.map((i) => positions[i]);
    const ymin = Math.min(...ps.map((p) => p[1])),
      ymax = Math.max(...ps.map((p) => p[1]));
    const xmean = ps.reduce((n, p) => n + p[0], 0) / ps.length,
      zmean = ps.reduce((n, p) => n + p[2], 0) / ps.length;
    islandZones.set(
      root,
      ymax < 1.7
        ? 'waistband'
        : ymin > 6.2
          ? 'collar'
          : Math.abs(xmean) > 4.3
            ? `cuff${xmean > 0 ? 'Left' : 'Right'}`
            : Math.abs(xmean) > 2.3
              ? `sleeve${xmean > 0 ? 'Left' : 'Right'}`
              : zmean > 0.3
                ? 'front'
                : 'back',
    );
  }
  // Cut geometry at classification boundaries, interpolating normals. This avoids
  // sawtooth color edges even on the low-poly source and preserves its silhouette.
  const planes =
    src.id === 'taller-hoodie-v1'
      ? [
          [0, -3.84],
          [0, -2.05],
          [0, -1.55],
          [0, -1.42],
          [0, 1.42],
          [0, 1.55],
          [0, 2.05],
          [0, 3.84],
          [1, 0.17],
          [1, 2.1],
          [1, 2.9],
          [1, 4.15],
          [1, 4.3],
          [1, 4.65],
          [1, 4.7],
          [2, -0.63],
          [2, 0.4],
        ]
      : [
          [0, -1.48],
          [0, 1.48],
          [1, 5.4],
        ];
  const output = [];
  triangles.forEach((ids, triangleIndex) => {
    let polygons = [ids];
    for (const [axis, limit] of planes) {
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
        let zone =
          src.id === 'taller-hoodie-v1'
            ? classify(center, src)
            : islandZones.get(findUv(triangleUvs[triangleIndex]));
        if (
          src.id === 'taller-camibuso-v1' &&
          ['front', 'back'].includes(zone) &&
          Math.abs(center[0]) > 1.48 &&
          center[1] < 5.4
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
        'Converted OBJ to indexed GLB; normalized scale',
      ],
    },
    meshes: {},
    materials: ['Fabric'],
    atlas: {
      desktopSize: 2048,
      mobileSize: 1024,
      mask: {
        url: `/models/garments/${src.id}-mask.png`,
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
  const counts = {};
  for (const [zone, faces] of Object.entries(groups)) {
    const rectArray = RECTS[zone];
    if (!rectArray) throw Error(`Missing atlas rect: ${zone}`);
    const [rx, ry, rw, rh] = rectArray;
    const rect = { x: rx, y: ry, width: rw, height: rh };
    const projected = faces.map((ids) =>
      ids.map((i) => projection(positions[i], zone, src)),
    );
    // Unwrap triangles that cross the cylindrical seam without stretching across the atlas.
    if (!['front', 'back', 'sideLeft', 'sideRight'].includes(zone))
      for (const points of projected) {
        const xs = points.map((p) => p[0]);
        if (Math.max(...xs) - Math.min(...xs) > Math.PI)
          points.forEach((p) => {
            if (p[0] < 0) p[0] += Math.PI * 2;
          });
      }
    const all = projected.flat();
    const min = [0, 1].map((a) => Math.min(...all.map((p) => p[a])));
    const max = [0, 1].map((a) => Math.max(...all.map((p) => p[a])));
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
        accessor('position', new Float32Array(pos), 'VEC3'),
      )
      .setAttribute(
        'NORMAL',
        accessor('normal', new Float32Array(norm), 'VEC3'),
      )
      .setAttribute('TEXCOORD_0', accessor('uv', new Float32Array(uv), 'VEC2'))
      .setIndices(accessor('index', new Uint32Array(indices), 'SCALAR'))
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
    counts[zone] = faces.length;
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
  await new NodeIO().write(`public/models/garments/${src.id}.glb`, document);
  await writeFile(`public/models/garments/${src.id}-mask.png`, png(mask));
  manifests[src.id] = manifest;
  await writeFile(
    `public/models/garments/${src.id}-audit.json`,
    JSON.stringify(
      { triangles: triangles.length, counts, coverage, crossZoneOverlaps },
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
