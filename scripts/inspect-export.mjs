import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';

const input = process.argv[2];
if (!input) throw new Error('Uso: node scripts/inspect-export.mjs <proyecto.zip>');
const zip = await JSZip.loadAsync(await readFile(input));
const files = Object.keys(zip.files).filter((name) => !zip.files[name].dir).sort();
const dimensions = {};
for (const name of files.filter((entry) => entry.startsWith('vistas/') && entry.endsWith('.png'))) {
  const bytes = await zip.file(name).async('uint8array');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  dimensions[name] = { width: view.getUint32(16), height: view.getUint32(20) };
}
console.log(JSON.stringify({ files, dimensions }, null, 2));
