'use client';

import { useEffect } from 'react';

import { webMcpColorInputSchema, webMcpTemplateInputSchema, webMcpTextInputSchema } from '@/lib/schema';
import { useEditorStore } from '@/store/editor-store';

type ToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown;
};

declare global {
  interface Document {
    readonly modelContext?: {
      registerTool(tool: ToolDefinition, options?: { signal?: AbortSignal }): void | Promise<void>;
    };
  }
}

const zoneEnum = ['front', 'back', 'sleeveLeft', 'sleeveRight', 'collar', 'sideLeft', 'sideRight'];

export function useWebMcp(onExport: () => Promise<void>) {
  useEffect(() => {
    const context = window.document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: ToolDefinition) => {
      try {
        void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch((error) => console.warn('WebMCP:', error));
      } catch (error) {
        console.warn('WebMCP:', error);
      }
    };

    register({
      name: 'apply_shirt_template',
      title: 'Aplicar plantilla de camiseta',
      description: 'Aplica una de las seis plantillas del editor al diseño visible.',
      inputSchema: { type: 'object', properties: { templateId: { type: 'string', enum: ['blank', 'duotone', 'shoulders', 'sides', 'diagonal', 'stripe'] } }, required: ['templateId'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        const { templateId } = webMcpTemplateInputSchema.parse(input);
        useEditorStore.getState().applyTemplate(templateId);
        return { applied: true, templateId };
      },
    });
    register({
      name: 'change_shirt_zone_color',
      title: 'Cambiar color de una zona',
      description: 'Cambia el color hexadecimal de una zona imprimible de la camiseta.',
      inputSchema: { type: 'object', properties: { zone: { type: 'string', enum: zoneEnum }, color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' } }, required: ['zone', 'color'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        const { zone, color } = webMcpColorInputSchema.parse(input);
        useEditorStore.getState().setZoneColor(zone, color.toUpperCase());
        return { changed: true, zone, color: color.toUpperCase() };
      },
    });
    register({
      name: 'add_shirt_text',
      title: 'Añadir texto a la camiseta',
      description: 'Añade una capa de texto, nombre o número a una zona de la camiseta.',
      inputSchema: { type: 'object', properties: { text: { type: 'string', minLength: 1, maxLength: 120 }, zone: { type: 'string', enum: zoneEnum, default: 'front' }, subtype: { type: 'string', enum: ['free', 'name', 'number'], default: 'free' } }, required: ['text'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute(input) {
        const parsed = webMcpTextInputSchema.parse(input);
        const store = useEditorStore.getState();
        if (store.document.layers.length >= 20) throw new Error('No se pudo añadir el texto; el diseño ya contiene 20 elementos.');
        store.setSelectedZone(parsed.zone);
        const content = parsed.subtype === 'name' ? parsed.text.toUpperCase() : parsed.text;
        const layerId = store.addTextLayer(parsed.subtype, content);
        if (!layerId) throw new Error('No se pudo añadir el texto; revisa el límite de 20 elementos.');
        return { added: true, layerId, zone: parsed.zone };
      },
    });
    register({
      name: 'export_shirt_design',
      title: 'Exportar diseño de camiseta',
      description: 'Completa la exportación local del proyecto y descarga un ZIP con JSON, recursos y cuatro vistas PNG.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute() {
        await onExport();
        return { exported: true, fileName: 'diseno-camiseta.zip' };
      },
    });
    return () => lifecycle.abort();
  }, [onExport]);
}
