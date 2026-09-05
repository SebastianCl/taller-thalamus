'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Blend,
  CircleDotDashed,
  Cloud,
  CloudAlert,
  Download,
  FilePlus2,
  FolderOpen,
  ImagePlus,
  Layers3,
  LoaderCircle,
  Palette,
  Redo2,
  Save,
  Shapes,
  Shirt,
  Sparkles,
  Type,
  Undo2,
  UserRound,
} from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast, Toaster } from '@/components/ui/toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ToolPanelContent } from '@/components/editor/tool-panel';
import { clearSession } from '@/lib/persistence';
import { downloadBlob, exportProject, importProject } from '@/lib/project-io';
import { type ToolId } from '@/lib/design';
import { cn } from '@/lib/utils';
import { useAutosave } from '@/hooks/use-autosave';
import { useWebMcp } from '@/hooks/use-webmcp';
import { useEditorStore } from '@/store/editor-store';

const ShirtStage = dynamic(
  () => import('./shirt-stage').then((module) => module.ShirtStage),
  {
    ssr: false,
    loading: () => (
      <div className="editor-grid flex h-full items-center justify-center">
        <div className="flex items-center gap-3 rounded-full bg-white px-4 py-2 text-sm text-slate-600 shadow-sm">
          <span className="size-2 animate-pulse rounded-full bg-sky-500" /> Preparando visor 3D…
        </div>
      </div>
    ),
  },
);

export const TOOLS: { id: ToolId; label: string; icon: typeof Palette }[] = [
  { id: 'design', label: 'Diseño', icon: Shapes },
  { id: 'color', label: 'Color', icon: Palette },
  { id: 'pattern', label: 'Patrón', icon: CircleDotDashed },
  { id: 'gradient', label: 'Degradado', icon: Blend },
  { id: 'text', label: 'Texto', icon: Type },
  { id: 'name', label: 'Nombre', icon: UserRound },
  { id: 'number', label: 'Número', icon: Sparkles },
  { id: 'logo', label: 'Imagen', icon: ImagePlus },
  { id: 'layers', label: 'Capas', icon: Layers3 },
];

function BrandMark() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 text-white shadow-[0_8px_22px_rgba(22,119,255,.28)]">
        <Shirt className="size-5" strokeWidth={2.2} />
      </span>
      <span className="hidden leading-none xs:block sm:block">
        <strong className="block font-heading text-[15px] font-bold tracking-[-.02em] text-slate-950">Taller 3D</strong>
        <span className="mt-1 hidden text-[10px] font-medium uppercase tracking-[.13em] text-slate-400 lg:block">Estudio de camisetas</span>
      </span>
    </div>
  );
}

function ToolRail() {
  const activeTool = useEditorStore((state) => state.activeTool);
  const setActiveTool = useEditorStore((state) => state.setActiveTool);
  return (
    <nav className="hidden w-[68px] shrink-0 flex-col items-center gap-1 border-r border-white/10 bg-slate-900 px-1.5 py-3 text-slate-200 md:flex lg:w-[76px] lg:px-2" aria-label="Herramientas de diseño">
      {TOOLS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => setActiveTool(id)}
          className={cn(
            'flex min-h-14 w-full flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-sky-300',
            activeTool === id ? 'bg-sky-400 text-slate-950' : 'text-slate-300 hover:bg-white/8 hover:text-white',
          )}
          aria-current={activeTool === id ? 'page' : undefined}
        >
          <Icon className="size-[18px]" strokeWidth={1.9} />
          {label}
        </button>
      ))}
    </nav>
  );
}

function ContextPanel({ mobile = false }: { mobile?: boolean }) {
  const activeTool = useEditorStore((state) => state.activeTool);
  const label = TOOLS.find((tool) => tool.id === activeTool)?.label;
  return (
    <aside className={cn('relative z-10 flex shrink-0 flex-col bg-white', mobile ? 'h-[42dvh] min-h-0 border-t md:hidden' : 'hidden w-[318px] border-r md:flex')} aria-label="Opciones de diseño">
      <div className={cn('flex items-center justify-between border-b', mobile ? 'px-4 py-2.5' : 'px-5 pb-4 pt-5')}>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-sky-600">{label}</p>
          <h1 className={cn('font-heading font-bold tracking-[-.025em] text-slate-950', mobile ? 'text-base' : 'mt-1 text-xl')}>Crea tu equipación</h1>
        </div>
        <Badge variant="secondary" className="rounded-full">Local</Badge>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className={cn('space-y-7', mobile ? 'p-4 pb-8' : 'p-5 pb-28')}>
          <ToolPanelContent />
          <footer className="border-t pt-4 text-[10px] leading-relaxed text-slate-400">
            Modelo 3D de <a className="underline underline-offset-2 hover:text-slate-600" href="https://sketchfab.com/3d-models/men-regular-apparel-fit-sporty-t-shirt-4d055bb8c1e04549a4b2dac7b27ebb2c" target="_blank" rel="noreferrer">BINARYCLOTH</a>, modificado bajo <a className="underline underline-offset-2 hover:text-slate-600" href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>.
          </footer>
        </div>
      </ScrollArea>
    </aside>
  );
}

