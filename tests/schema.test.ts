import { describe, expect, it } from 'vitest';

import { createDocument } from '@/lib/design';
import { designDocumentSchema, parseDesignDocument, webMcpColorInputSchema, webMcpTemplateInputSchema, webMcpTextInputSchema } from '@/lib/schema';

describe('DesignDocument', () => {
  it('serializa y valida un documento versión 1', () => {
    const document = createDocument();
    const restored = designDocumentSchema.parse(JSON.parse(JSON.stringify(document)));
    expect(restored).toEqual(document);
  });

  it('rechaza coordenadas de capa fuera de la zona', () => {
    const document = createDocument();
    document.layers.push({
      id: 'bad', type: 'text', subtype: 'free', text: 'X', font: 'Inter', color: '#FFFFFF', background: null,
      zone: 'front', order: 0, visible: true, locked: false,
      transform: { x: 1.4, y: 0.5, scale: 1, rotation: 0 },
    });
    expect(designDocumentSchema.safeParse(document).success).toBe(false);
  });

  it('valida colores de WebMCP sin aceptar CSS arbitrario', () => {
    expect(webMcpColorInputSchema.safeParse({ zone: 'front', color: '#12AEEF' }).success).toBe(true);
    expect(webMcpColorInputSchema.safeParse({ zone: 'front', color: 'url(javascript:1)' }).success).toBe(false);
  });

  it('mantiene el enum de plantillas idéntico en ejecución WebMCP', () => {
    expect(webMcpTemplateInputSchema.safeParse({ templateId: 'stripe' }).success).toBe(true);
    expect(webMcpTemplateInputSchema.safeParse({ templateId: 'inventada' }).success).toBe(false);
  });

  it('aplica las restricciones visibles a números WebMCP', () => {
    expect(webMcpTextInputSchema.safeParse({ text: '27', subtype: 'number' }).success).toBe(true);
    expect(webMcpTextInputSchema.safeParse({ text: 'DOS', subtype: 'number' }).success).toBe(false);
  });

  it('rechaza identificadores y órdenes de capa duplicados', () => {
    const document = createDocument();
    const layer = {
      id: 'same', type: 'text' as const, subtype: 'free' as const, text: 'X', font: 'Inter', color: '#FFFFFF', background: null,
      zone: 'front' as const, order: 0, visible: true, locked: false,
      transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0 },
    };
    document.layers.push(layer, { ...layer });
    expect(designDocumentSchema.safeParse(document).success).toBe(false);
  });

  it('migra documentos heredados versión 0 y completa zonas nuevas', () => {
    const legacy = createDocument() as unknown as Record<string, unknown>;
    legacy.schemaVersion = 0;
    legacy.templateId = 'desconocida';
    const zones = legacy.zones as Record<string, unknown>;
    delete zones.collar;
    const migrated = parseDesignDocument(legacy);
    expect(migrated.schemaVersion).toBe(1);
    expect(migrated.templateId).toBe('blank');
    expect(migrated.zones.collar.color).toMatch(/^#/);
  });
});
