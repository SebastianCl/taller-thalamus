import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { Matrix3, Matrix4, Vector3 } from 'three';

export const sources = [
  {
    id: 'taller-camisilla-v1',
    file: 'undershirt.glb',
    label: 'Camisilla',
    name: 'Kapiti_CC_20_Undershirt',
    author: 'Tineli',
    license: 'CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)',
    sourceUrl:
      'https://sketchfab.com/3d-models/kapiti-cc-20-undershirt-2a37056f25e440c5b57774e8e5197347',
    sha256: '9128a41f38398a6daf40aa77c5e485775b45b82c22bd3c10b5b938d0361d70d5',
    pieces: ['bindings', 'front', 'back'],
    sideBoundary: 13,
    centerZ: -0.5,
  },
  {
    id: 'taller-hoodie-v1',
    file: 'hoodie.glb',
    label: 'Hoodie',
    name: 'Hoodie',
    author: 'ShoyoX (embedded source credit: yogaminggames)',
    license: 'CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)',
    sourceUrl:
      'https://sketchfab.com/3d-models/hoodie-2c674228f1e946b5b8f508f8f818e130',
    sha256: '249be85dc3fe1dfc47640383e4bc79c1e43b6e1748db41e8c273201a01dc4ff9',
    pieces: ['body', 'sleeves', 'hood', 'pocket', 'waistband', 'cuffs'],
    sideBoundary: 18.5,
    centerZ: 1.5,
  },
  {
    id: 'taller-camibuso-v1',
    file: 'long_sleeve_t-_shirt.glb',
    label: 'Camibuso',
    name: 'Long Sleeve T- Shirt',
    author: 'chokybali',
    license: 'CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)',
    sourceUrl:
      'https://sketchfab.com/3d-models/long-sleeve-t-shirt-ef22cf345c174b569fdfa6a653a6bf6f',
    sha256: '4e6caffbe391a8aa051b400e3318c76b17996c2ef90b9cde700768cee38add25',
    pieces: [
      'sleeves',
      'back',
      'front',
      'waistband',
      'collar',
      'cuffRight',
      'cuffLeft',
    ],
    sideBoundary: 13.5,
    centerZ: 1.5,
  },
];