function MobileTools() {
  const activeTool = useEditorStore((state) => state.activeTool);
  const setActiveTool = useEditorStore((state) => state.setActiveTool);
  return (
    <nav className="safe-bottom flex h-[68px] shrink-0 items-start gap-1 overflow-x-auto border-t bg-white px-2 pt-1.5 md:hidden" aria-label="Herramientas de diseño">
      {TOOLS.map(({ id, label, icon: Icon }) => (
        <button key={id} type="button" onClick={() => setActiveTool(id)} className={cn('flex min-h-12 min-w-[64px] flex-col items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-medium', activeTool === id ? 'bg-sky-50 text-sky-700' : 'text-slate-500')} aria-current={activeTool === id ? 'page' : undefined} aria-pressed={activeTool === id}>
          <Icon className="size-5" />{label}
        </button>
      ))}
    </nav>
  );
}

function AutosaveIndicator() {
  const status = useEditorStore((state) => state.autosaveStatus);
  const content = status === 'loading'
    ? { icon: LoaderCircle, label: 'Restaurando…', className: 'animate-spin text-slate-400' }
    : status === 'saving'
      ? { icon: LoaderCircle, label: 'Guardando…', className: 'animate-spin text-sky-500' }
      : status === 'error'
        ? { icon: CloudAlert, label: 'Error de almacenamiento', className: 'text-amber-500' }
        : { icon: Cloud, label: 'Guardado en este dispositivo', className: 'text-emerald-500' };
  const Icon = content.icon;
  return <output aria-live="polite" className="flex min-h-11 items-center gap-2 text-xs text-slate-500"><Icon className={cn('size-4', content.className)} /><span className={cn(status === 'error' ? 'inline' : 'sr-only sm:not-sr-only')}>{content.label}</span></output>;
}

