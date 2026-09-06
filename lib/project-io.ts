import JSZip from 'jszip';
import { getGarment } from '@/lib/garments';
import { z } from 'zod';

import type { DesignDocument, ViewId } from '@/lib/design';
import { createAssetRecord, type AssetRecord } from '@/lib/persistence';
import { designDocumentSchema, parseDesignDocument } from '@/lib/schema';

type AssetManifestItem = {
  id: string;
  fileName: string;
  mime: string;
  width: number;
  height: number;
  createdAt: string;
  path: string;
};

const assetManifestSchema = z.array(z.object({
  id: z.uuid(),
  fileName: z.string().min(1).max(180),
  mime: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']),
  width: z.number().int().min(1).max(8192),
  height: z.number().int().min(1).max(8192),
  createdAt: z.string().min(1).max(80),
  path: z.string().min(1).max(300).refine((path) => path.startsWith('assets/files/') && !path.includes('..') && !path.includes('\\'), 'Ruta de recurso inválida.'),
}).strict()).max(20);

const MAX_PROJECT_BYTES = 230 * 1024 * 1024;
const MAX_JSON_BYTES = 2 * 1024 * 1024;

function declaredSize(entry: unknown) {
  const sized = entry as { _data?: { uncompressedSize?: number } };
  return sized._data?.uncompressedSize ?? 0;
}

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/\.{2,}/g, '.').replace(/^[.-]+|[.-]+$/g, '') || 'logo';
}

export async function exportProject(
  document: DesignDocument,
  assets: Record<string, AssetRecord>,
  views: Record<ViewId, Blob>,
) {
  const zip = new JSZip();
  const source = getGarment(document.modelId).manifest.source;
  const validatedDocument = designDocumentSchema.parse(document);
  zip.file('design.json', JSON.stringify(validatedDocument, null, 2));

  const assetManifest: AssetManifestItem[] = [];
  const assetFolder = zip.folder('assets/files');
  const referencedAssets = new Set(validatedDocument.layers.filter((layer) => layer.type === 'image').map((layer) => layer.assetId));
  for (const asset of Object.values(assets)) {
    if (!referencedAssets.has(asset.id)) continue;
    const safeId = z.uuid().parse(asset.id);
    const path = `${safeId}-${safeName(asset.fileName)}`;
    assetFolder?.file(path, await asset.originalBlob.arrayBuffer());
    assetManifest.push({
      id: asset.id,
      fileName: asset.fileName,
      mime: asset.mime,
      width: asset.width,
      height: asset.height,
      createdAt: asset.createdAt,
      path: `assets/files/${path}`,
    });
  }
  zip.file('assets/manifest.json', JSON.stringify(assetManifest, null, 2));

  const viewFolder = zip.folder('vistas');
  for (const view of ['front', 'back', 'left', 'right'] as ViewId[]) {
    viewFolder?.file(`${view}.png`, await views[view].arrayBuffer());
  }

  zip.file(
    'LICENCIA-Y-CREDITOS.txt',
    [
      'Taller 3D — Créditos del proyecto',
      '',
      'Modelo de referencia:',
      `${source.name} — ${source.author}`,
      `Fuente: ${source.sourceUrl}`,
      `Licencia: ${source.license}`,
      `Modificaciones en Taller 3D: ${source.modifications.join('; ')}`,
      '',
      'Los logos y textos añadidos por el cliente permanecen locales y son responsabilidad de su propietario.',
    ].join('\n'),
  );

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function importProject(file: File) {
  if (file.size > MAX_PROJECT_BYTES) throw new Error('El proyecto supera el límite de seguridad de 230 MB.');
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  if (entries.length > 32) throw new Error('El proyecto contiene demasiados archivos.');
  const declaredTotal = entries.reduce((total, entry) => total + declaredSize(entry), 0);
  if (declaredTotal > MAX_PROJECT_BYTES) throw new Error('El contenido descomprimido del proyecto supera 230 MB.');
  const designFile = zip.file('design.json');
  if (!designFile) throw new Error('El ZIP no contiene design.json.');
  if (declaredSize(designFile) > MAX_JSON_BYTES) throw new Error('design.json es demasiado grande.');
  const designSource = await designFile.async('string');
  if (new Blob([designSource]).size > MAX_JSON_BYTES) throw new Error('design.json es demasiado grande.');
  const document = parseDesignDocument(JSON.parse(designSource));

  const manifestFile = zip.file('assets/manifest.json');
  if (manifestFile && declaredSize(manifestFile) > MAX_JSON_BYTES) throw new Error('El manifiesto de recursos es demasiado grande.');
  const manifestSource = manifestFile ? await manifestFile.async('string') : '[]';
  if (new Blob([manifestSource]).size > MAX_JSON_BYTES) throw new Error('El manifiesto de recursos es demasiado grande.');
  const manifest = assetManifestSchema.parse(JSON.parse(manifestSource));
  const manifestById = new Map<string, AssetManifestItem>();
  for (const meta of manifest) {
    if (manifestById.has(meta.id)) throw new Error(`El recurso ${meta.id} está duplicado.`);
    manifestById.set(meta.id, meta);
  }
  const assets = Object.create(null) as Record<string, AssetRecord>;
  try {
    for (const layer of document.layers) {
      if (layer.type !== 'image' || assets[layer.assetId]) continue;
      const meta = manifestById.get(layer.assetId);
      if (!meta) throw new Error(`El proyecto no incluye el logo usado por la capa “${layer.name}”.`);
      const entry = zip.file(meta.path);
      if (!entry) throw new Error(`Falta el recurso ${meta.fileName}.`);
      if (declaredSize(entry) > 10 * 1024 * 1024) throw new Error(`El recurso ${meta.fileName} supera 10 MB.`);
      const blob = await entry.async('blob');
      if (blob.size > 10 * 1024 * 1024) throw new Error(`El recurso ${meta.fileName} supera 10 MB.`);
      const reconstructed = new File([blob], meta.fileName, { type: meta.mime, lastModified: Date.now() });
      const record = await createAssetRecord(reconstructed);
      record.id = meta.id;
      record.createdAt = meta.createdAt;
      assets[record.id] = record;
    }
    return { document, assets };
  } catch (error) {
    for (const asset of Object.values(assets)) URL.revokeObjectURL(asset.previewUrl);
    throw error;
  }
}
