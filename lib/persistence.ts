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
  projects: { key: string; value: StoredProject };
  versions: { key: string; value: StoredVersion; indexes: { 'by-project': string } };
  meta: { key: string; value: string };
}

const DB_NAME = 'taller-3d-local';
const DB_VERSION = 2;
const CURRENT_KEY = 'current';
const ACTIVE_PROJECT_KEY = 'active-project';
const MAX_VERSIONS = 20;
const ACCEPTED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);

export type ProjectSummary = {
  id: string;
  name: string;
  modelId: DesignDocument['modelId'];
  createdAt: string;
  updatedAt: string;
  thumbnail: Blob | null;
};

export type ProjectVersionSummary = {
  id: string;
  projectId: string;
  createdAt: string;
  thumbnail: Blob | null;
};

type StoredProject = ProjectSummary & { document: DesignDocument };
type StoredVersion = ProjectVersionSummary & { document: DesignDocument };

export type LoadedProject = { project: ProjectSummary; document: DesignDocument; assets: Record<string, AssetRecord> };

async function database() {
  return openDB<TallerDatabase>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('documents')) db.createObjectStore('documents');
      if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets');
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('versions')) {
        const store = db.createObjectStore('versions', { keyPath: 'id' });
        store.createIndex('by-project', 'projectId');
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    },
  });
}

function summary(project: StoredProject): ProjectSummary {
  const { document: _document, ...result } = project;
  return result;
}

function referencedAssetIds(document: DesignDocument) {
  return new Set(document.layers.filter((layer) => layer.type === 'image').map((layer) => layer.assetId));
}

function cleanName(name: string) {
  return name.trim().slice(0, 80) || 'Diseño sin título';
}

type AssetTransaction = { objectStore: (name: 'assets') => { put: (value: StoredAsset, key: string) => Promise<unknown> } };

async function putAssets(transaction: AssetTransaction, document: DesignDocument, assets: Record<string, AssetRecord>) {
  const referencedAssets = referencedAssetIds(document);
  for (const asset of Object.values(assets)) {
    if (!referencedAssets.has(asset.id)) continue;
    const { previewUrl: _previewUrl, ...stored } = asset;
    await transaction.objectStore('assets').put(stored, stored.id);
  }
}

async function restoreAssets(db: Awaited<ReturnType<typeof database>>, document: DesignDocument) {
  const ids = [...referencedAssetIds(document)];
  const stored = await Promise.all(ids.map((id) => db.get('assets', id)));
  return Object.fromEntries(stored.flatMap((asset) => asset ? [[asset.id, { ...asset, previewUrl: URL.createObjectURL(asset.renderBlob) } satisfies AssetRecord]] : []));
}

async function garbageCollectAssets() {
  const db = await database();
  const [projects, versions, assets] = await Promise.all([db.getAll('projects'), db.getAll('versions'), db.getAll('assets')]);
  const referenced = new Set([...projects, ...versions].flatMap((item) => [...referencedAssetIds(item.document)]));
  const transaction = db.transaction('assets', 'readwrite');
  for (const asset of assets) if (!referenced.has(asset.id)) await transaction.store.delete(asset.id);
  await transaction.done;
}

async function migrateLegacy(document: DesignDocument) {
  const db = await database();
  if ((await db.count('projects')) > 0) return;
  const legacy = await db.get('documents', CURRENT_KEY);
  const source = legacy ?? document;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const migrated = { ...structuredClone(source), id };
  const transaction = db.transaction(['projects', 'meta'], 'readwrite');
  await transaction.objectStore('projects').put({ id, name: legacy ? 'Diseño recuperado' : 'Diseño sin título', modelId: migrated.modelId, createdAt: now, updatedAt: now, thumbnail: null, document: migrated });
  await transaction.objectStore('meta').put(id, ACTIVE_PROJECT_KEY);
  await transaction.done;
}

export async function listProjects(initialDocument: DesignDocument) {
  await migrateLegacy(initialDocument);
  const db = await database();
  return (await db.getAll('projects')).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(summary);
}

export async function getActiveProject(initialDocument: DesignDocument): Promise<LoadedProject> {
  await migrateLegacy(initialDocument);
  const db = await database();
  const id = await db.get('meta', ACTIVE_PROJECT_KEY);
  const project = id ? await db.get('projects', id) : undefined;
  if (!project) throw new Error('No se encontró el proyecto activo.');
  return { project: summary(project), document: project.document, assets: await restoreAssets(db, project.document) };
}

export async function openProject(id: string): Promise<LoadedProject> {
  const db = await database();
  const project = await db.get('projects', id);
  if (!project) throw new Error('El proyecto ya no existe.');
  const transaction = db.transaction('meta', 'readwrite');
  await transaction.store.put(id, ACTIVE_PROJECT_KEY);
  await transaction.done;
  return { project: summary(project), document: project.document, assets: await restoreAssets(db, project.document) };
}

export async function saveProject(projectId: string, document: DesignDocument, assets: Record<string, AssetRecord>) {
  const db = await database();
  const project = await db.get('projects', projectId);
  if (!project) throw new Error('El proyecto ya no existe.');
  const updatedAt = new Date().toISOString();
  const transaction = db.transaction(['projects', 'assets'], 'readwrite');
  await transaction.objectStore('projects').put({ ...project, document: structuredClone(document), modelId: document.modelId, updatedAt });
  await putAssets(transaction, document, assets);
  await transaction.done;
  return { ...summary(project), modelId: document.modelId, updatedAt };
}