export function EditorShell() {
  const [newDialog, setNewDialog] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  const saveNow = useAutosave();
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const canUndo = useEditorStore((state) => state.past.length > 0);
  const canRedo = useEditorStore((state) => state.future.length > 0);
  const exporting = useEditorStore((state) => state.exportStatus === 'working');
  const setExportStatus = useEditorStore((state) => state.setExportStatus);
  const newDesign = useEditorStore((state) => state.newDesign);
  const replaceImportedDesign = useEditorStore((state) => state.replaceImportedDesign);

  const handleNewDesign = useCallback(async () => {
    try {
      await clearSession();
      newDesign();
      setNewDialog(false);
    } catch {
      toast.add({ title: 'No se pudo crear el diseño', description: 'El proyecto actual se conserva. Comprueba el almacenamiento del navegador.', type: 'error' });
    }
  }, [newDesign]);

  const handleExport = useCallback(async () => {
    if (useEditorStore.getState().exportStatus === 'working') return;
    setExportStatus('working');
    const previousSelection = useEditorStore.getState().selectedLayerId;
    useEditorStore.getState().selectLayer(null);
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const { captureShirtViews } = await import('./shirt-stage');
      const views = await captureShirtViews();
      const state = useEditorStore.getState();
      const zip = await exportProject(state.document, state.assets, views);
      downloadBlob(zip, 'diseno-camiseta.zip');
      toast.add({ title: 'Proyecto exportado', description: 'Incluye el diseño, los logos originales y cuatro vistas PNG de 1600 × 1600.', type: 'success' });
    } catch (error) {
      toast.add({ title: 'No se pudo exportar', description: error instanceof Error ? error.message : 'Inténtalo de nuevo.', type: 'error' });
      throw error;
    } finally {
      useEditorStore.getState().selectLayer(previousSelection);
      setExportStatus('idle');
    }
  }, [setExportStatus]);

  useWebMcp(handleExport);

  const handleImport = async (file?: File) => {
    if (!file) return;
    try {
      const project = await importProject(file);
      replaceImportedDesign(project.document, project.assets);
      toast.add({ title: 'Proyecto restaurado', description: 'Colores, capas, patrones y recursos se importaron correctamente.', type: 'success' });
    } catch (error) {
      toast.add({ title: 'No se pudo importar', description: error instanceof Error ? error.message : 'El ZIP no es válido.', type: 'error' });
    } finally {
      if (importInput.current) importInput.current.value = '';
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('button, input, textarea, select, [role="slider"], [role="combobox"], [contenteditable="true"]')) return;
      const command = event.ctrlKey || event.metaKey;
      if (command && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
        return;
      }
      if (command && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return; }
      if (target !== document.body && !target?.closest('[data-editor-stage]')) return;
      const state = useEditorStore.getState();
      const layer = state.document.layers.find((item) => item.id === state.selectedLayerId);
      if (!layer || layer.locked) return;
      const step = event.shiftKey ? 0.02 : 0.005;
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); state.removeLayer(layer.id); return; }
      if (event.key === 'Escape') { state.selectLayer(null); return; }
      if (event.key === 'ArrowLeft') state.updateLayer(layer.id, { transform: { x: layer.transform.x - step } });
      else if (event.key === 'ArrowRight') state.updateLayer(layer.id, { transform: { x: layer.transform.x + step } });
      else if (event.key === 'ArrowUp') state.updateLayer(layer.id, { transform: { y: layer.transform.y - step } });
      else if (event.key === 'ArrowDown') state.updateLayer(layer.id, { transform: { y: layer.transform.y + step } });
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [redo, undo]);

  return (
    <TooltipProvider>
      <Toaster>
        <main className="flex h-dvh w-full flex-col overflow-hidden bg-slate-100">
          <header className="z-20 flex h-[62px] shrink-0 items-center justify-between border-b bg-white px-3 shadow-[0_1px_0_rgba(15,23,42,.03)] sm:px-5">
            <BrandMark />
            <AutosaveIndicator />
            <div className="flex items-center gap-1 sm:gap-1.5">
              <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-lg" aria-label="Deshacer" disabled={!canUndo} onClick={undo} />}><Undo2 /></TooltipTrigger><TooltipContent>Deshacer · Ctrl Z</TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-lg" aria-label="Rehacer" disabled={!canRedo} onClick={redo} />}><Redo2 /></TooltipTrigger><TooltipContent>Rehacer · Ctrl Y</TooltipContent></Tooltip>
              <div className="mx-1 hidden h-6 w-px bg-slate-200 lg:block" />
              <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-lg" aria-label="Nuevo diseño" onClick={() => setNewDialog(true)} />}><FilePlus2 /></TooltipTrigger><TooltipContent>Nuevo diseño</TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-lg" aria-label="Importar proyecto" onClick={() => importInput.current?.click()} />}><FolderOpen /></TooltipTrigger><TooltipContent>Importar ZIP</TooltipContent></Tooltip>
              <Button variant="outline" className="hidden h-10 lg:flex" onClick={() => void saveNow().then(() => toast.add({ title: 'Diseño guardado', description: 'Los cambios permanecen en este dispositivo.', type: 'success' })).catch(() => toast.add({ title: 'No se pudo guardar', description: 'Comprueba el espacio disponible del navegador.', type: 'error' }))}><Save /> Guardar</Button>
              <Button aria-label={exporting ? 'Preparando exportación' : 'Exportar diseño'} className="h-10 bg-slate-900 px-3 hover:bg-slate-800" disabled={exporting} onClick={() => void handleExport().catch(() => undefined)}>{exporting ? <LoaderCircle className="animate-spin" /> : <Download />}<span className="hidden sm:inline">{exporting ? 'Preparando…' : 'Exportar'}</span></Button>
              <input ref={importInput} type="file" accept=".zip,application/zip" className="sr-only" aria-label="Seleccionar proyecto ZIP" onChange={(event) => void handleImport(event.target.files?.[0])} />
            </div>
          </header>

          <div className="flex min-h-0 flex-1">
            <ToolRail />
            <ContextPanel />
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="min-h-0 flex-1"><ShirtStage /></div>
              <ContextPanel mobile />
            </div>
          </div>
          <MobileTools />
        </main>

        <AlertDialog open={newDialog} onOpenChange={setNewDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Empezar un diseño nuevo?</AlertDialogTitle>
              <AlertDialogDescription>Se reemplazará el proyecto guardado en este dispositivo. Puedes exportarlo antes para conservar una copia.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => void handleNewDesign()}>Crear diseño nuevo</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Toaster>
    </TooltipProvider>
  );
}
