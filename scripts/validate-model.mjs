import { readFile } from 'node:fs/promises';
import * as validator from 'gltf-validator';

const modelPath = process.argv[2] ?? new URL('../public/models/taller-sport.glb', import.meta.url);
const bytes = new Uint8Array(await readFile(modelPath));
const report = await validator.validateBytes(bytes, {
  uri: 'taller-sport.glb',
  maxIssues: 100,
  externalResourceFunction: async () => new Uint8Array(),
});

const summary = {
  errors: report.issues.numErrors,
  warnings: report.issues.numWarnings,
  infos: report.issues.numInfos,
  hints: report.issues.numHints,
};
console.log(JSON.stringify(summary));
if (summary.warnings > 0) {
  console.log(JSON.stringify(report.issues.messages.filter((message) => message.severity <= 1), null, 2));
}
if (summary.errors > 0) {
  console.error(JSON.stringify(report.issues.messages, null, 2));
  process.exitCode = 1;
}