export async function createProject(name: string, document: DesignDocument, assets: Record<string, AssetRecord>, thumbnail: Blob | null = null) {
  const db = await database();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const stored = { id, name: cleanName(name), modelId: document.modelId, createdAt: now, updatedAt: now, thumbnail, document: { ...structuredClone(document), id } } satisfies StoredProject;
  const transaction = db.transaction(['projects', 'assets', 'meta'], 'readwrite');
  await transaction.objectStore('projects').put(stored);
  await putAssets(transaction, stored.document, assets);
  await transaction.objectStore('meta').put(id, ACTIVE_PROJECT_KEY);
  await transaction.done;
  return { project: summary(stored), document: stored.document, assets };
}

export async function renameProject(id: string, name: string) {
  const db = await database(); const project = await db.get('projects', id);
  if (!project) throw new Error('El proyecto ya no existe.');
  const updated = { ...project, name: cleanName(name), updatedAt: new Date().toISOString() };
  await db.put('projects', updated); return summary(updated);
}

export async function duplicateProject(id: string) {
  const db = await database();
  const project = await db.get('projects', id);
  if (!project) throw new Error('El proyecto ya no existe.');
  const assets = await restoreAssets(db, project.document);
  const newId = crypto.randomUUID(); const now = new Date().toISOString();
  const copy = { ...project, id: newId, name: cleanName(`Copia de ${project.name}`), createdAt: now, updatedAt: now, document: { ...structuredClone(project.document), id: newId } };
  await db.put('projects', copy);
  return { project: summary(copy), document: copy.document, assets };
}

export async function deleteProject(id: string) {
  const db = await database();
  const projects = await db.getAll('projects');
  if (projects.length <= 1) throw new Error('Debe permanecer al menos un proyecto en la biblioteca.');
  const project = projects.find((item) => item.id === id);
  if (!project) throw new Error('El proyecto ya no existe.');
  const activeId = await db.get('meta', ACTIVE_PROJECT_KEY);
  const replacement = projects
    .filter((item) => item.id !== id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const transaction = db.transaction(['projects', 'versions', 'meta'], 'readwrite');
  await transaction.objectStore('projects').delete(id);
  for (const version of await transaction.objectStore('versions').index('by-project').getAll(id)) await transaction.objectStore('versions').delete(version.id);
  if (activeId === id) await transaction.objectStore('meta').put(replacement.id, ACTIVE_PROJECT_KEY);
  await transaction.done;
  await garbageCollectAssets();
  return activeId === id ? replacement.id : activeId;
}

export async function listVersions(projectId: string) {
  const db = await database();
  return (await db.getAllFromIndex('versions', 'by-project', projectId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(({ document: _document, ...version }) => version);
}

export async function saveVersion(projectId: string, document: DesignDocument, assets: Record<string, AssetRecord>, thumbnail: Blob | null) {
  const db = await database(); const project = await db.get('projects', projectId);
  if (!project) throw new Error('El proyecto ya no existe.');
  const createdAt = new Date().toISOString();
  const version: StoredVersion = { id: crypto.randomUUID(), projectId, createdAt, thumbnail, document: structuredClone(document) };
  const transaction = db.transaction(['projects', 'versions', 'assets'], 'readwrite');
  await transaction.objectStore('versions').put(version);
  await transaction.objectStore('projects').put({ ...project, document: structuredClone(document), modelId: document.modelId, thumbnail, updatedAt: createdAt });
  await putAssets(transaction, document, assets);
  const versions = await transaction.objectStore('versions').index('by-project').getAll(projectId);
  for (const old of versions.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(MAX_VERSIONS)) await transaction.objectStore('versions').delete(old.id);
  await transaction.done;
  await garbageCollectAssets();
  return version;
}

export async function restoreVersion(projectId: string, versionId: string, currentDocument: DesignDocument, assets: Record<string, AssetRecord>) {
  await saveVersion(projectId, currentDocument, assets, null);
  const db = await database(); const version = await db.get('versions', versionId);
  if (!version || version.projectId !== projectId) throw new Error('La versión ya no existe.');
  const project = await db.get('projects', projectId);
  if (!project) throw new Error('El proyecto ya no existe.');
  const updatedAt = new Date().toISOString();
  await db.put('projects', { ...project, document: structuredClone(version.document), modelId: version.document.modelId, thumbnail: version.thumbnail, updatedAt });
  return { project: { ...summary(project), modelId: version.document.modelId, thumbnail: version.thumbnail, updatedAt }, document: version.document, assets: await restoreAssets(db, version.document) } satisfies LoadedProject;
}

// Legacy test helpers remain available while callers migrate to projects.
export async function saveSession(document: DesignDocument, assets: Record<string, AssetRecord>) {
  const loaded = await getActiveProject(document);
  return saveProject(loaded.project.id, document, assets);
}
export async function loadSession() {
  const db = await database();
  const id = await db.get('meta', ACTIVE_PROJECT_KEY);
  const project = id ? await db.get('projects', id) : undefined;
  if (!project) return { document: undefined, assets: {} };
  return { document: project.document, assets: await restoreAssets(db, project.document) };
}
export async function clearSession() { const db = await database(); const tx = db.transaction(['documents', 'assets', 'projects', 'versions', 'meta'], 'readwrite'); for (const store of ['documents', 'assets', 'projects', 'versions', 'meta'] as const) await tx.objectStore(store).clear(); await tx.done; }

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
