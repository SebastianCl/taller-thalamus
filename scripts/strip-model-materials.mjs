import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;

const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) throw new Error('Uso: node scripts/strip-model-materials.mjs <entrada.glb> <salida.glb>');

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  });
const document = await io.read(input);
const root = document.getRoot();

for (const material of root.listMaterials()) {
  material
    .setBaseColorTexture(null)
    .setNormalTexture(null)
    .setOcclusionTexture(null)
    .setMetallicRoughnessTexture(null)
    .setBaseColorFactor([1, 1, 1, 1])
    .setMetallicFactor(0)
    .setRoughnessFactor(0.84);
}
for (const texture of root.listTextures()) texture.dispose();
await io.write(output, document);
