import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { NodeIO } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';
import { GARMENTS } from '@/lib/garments';
import { GARMENT_ZONES } from '@/lib/garment-types';
import { zoneFromAtlasUv, localPointFromAtlasUv } from '@/lib/model-manifest';

// The build pipeline emits RGB PNGs with unfiltered rows. Read the actual
// raster, not the audit, to check the final simplified geometry against it.
function maskPixels(png: Buffer) {
  const chunks: Buffer[] = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT')
      chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  return inflateSync(Buffer.concat(chunks));
}

describe('recursos de las prendas', () => {
  it('conserva exactamente el modelo y la máscara de camiseta', async () => {
    for (const [path, hash] of [
      [
        'public/models/taller-sport.glb',
        '86772ce5123f8cd74323692028f6cb018394acdfae30861bb195d3d75916a6b8',
      ],
      [
        'public/models/uv-zone-mask.png',
        '10f9f1637e1afb9755e4445c4694e3aaccf0e821660f8d8d80b854910645acff',
      ],
    ]) {
      expect(
        createHash('sha256')
          .update(await readFile(path))
          .digest('hex'),
      ).toBe(hash);
    }
  });

  it.each(GARMENTS.filter((garment) => garment.id !== 'taller-sport-v1'))(
    '$label tiene mallas, UV y máscaras independientes para todas sus zonas',
    async (garment) => {
      const document = await new NodeIO().read(`public${garment.url}`);
      const mask = await readFile(`public${garment.manifest.atlas.mask.url}`);
      const pixels = maskPixels(mask);
      const size = mask.readUInt32BE(16);
      const meshes = document.getRoot().listMeshes();
      expect(meshes.map((mesh) => mesh.getName()).sort()).toEqual(
        [...GARMENT_ZONES[garment.id]].sort(),
      );
      for (const zone of GARMENT_ZONES[garment.id]) {
        const { rect } = garment.manifest.atlas.zones[zone];
        const mesh = meshes.find((mesh) => mesh.getName() === zone)!;
        const primitive = mesh.listPrimitives()[0];
        const uv = primitive.getAttribute('TEXCOORD_0')!;
        expect(primitive.getAttribute('POSITION')!.getCount()).toBeGreaterThan(
          2,
        );
        for (let i = 0; i < uv.getCount(); i++) {
          const [u, v] = uv.getElement(i, [0, 0]);
          expect(u).toBeGreaterThanOrEqual(rect.x - 1e-6);
          expect(v).toBeGreaterThanOrEqual(rect.y - 1e-6);
          expect(u).toBeLessThanOrEqual(rect.x + rect.width + 1e-6);
          expect(v).toBeLessThanOrEqual(rect.y + rect.height + 1e-6);
        }
        const indices = primitive.getIndices()!;
        const expected = garment.manifest.atlas.mask.colors[zone][0];
        let missing = 0,
          samples = 0;
        for (let i = 0; i < indices.getCount(); i += 51) {
          const points = [0, 1, 2].map((j) =>
            uv.getElement(indices.getScalar(i + j), [0, 0]),
          );
          const u = points.reduce((n, p) => n + p[0], 0) / 3;
          const v = points.reduce((n, p) => n + p[1], 0) / 3;
          expect(zoneFromAtlasUv(u, v, garment.manifest)).toBe(zone);
          const local = localPointFromAtlasUv(
            zone,
            u,
            v,
            undefined,
            garment.manifest,
          );
          expect(local.x).toBeGreaterThanOrEqual(-1e-5);
          expect(local.y).toBeGreaterThanOrEqual(-1e-5);
          let covered = false;
          // Include two source pixels for sub-pixel boundary triangles. Runtime
          // adds a larger gutter after resizing, before picking or rendering.
          for (let dy = -2; dy <= 2; dy++)
            for (let dx = -2; dx <= 2; dx++) {
              const x = Math.floor(u * size) + dx,
                y = Math.floor(v * size) + dy;
              if (x < 0 || y < 0 || x >= size || y >= size) continue;
              const at = y * (size * 3 + 1) + 1 + x * 3;
              if (expected.every((c, k) => pixels[at + k] === c))
                covered = true;
            }
          if (!covered) missing++;
          samples++;
        }
        expect(
          missing,
          `${zone}: ${missing}/${samples} triangles without mask coverage`,
        ).toBe(0);
      }
      const audit = JSON.parse(
        await readFile(
          `public/models/garments/${garment.id}-audit.json`,
          'utf8',
        ),
      );
      expect(audit.crossZoneOverlaps).toBe(0);
      const sourceHash = {
        'taller-hoodie-v1':
          '249be85dc3fe1dfc47640383e4bc79c1e43b6e1748db41e8c273201a01dc4ff9',
        'taller-camibuso-v1':
          '4e6caffbe391a8aa051b400e3318c76b17996c2ef90b9cde700768cee38add25',
        'taller-camisilla-v1':
          '9128a41f38398a6daf40aa77c5e485775b45b82c22bd3c10b5b938d0361d70d5',
      }[garment.id];
      expect(audit.sourceSha256).toBe(sourceHash);
      expect(audit.triangles).toBeLessThan(audit.sourceTriangles * 0.4);
      expect(garment.manifest.source.sourceUrl).toContain(
        'sketchfab.com/3d-models/',
      );
      for (const zone of GARMENT_ZONES[garment.id])
        expect(audit.coverage[zone]).toBeGreaterThan(0);
      const png = await readFile(`public${garment.manifest.atlas.mask.url}`);
      expect(png.readUInt32BE(16)).toBe(4096);
      expect(png.readUInt32BE(20)).toBe(4096);
    },
  );
});
