import { GARMENT_ZONES, type GarmentZoneId, type ModelId } from '@/lib/garment-types';

export const ZONE_IDS = [
  'front',
  'back',
  'sleeveLeft',
  'sleeveRight',
  'collar',
  'sideLeft',
  'sideRight',
] as const;

export type ZoneId = GarmentZoneId;
export type ToolId =
  | 'design'
  | 'color'
  | 'pattern'
  | 'gradient'
  | 'text'
  | 'name'
  | 'number'
  | 'logo'
  | 'layers';
export type ViewId = 'front' | 'back' | 'left' | 'right';

export type ZoneStyle = {
  color: string;
  accent: string;
  pattern: string | null;
  patternColor: string;
  patternOpacity: number;
  patternScale: number;
  patternAngle: number;
  gradient: null | { from: string; to: string; angle: number; offset: number };
};

export type LayerTransform = {
  x: number;
  y: number;
  scale: number;
  rotation: number;
};

export type BaseLayer = {
  id: string;
  zone: ZoneId;
  order: number;
  visible: boolean;
  locked: boolean;
  transform: LayerTransform;
};

export type ImageLayer = BaseLayer & {
  type: 'image';
  assetId: string;
  name: string;
};

export type TextLayer = BaseLayer & {
  type: 'text';
  subtype: 'free' | 'name' | 'number';
  text: string;
  font: string;
  color: string;
  background: string | null;
};

export type DesignLayer = ImageLayer | TextLayer;

export type DesignDocument = {
  schemaVersion: 2;
  id: string;
  modelId: ModelId;
  templateId: string;
  zones: Record<ZoneId, ZoneStyle>;
  layers: DesignLayer[];
  modifiedAt: string;
};

export const ZONE_LABELS: Record<ZoneId, string> = {
  front: 'Frente',
  back: 'Espalda',
  sleeveLeft: 'Manga izquierda',
  sleeveRight: 'Manga derecha',
  collar: 'Cuello',
  sideLeft: 'Lateral izquierdo',
  sideRight: 'Lateral derecho',
  hood: 'Capucha',
  pocket: 'Bolsillo',
  cuffLeft: 'Puño izquierdo',
  cuffRight: 'Puño derecho',
  waistband: 'Pretina',
};

export const PALETTE = [
  '#F7F8FA', '#111827', '#334155', '#64748B', '#8B1E3F', '#D7263D',
  '#F35B04', '#FFB000', '#F5DD2A', '#72B01D', '#159947', '#0B7A75',
  '#00A7C4', '#1677FF', '#1746A2', '#312E81', '#6D28D9', '#9D4EDD',
  '#D946EF', '#E54887', '#C08457', '#8B5E3C', '#E7D7C1', '#B7C9E2',
] as const;

const baseZone = (color = '#F7F8FA'): ZoneStyle => ({
  color,
  accent: '#1677FF',
  pattern: null,
  patternColor: '#0F2B5B',
  patternOpacity: 0.34,
  patternScale: 1,
  patternAngle: 0,
  gradient: null,
});

export const createDocument = (modelId: ModelId = 'taller-sport-v1'): DesignDocument => ({
  schemaVersion: 2,
  id: crypto.randomUUID(),
  modelId,
  templateId: 'blank',
  zones: Object.fromEntries(GARMENT_ZONES[modelId].map((zone) => [zone, baseZone()])) as Record<ZoneId, ZoneStyle>,
  layers: [],
  modifiedAt: new Date().toISOString(),
});

export const TEMPLATES = [
  { id: 'blank', name: 'Lienzo limpio', colors: ['#F7F8FA'], apply: {} },
  { id: 'duotone', name: 'Dos tonos', colors: ['#102A43', '#00A7C4'], apply: { front: '#102A43', back: '#102A43', sleeveLeft: '#00A7C4', sleeveRight: '#00A7C4' } },
  { id: 'shoulders', name: 'Hombros', colors: ['#E8EDF4', '#1677FF'], apply: { front: '#E8EDF4', back: '#E8EDF4', sleeveLeft: '#1677FF', sleeveRight: '#1677FF', collar: '#1677FF' } },
  { id: 'sides', name: 'Laterales', colors: ['#F7F8FA', '#D7263D'], apply: { sideLeft: '#D7263D', sideRight: '#D7263D', collar: '#D7263D' } },
  { id: 'diagonal', name: 'Diagonal', colors: ['#0F2B5B', '#F35B04'], apply: { front: '#0F2B5B', back: '#0F2B5B', sleeveLeft: '#F35B04', sideRight: '#F35B04' } },
  { id: 'stripe', name: 'Franja', colors: ['#F7F8FA', '#159947'], apply: { collar: '#159947', sleeveLeft: '#159947', sleeveRight: '#159947', sideLeft: '#159947', sideRight: '#159947' } },
] as const;
