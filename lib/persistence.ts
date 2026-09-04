import DOMPurify from 'dompurify';
import { openDB, type DBSchema } from 'idb';

import type { DesignDocument } from '@/lib/design';

export type AssetRecord = {
  id: string;
  fileName: string;
  mime: string;
  width: number;
  height: number;
  originalBlob: Blob;
  renderBlob: Blob;
  previewUrl: string;
  createdAt: string;
};

type StoredAsset = Omit<AssetRecord, 'previewUrl'>;

interface TallerDatabase extends DBSchema {
  documents: { key: string; value: DesignDocument };
  assets: { key: string; value: StoredAsset };
}

const DB_NAME = 'taller-3d-local';
const DB_VERSION = 1;
const CURRENT_KEY = 'current';
const ACCEPTED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);

async function database() {
  return openDB<TallerDatabase>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('documents')) db.createObjectStore('documents');
      if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets');
    },
  });
}

export async function saveSession(document: DesignDocument, assets: Record<string, AssetRecord>) {
  const db = await database();
  const transaction = db.transaction(['documents', 'assets'], 'readwrite');
  await transaction.objectStore('documents').put(document, CURRENT_KEY);
  await transaction.objectStore('assets').clear();
  const referencedAssets = new Set(document.layers.filter((layer) => layer.type === 'image').map((layer) => layer.assetId));
  for (const asset of Object.values(assets)) {
    if (!referencedAssets.has(asset.id)) continue;
    const { previewUrl: _previewUrl, ...stored } = asset;
    await transaction.objectStore('assets').put(stored, stored.id);
  }
  await transaction.done;
}

export async function loadSession() {
  const db = await database();
  const [document, storedAssets] = await Promise.all([
    db.get('documents', CURRENT_KEY),
    db.getAll('assets'),
  ]);
  const referencedAssets = new Set(document?.layers.filter((layer) => layer.type === 'image').map((layer) => layer.assetId) ?? []);
  const assets = Object.fromEntries(storedAssets.filter((asset) => referencedAssets.has(asset.id)).map((asset) => [
    asset.id,
    { ...asset, previewUrl: URL.createObjectURL(asset.renderBlob) } satisfies AssetRecord,
  ]));
  return { document, assets };
}

export async function clearSession() {
  const db = await database();
  const transaction = db.transaction(['documents', 'assets'], 'readwrite');
  await transaction.objectStore('documents').clear();
  await transaction.objectStore('assets').clear();
  await transaction.done;
}

async function readDimensions(blob: Blob) {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    });
    image.src = url;
    await loaded;
    return { width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function validateDimensions({ width, height }: { width: number; height: number }) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) throw new Error('La imagen no tiene dimensiones válidas.');
  if (width > 8192 || height > 8192 || width * height > 40_000_000) throw new Error('La imagen es demasiado grande. Usa un máximo de 8192 px por lado y 40 megapíxeles.');
}

async function rasterizeSvg(source: string) {
  const svgBlob = new Blob([source], { type: 'image/svg+xml' });
  const dimensions = await readDimensions(svgBlob);
  validateDimensions(dimensions);
  const scale = Math.min(1, 4096 / Math.max(dimensions.width, dimensions.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(dimensions.width * scale));
  canvas.height = Math.max(1, Math.round(dimensions.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No se pudo rasterizar el SVG.');
  const url = URL.createObjectURL(svgBlob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('No se pudo rasterizar el SVG.'));
      image.src = url;
    });
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const renderBlob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('No se pudo rasterizar el SVG.')), 'image/png'));
    return { renderBlob, dimensions };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function sanitizeSvg(source: string) {
  const sanitized = DOMPurify.sanitize(source, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['script', 'style', 'foreignObject', 'iframe', 'audio', 'video'],
    FORBID_ATTR: ['style', 'src', 'onload', 'onclick', 'onerror', 'onmouseover', 'href', 'xlink:href'],
  });
  if (!/<svg[\s>]/i.test(sanitized)) throw new Error('El SVG no contiene un gráfico válido.');
  return sanitized;
}

export async function createAssetRecord(file: File): Promise<AssetRecord> {
  if (file.size > 10 * 1024 * 1024) throw new Error('El archivo supera el límite de 10 MB.');
  if (!ACCEPTED_MIME.has(file.type)) {
    const extension = file.name.split('.').pop()?.toUpperCase() ?? 'ARCHIVO';
    if (['PDF', 'EPS', 'AI'].includes(extension)) throw new Error(`${extension} no es compatible. Exporta tu logo como SVG, PNG, JPEG o WebP.`);
    throw new Error('Formato no compatible. Usa PNG, JPEG, WebP o SVG.');
  }

  let renderBlob: Blob = file;
  let dimensions: { width: number; height: number };
  if (file.type === 'image/svg+xml') {
    const sanitized = sanitizeSvg(await file.text());
    const rasterized = await rasterizeSvg(sanitized);
    renderBlob = rasterized.renderBlob;
    dimensions = rasterized.dimensions;
  } else {
    dimensions = await readDimensions(renderBlob);
    validateDimensions(dimensions);
  }
  return {
    id: crypto.randomUUID(),
    fileName: file.name,
    mime: file.type,
    width: dimensions.width,
    height: dimensions.height,
    originalBlob: file,
    renderBlob,
    previewUrl: URL.createObjectURL(renderBlob),
    createdAt: new Date().toISOString(),
  };
}
