import { z } from 'zod';
import { ALL_ZONE_IDS, GARMENT_ZONES, MODEL_IDS } from '@/lib/garment-types';
import { createDocument, ZONE_IDS, type DesignDocument } from '@/lib/design';

const zoneIdSchema = z.enum(ALL_ZONE_IDS);
const templateIds = ['blank', 'duotone', 'shoulders', 'sides', 'diagonal', 'stripe'] as const;
const transformSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  scale: z.number().min(0.1).max(4),
  rotation: z.number().min(-3600).max(3600),
});

const baseLayerSchema = z.object({
  id: z.string().min(1),
  zone: zoneIdSchema,
  order: z.number().int().nonnegative(),
  visible: z.boolean(),
  locked: z.boolean(),
  transform: transformSchema,
});

const textLayerSchema = baseLayerSchema.extend({
  type: z.literal('text'),
  subtype: z.enum(['free', 'name', 'number']),
  text: z.string().max(120),
  font: z.string().min(1).max(64),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  background: z.string().regex(/^#[0-9a-f]{6}$/i).nullable(),
});

const imageLayerSchema = baseLayerSchema.extend({
  type: z.literal('image'),
  assetId: z.string().min(1),
  name: z.string().min(1).max(180),
});

const zoneStyleSchema = z.object({
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  accent: z.string().regex(/^#[0-9a-f]{6}$/i),
  pattern: z.string().max(40).nullable(),
  patternColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  patternOpacity: z.number().min(0).max(1),
  patternScale: z.number().min(0.25).max(4),
  patternAngle: z.number().min(-360).max(360),
  gradient: z.object({
    from: z.string().regex(/^#[0-9a-f]{6}$/i),
    to: z.string().regex(/^#[0-9a-f]{6}$/i),
    angle: z.number().min(-360).max(360),
    offset: z.number().min(-1).max(1),
  }).nullable(),
});

export const designDocumentSchema = z.object({
  schemaVersion: z.literal(2),
  id: z.string().min(1),
  modelId: z.enum(MODEL_IDS),
  templateId: z.enum(templateIds),
  zones: z.partialRecord(zoneIdSchema, zoneStyleSchema),
  layers: z.array(z.discriminatedUnion('type', [imageLayerSchema, textLayerSchema])).max(20),
  modifiedAt: z.string().min(1),
}).superRefine((document, context) => {
  for (const zone of GARMENT_ZONES[document.modelId]) {
    if (!document.zones[zone]) context.addIssue({ code: 'custom', path: ['zones', zone], message: 'Falta una zona de la prenda.' });
  }
  const ids = new Set<string>();
  const orders = new Set<number>();
  document.layers.forEach((layer, index) => {
    if (!document.zones[layer.zone]) context.addIssue({ code: 'custom', path: ['layers', index, 'zone'], message: 'La capa no tiene una zona guardada.' });
    if (ids.has(layer.id)) context.addIssue({ code: 'custom', path: ['layers', index, 'id'], message: 'El identificador de capa está duplicado.' });
    if (orders.has(layer.order)) context.addIssue({ code: 'custom', path: ['layers', index, 'order'], message: 'El orden de capa está duplicado.' });
    ids.add(layer.id);
    orders.add(layer.order);
  });
  for (let order = 0; order < document.layers.length; order += 1) {
    if (!orders.has(order)) context.addIssue({ code: 'custom', path: ['layers'], message: 'El orden de las capas debe ser continuo.' });
  }
});

export const webMcpTemplateInputSchema = z.object({ templateId: z.enum(templateIds) }).strict();
export const webMcpColorInputSchema = z.object({ zone: zoneIdSchema, color: z.string().regex(/^#[0-9a-f]{6}$/i) }).strict();
export const webMcpTextInputSchema = z.object({
  text: z.string().trim().min(1).max(120),
  zone: zoneIdSchema.default('front'),
  subtype: z.enum(['free', 'name', 'number']).default('free'),
}).strict().superRefine((value, context) => {
  if (value.subtype === 'number' && !/^\d{1,3}$/.test(value.text)) {
    context.addIssue({ code: 'custom', path: ['text'], message: 'Los números deben contener de 1 a 3 dígitos.' });
  }
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseDesignDocument(input: unknown): DesignDocument {
  if (isRecord(input) && input.schemaVersion === 1) {
    // V1 only supported the original shirt. Never silently accept another model.
    z.literal('taller-sport-v1').parse(input.modelId);
    return designDocumentSchema.parse({ ...input, schemaVersion: 2 }) as DesignDocument;
  }
  if (!isRecord(input) || input.schemaVersion !== 0) return designDocumentSchema.parse(input) as DesignDocument;
  const fallback = createDocument();
  const legacyZones = isRecord(input.zones) ? input.zones : {};
  const zones = Object.fromEntries(ZONE_IDS.map((zone) => [
    zone,
    { ...fallback.zones[zone], ...(isRecord(legacyZones[zone]) ? legacyZones[zone] : {}) },
  ]));
  const layers = Array.isArray(input.layers)
    ? input.layers.map((layer, order) => isRecord(layer) ? { visible: true, locked: false, ...layer, order } : layer)
    : [];
  return designDocumentSchema.parse({
    ...input,
    schemaVersion: 2,
    id: typeof input.id === 'string' ? input.id : fallback.id,
    modelId: 'taller-sport-v1',
    templateId: templateIds.includes(input.templateId as typeof templateIds[number]) ? input.templateId : 'blank',
    zones,
    layers,
    modifiedAt: typeof input.modifiedAt === 'string' ? input.modifiedAt : new Date().toISOString(),
  }) as DesignDocument;
}