// These two supplied files contain uncompressed, static garment geometry. Apply
// their complete node transforms; do not treat the FBX conversion root as identity.
export async function readGarment(src) {
  const bytes = await readFile(`scripts/model-sources/${src.file}`);
  if (createHash('sha256').update(bytes).digest('hex') !== src.sha256)
    throw Error(
      `${src.file}: source changed; review sewing-piece assignments first`,
    );
  const doc = await new NodeIO().readBinary(bytes);
  const positions = [],
    normals = [],
    texcoords = [],
    triangles = [];
  let removedStitchTriangles = 0;
  for (const node of doc.getRoot().listNodes()) {
    if (!node.getMesh()) continue;
    const world = new Matrix4().fromArray(node.getWorldMatrix());
    const normalMatrix = new Matrix3().getNormalMatrix(world);
    for (const primitive of node.getMesh().listPrimitives()) {
      const index = primitive.getIndices();
      // Material2868 is thousands of individual stitch tubes, not garment fabric.
      // Remove that sub-pixel detail; preserve the complete shell and its hems.
      if (
        src.id === 'taller-camibuso-v1' &&
        primitive.getMaterial() !== doc.getRoot().listMaterials()[0]
      ) {
        removedStitchTriangles += index.getCount() / 3;
        continue;
      }
      const offset = positions.length;
      const p = primitive.getAttribute('POSITION'),
        n = primitive.getAttribute('NORMAL'),
        uv = primitive.getAttribute('TEXCOORD_0');
      for (let i = 0; i < p.getCount(); i++) {
        positions.push(
          new Vector3(...p.getElement(i, []))
            .applyMatrix4(world)
            .multiplyScalar(100)
            .toArray(),
        );
        normals.push(
          new Vector3(...n.getElement(i, []))
            .applyMatrix3(normalMatrix)
            .normalize(),
        );
        texcoords.push(uv.getElement(i, []));
      }
      for (let i = 0; i < index.getCount(); i += 3)
        triangles.push([0, 1, 2].map((j) => offset + index.getScalar(i + j)));
    }
  }
  // Sewing UV islands survive the source's arbitrary 65K-vertex partitions.
  // Mirrored sleeves share source UVs; assign left/right after identifying fabric.
  const keys = new Map(),
    parent = [];
  const ids = texcoords.map((uv) => {
    const key = uv.map((v) => v.toFixed(6)).join(',');
    if (!keys.has(key)) {
      keys.set(key, parent.length);
      parent.push(parent.length);
    }
    return keys.get(key);
  });
  const find = (id) => {
    while (parent[id] !== id) {
      parent[id] = parent[parent[id]];
      id = parent[id];
    }
    return id;
  };
  for (const face of triangles) {
    const root = find(ids[face[0]]);
    for (const id of face.slice(1)) parent[find(ids[id])] = root;
  }
  const counts = new Map();
  for (const face of triangles) {
    const r = find(ids[face[0]]);
    counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  const ordered = [...counts].sort((a, b) => b[1] - a[1]);
  if (ordered.length !== src.pieces.length)
    throw Error(`${src.file}: unexpected sewing islands`);
  const pieces = new Map(ordered.map(([r], i) => [r, src.pieces[i]]));
  const triangleZones = triangles.map((face) => {
    const piece = pieces.get(find(ids[face[0]]));
    const x = face.reduce((sum, id) => sum + positions[id][0], 0) / 3;
    if (piece === 'bindings')
      return Math.abs(x) < 10
        ? 'collar'
        : x > 0
          ? 'armholeLeft'
          : 'armholeRight';
    if (piece === 'sleeves') return x > 0 ? 'sleeveLeft' : 'sleeveRight';
    if (piece === 'cuffs') return x > 0 ? 'cuffLeft' : 'cuffRight';
    return piece;
  });
  src.bottom = positions.reduce((min, p) => Math.min(min, p[1]), Infinity);
  src.height =
    positions.reduce((max, p) => Math.max(max, p[1]), -Infinity) - src.bottom;
  if (src.id === 'taller-camisilla-v1') {
    // The source bindings use a single constant UV. Reconstruct each ring's
    // centerline, then unwrap its length and width into a printable strip.
    src.rings = {};
    for (const zone of ['collar', 'armholeLeft', 'armholeRight']) {
      const vertices = new Set();
      triangles.forEach((face, i) => {
        if (triangleZones[i] === zone) face.forEach((id) => vertices.add(id));
      });
      const bins = Array.from({ length: 128 }, () => []);
      for (const id of vertices) {
        const [angle, radius] = ringPoint(positions[id], zone);
        bins[Math.floor(((angle + Math.PI) / (Math.PI * 2)) * 128) % 128].push(
          radius,
        );
      }
      src.rings[zone] = bins.map((_, index) => {
        const radii = [-2, -1, 0, 1, 2].flatMap(
          (delta) => bins[(index + delta + 128) % 128],
        );
        if (!radii.length) throw Error(`Empty binding arc: ${zone}`);
        return (Math.min(...radii) + Math.max(...radii)) / 2;
      });
    }
  }
  return {
    positions,
    normals,
    texcoords,
    triangles,
    triangleZones,
    removedStitchTriangles,
  };
}

export function projection(p, zone, src, uv) {
  const [x, y, z] = p;
  if (zone === 'front' || zone === 'pocket') return [x, -y];
  if (zone === 'back') return [-x, -y];
  if (zone === 'sideLeft') return [-z, -y];
  if (zone === 'sideRight') return [z, -y];
  if (zone === 'waistband') return [Math.atan2(x, z - src.centerZ), -y];
  if (src.rings?.[zone]) {
    const [angle, radius] = ringPoint(p, zone);
    const at = ((angle + Math.PI) / (2 * Math.PI)) * 128 - 0.5;
    const bin = Math.floor(at),
      t = at - bin;
    const profile = src.rings[zone];
    const center =
      profile[(bin + 128) % 128] * (1 - t) + profile[(bin + 129) % 128] * t;
    return [angle, radius - center];
  }
  return [uv[0], -uv[1]];
}

function ringPoint([x, y, z], zone) {
  const a = zone === 'collar' ? x + 0.066 : (y - 24.3) * 0.86;
  const b =
    zone === 'collar' ? (z + 0.76) * 0.866 - (y - 33.49) * 0.5 : z + 1.5;
  return [Math.atan2(a, b), Math.hypot(a, b)];
}
