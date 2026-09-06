import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';
import { GARMENTS } from '@/lib/garments';
import { GARMENT_ZONES } from '@/lib/garment-types';

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

  it.each(GARMENTS.slice(1))(
    '$label tiene mallas, UV y máscaras independientes para todas sus zonas',
    async (garment) => {
      const document = await new NodeIO().read(`public${garment.url}`);
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
      }
      const audit = JSON.parse(
        await readFile(
          `public/models/garments/${garment.id}-audit.json`,
          'utf8',
        ),
      );
      expect(audit.crossZoneOverlaps).toBe(0);
      for (const zone of GARMENT_ZONES[garment.id])
        expect(audit.coverage[zone]).toBeGreaterThan(0);
      const png = await readFile(`public${garment.manifest.atlas.mask.url}`);
      expect(png.readUInt32BE(16)).toBe(4096);
      expect(png.readUInt32BE(20)).toBe(4096);
    },
  );
});
