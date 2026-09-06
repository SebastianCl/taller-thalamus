'use client';

import { useEffect, useRef, useState, type DragEvent } from 'react';
import {
  AlignCenter,
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  FileImage,
  GripVertical,
  Lock,
  Trash2,
  Unlock,
  UploadCloud,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { FONTS, PATTERNS } from '@/lib/atlas';
import { createAssetRecord } from '@/lib/persistence';
import { PALETTE, TEMPLATES, ZONE_IDS, ZONE_LABELS, type TextLayer, type ZoneId } from '@/lib/design';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/store/editor-store';

function Heading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {hint ? <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function ZonePicker() {
  const zone = useEditorStore((state) => state.selectedZone);
  const setZone = useEditorStore((state) => state.setSelectedZone);
  return (
    <div className="space-y-2">
      <Label htmlFor="zone-picker">Zona de la prenda</Label>
      <Select value={zone} onValueChange={(value) => setZone(value as ZoneId)}>
        <SelectTrigger id="zone-picker" className="h-11 w-full bg-muted">
          <span className="mr-1 inline-block size-2 rounded-full bg-sky-500" />
          <SelectValue>{ZONE_LABELS[zone]}</SelectValue>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          {ZONE_IDS.map((item) => <SelectItem key={item} value={item}>{ZONE_LABELS[item]}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function TemplateThumb({ colors }: { colors: readonly string[] }) {
  return (
    <div className="relative mx-auto h-20 w-20">
      <div className="absolute left-1/2 top-2 h-16 w-12 -translate-x-1/2 rounded-[13px_13px_10px_10px] border border-black/10" style={{ background: colors[0] }} />
      <div className="absolute left-0 top-3 h-8 w-7 -rotate-[25deg] rounded-[10px_4px_8px_8px] border border-black/10" style={{ background: colors[1] ?? colors[0] }} />
      <div className="absolute right-0 top-3 h-8 w-7 rotate-[25deg] rounded-[4px_10px_8px_8px] border border-black/10" style={{ background: colors[1] ?? colors[0] }} />
      <div className="absolute left-1/2 top-2.5 size-3 -translate-x-1/2 rounded-full bg-slate-900/18" />
    </div>
  );
}

function DesignPanel() {
  const document = useEditorStore((state) => state.document);
  const applyTemplate = useEditorStore((state) => state.applyTemplate);
  return (
    <section>
      <div className="mb-3 flex items-end justify-between">
        <Heading title="Diseños base" hint="Un punto de partida, siempre editable." />
        <span className="text-[11px] text-muted-foreground">6 opciones</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {TEMPLATES.map((template) => {
          const selected = document.templateId === template.id;
          return (
            <button
              key={template.id}
              type="button"
              onClick={() => applyTemplate(template.id)}
              className={cn(
                'min-h-28 rounded-2xl border p-2.5 text-left transition-all focus-visible:ring-2 focus-visible:ring-primary',
                selected ? 'border-sky-500 bg-accent shadow-[0_0_0_1px_#0ea5e9]' : 'bg-card hover:-translate-y-0.5 hover:shadow-sm',
              )}
              aria-pressed={selected}
            >
              <TemplateThumb colors={template.colors} />
              <span className="mt-1 block truncate text-xs font-semibold text-foreground">{template.name}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ColorGrid({ value, onChange, compact = false }: { value: string; onChange: (color: string) => void; compact?: boolean }) {
  return (
    <div className={cn('grid grid-cols-5 gap-2.5', compact && 'gap-2')}>
      {PALETTE.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={`Aplicar color ${color}`}
          aria-pressed={value.toUpperCase() === color.toUpperCase()}
          onClick={() => onChange(color)}
          className={cn(
            'size-11 rounded-full border border-black/10 shadow-sm transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            value.toUpperCase() === color.toUpperCase() && 'ring-2 ring-foreground ring-offset-2 ring-offset-background',
          )}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

function HexColorInput({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const [draft, setDraft] = useState(value);
  // oxlint-disable-next-line react/react-compiler -- Keep an editable draft synchronized with undo/import changes.
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (/^#[0-9a-f]{6}$/i.test(draft)) onChange(draft.toUpperCase());
    else setDraft(value);
  };
  return <Input className="h-11 font-mono uppercase" value={draft} maxLength={7} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} aria-label="Color hexadecimal" aria-invalid={!/^#[0-9a-f]{6}$/i.test(draft)} />;
}

function ColorPanel() {
  const [applyToAll, setApplyToAll] = useState(false);
  const zone = useEditorStore((state) => state.selectedZone);
  const style = useEditorStore((state) => state.document.zones[state.selectedZone]);
  const setColor = useEditorStore((state) => state.setZoneColor);
  const setAllColors = useEditorStore((state) => state.setAllZoneColors);
  const applyColor = (color: string) => applyToAll ? setAllColors(color) : setColor(zone, color);
  return (
    <div className="space-y-6">
      <div className="flex min-h-14 items-center justify-between gap-3 rounded-xl border bg-muted px-3 py-2">
        <div>
          <Label htmlFor="apply-color-to-all">Todas las zonas</Label>  
        </div>
        <Switch id="apply-color-to-all" checked={applyToAll} onCheckedChange={setApplyToAll} aria-label="Aplicar color a todas las zonas" />
      </div>
      {!applyToAll ? <ZonePicker /> : null}
      <div className="space-y-3">
        <ColorGrid value={style.color} onChange={applyColor} />
        <div className="flex items-center gap-2">
          <input className="size-11 rounded-lg border bg-card p-1" type="color" value={style.color} onChange={(event) => applyColor(event.target.value.toUpperCase())} aria-label="Elegir color personalizado" />
          <HexColorInput value={style.color} onChange={applyColor} />
        </div>
      </div>
    </div>
  );
}

function patternPreview(id: string) {
  const ink = '#2563eb';
  const pale = '#eaf2ff';
  if (id === 'dots') return { backgroundColor: pale, backgroundImage: `radial-gradient(${ink} 2px, transparent 2px)`, backgroundSize: '12px 12px' };
  if (id === 'checks') return { backgroundColor: pale, backgroundImage: `conic-gradient(${ink} 25%, transparent 0 50%, ${ink} 0 75%, transparent 0)`, backgroundSize: '18px 18px' };
  if (id === 'hoops') return { background: `repeating-linear-gradient(0deg, ${pale} 0 8px, ${ink} 8px 13px)` };
  if (id === 'diamonds') return { backgroundColor: pale, backgroundImage: `linear-gradient(45deg, transparent 42%, ${ink} 43% 57%, transparent 58%), linear-gradient(-45deg, transparent 42%, ${ink} 43% 57%, transparent 58%)`, backgroundSize: '18px 18px' };
  if (id === 'waves' || id === 'topography') return { background: `repeating-radial-gradient(ellipse at 20% 50%, transparent 0 7px, ${ink} 8px 9px, transparent 10px 16px), ${pale}` };
  if (id === 'chevrons') return { background: `linear-gradient(135deg, ${ink} 25%, transparent 25%) -10px 0, linear-gradient(225deg, ${ink} 25%, transparent 25%) -10px 0, ${pale}`, backgroundSize: '20px 20px' };
  if (id === 'hexagons') return { background: `radial-gradient(circle at 25% 25%, ${ink} 0 2px, transparent 3px), radial-gradient(circle at 75% 75%, ${ink} 0 2px, transparent 3px), ${pale}`, backgroundSize: '18px 18px' };
  if (id === 'speckle') return { background: `radial-gradient(${ink} 1px, transparent 1px), radial-gradient(${ink} 1px, ${pale} 1px)`, backgroundPosition: '0 0, 5px 5px', backgroundSize: '10px 10px' };
  if (id === 'rays') return { background: `conic-gradient(from 25deg, ${ink}, ${pale}, ${ink}, ${pale}, ${ink})` };
  return { background: `repeating-linear-gradient(${id === 'pinstripes' ? '90deg' : '55deg'}, ${pale} 0 8px, ${ink} 8px ${id === 'pinstripes' ? '10px' : '14px'})` };
}

function NumberControl({ label, value, min, max, step, suffix, onChange, disabled = false }: { label: string; value: number; min: number; max: number; step: number; suffix?: string; onChange: (value: number) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState(value);
  const beginGesture = useEditorStore((state) => state.beginGesture);
  const endGesture = useEditorStore((state) => state.endGesture);
  // oxlint-disable-next-line react/react-compiler -- External undo/import must reset the local live slider value.
  useEffect(() => setDraft(value), [value]);
  const update = (next: number) => {
    const normalized = Math.max(min, Math.min(max, Number.isFinite(next) ? next : value));
    setDraft(normalized);
    onChange(normalized);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <label className="flex h-8 items-center rounded-lg border bg-card px-2 font-mono text-xs">
          <input className="w-12 bg-transparent text-right outline-none" type="number" min={min} max={max} step={step} value={Number(draft.toFixed(2))} disabled={disabled} onFocus={beginGesture} onChange={(event) => update(Number(event.target.value))} onBlur={endGesture} onKeyDown={(event) => { if (event.key.startsWith('Arrow')) beginGesture(); if (event.key === 'Enter') event.currentTarget.blur(); }} aria-label={`${label} numérico`} />
          {suffix}
        </label>
      </div>
      <Slider value={[draft]} min={min} max={max} step={step} disabled={disabled} onPointerDown={beginGesture} onFocus={beginGesture} onKeyDown={beginGesture} onValueChange={(next) => update(Array.isArray(next) ? next[0] : next)} onValueCommitted={endGesture} aria-label={label} className="py-2" />
    </div>
  );
}

function PatternPanel() {
  const zone = useEditorStore((state) => state.selectedZone);
  const style = useEditorStore((state) => state.document.zones[state.selectedZone]);
  const update = useEditorStore((state) => state.updateZoneStyle);
  return (
    <div className="space-y-6">
      <ZonePicker />
      <div className="space-y-3">
        <Heading title="Patrón procedural" hint="Se adapta al volumen y no atraviesa las costuras." />
        <div className="grid grid-cols-3 gap-2">
          <button type="button" aria-pressed={!style.pattern} className={cn('h-[72px] rounded-xl border bg-card text-xs font-medium', !style.pattern && 'border-sky-500 ring-1 ring-sky-500')} onClick={() => update(zone, { pattern: null })}>Sin patrón</button>
          {PATTERNS.map((pattern) => (
            <button key={pattern.id} type="button" aria-pressed={style.pattern === pattern.id} className={cn('overflow-hidden rounded-xl border bg-card p-1 text-[10px] font-medium', style.pattern === pattern.id && 'border-sky-500 ring-1 ring-sky-500')} onClick={() => update(zone, { pattern: pattern.id })}>
              <span className="block h-10 rounded-lg" style={patternPreview(pattern.id)} />
              <span className="mt-1 block truncate">{pattern.name}</span>
            </button>
          ))}
        </div>
      </div>
      <NumberControl label="Escala" value={style.patternScale} min={0.4} max={2.4} step={0.1} suffix="×" onChange={(value) => update(zone, { patternScale: value }, false)} />
      <NumberControl label="Ángulo" value={style.patternAngle} min={-180} max={180} step={1} suffix="°" onChange={(value) => update(zone, { patternAngle: value }, false)} />
      <NumberControl label="Opacidad" value={style.patternOpacity * 100} min={5} max={100} step={1} suffix="%" onChange={(value) => update(zone, { patternOpacity: value / 100 }, false)} />
      <div className="space-y-2"><Label>Color del patrón</Label><ColorGrid compact value={style.patternColor} onChange={(patternColor) => update(zone, { patternColor })} /></div>
    </div>
  );
}

function GradientPanel() {
  const zone = useEditorStore((state) => state.selectedZone);
  const style = useEditorStore((state) => state.document.zones[state.selectedZone]);
  const update = useEditorStore((state) => state.updateZoneStyle);
  const gradient = style.gradient ?? { from: style.color, to: '#1677FF', angle: 90, offset: 0 };
  return (
    <div className="space-y-6">
      <ZonePicker />
      <div className="flex min-h-11 items-center justify-between rounded-xl border bg-muted px-3">
        <div><p className="text-sm font-medium">Activar degradado</p><p className="text-[11px] text-muted-foreground">Dos colores sobre la zona</p></div>
        <Switch checked={Boolean(style.gradient)} onCheckedChange={(checked) => update(zone, { gradient: checked ? gradient : null })} aria-label="Activar degradado" />
      </div>
      <div className={cn('space-y-5', !style.gradient && 'pointer-events-none opacity-45')}>
        <div className="grid grid-cols-2 gap-3">
          {([['from', 'Color inicial'], ['to', 'Color final']] as const).map(([key, label]) => (
            <label key={key} className="space-y-2 text-xs font-medium"><span>{label}</span><span className="flex h-11 items-center gap-2 rounded-lg border bg-card px-2"><input type="color" className="size-8 rounded" value={gradient[key]} onChange={(event) => update(zone, { gradient: { ...gradient, [key]: event.target.value.toUpperCase() } })} /><span className="font-mono text-[11px]">{gradient[key]}</span></span></label>
          ))}
        </div>
        <div className="h-16 rounded-xl border" style={{ background: `linear-gradient(${gradient.angle}deg, ${gradient.from}, ${gradient.to})` }} />
        <NumberControl label="Ángulo" value={gradient.angle} min={-180} max={180} step={1} suffix="°" onChange={(angle) => update(zone, { gradient: { ...gradient, angle } }, false)} />
        <NumberControl label="Desplazamiento" value={gradient.offset * 100} min={-100} max={100} step={1} suffix="%" onChange={(value) => update(zone, { gradient: { ...gradient, offset: value / 100 } }, false)} />
      </div>
    </div>
  );
}

function TextPanel({ subtype }: { subtype: TextLayer['subtype'] }) {
  const [text, setText] = useState(subtype === 'name' ? 'GARCÍA' : subtype === 'number' ? '10' : 'TU EQUIPO');
  const [font, setFont] = useState(subtype === 'number' ? 'Anton' : subtype === 'name' ? 'Oswald' : 'Inter');
  const addText = useEditorStore((state) => state.addTextLayer);
  const zone = useEditorStore((state) => state.selectedZone);
  const layers = useEditorStore((state) => state.document.layers);
  const label = subtype === 'name' ? 'Nombre' : subtype === 'number' ? 'Número' : 'Texto libre';
  const add = () => {
    const id = addText(subtype, text, font);
    if (!id) toast.add({ title: text.trim() ? 'Límite alcanzado' : 'Escribe un texto', description: text.trim() ? 'Puedes usar hasta 20 elementos por diseño.' : 'El campo no puede estar vacío.', type: 'warning' });
    else toast.add({ title: `${label} añadido`, description: `Se colocó en ${ZONE_LABELS[zone].toLowerCase()}.`, type: 'success' });
  };
  return (
    <div className="space-y-6">
      <ZonePicker />
      <div className="space-y-2">
        <Label htmlFor={`copy-${subtype}`}>{label}</Label>
        <Input id={`copy-${subtype}`} className="h-11" value={text} maxLength={subtype === 'number' ? 3 : 120} inputMode={subtype === 'number' ? 'numeric' : 'text'} onChange={(event) => setText(subtype === 'number' ? event.target.value.replace(/\D/g, '').slice(0, 3) : subtype === 'name' ? event.target.value.toUpperCase() : event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') add(); }} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`font-${subtype}`}>Tipografía OFL</Label>
        <Select value={font} onValueChange={(value) => { if (value) setFont(value); }}>
          <SelectTrigger id={`font-${subtype}`} className="h-11 w-full"><SelectValue /></SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>{FONTS.map((item) => <SelectItem key={item.id} value={item.id}><span style={{ fontFamily: item.id }}>{item.name}</span></SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="rounded-2xl border bg-muted p-5 text-center">
        <span className="block truncate text-3xl text-foreground" style={{ fontFamily: font }}>{text || label}</span>
        <span className="mt-2 block text-[10px] uppercase tracking-[.12em] text-muted-foreground">Vista previa</span>
      </div>
      <Button className="h-11 w-full" onClick={add}>Añadir {label.toLowerCase()} <span className="ml-auto text-xs opacity-70">{layers.length}/20</span></Button>
    </div>
  );
}

function LogoPanel() {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const zone = useEditorStore((state) => state.selectedZone);
  const addImage = useEditorStore((state) => state.addImageLayer);
  const process = async (file?: File) => {
    if (!file || busy) return;
    setBusy(true);
    let asset: Awaited<ReturnType<typeof createAssetRecord>> | undefined;
    try {
      asset = await createAssetRecord(file);
      if (!addImage(asset)) {
        URL.revokeObjectURL(asset.previewUrl);
        asset = undefined;
        throw new Error('El diseño ya contiene 20 elementos.');
      }
      toast.add({ title: 'Imagen añadida', description: `${file.name} se mantiene únicamente en este dispositivo.`, type: 'success' });
    } catch (error) {
      toast.add({ title: 'No se pudo añadir', description: error instanceof Error ? error.message : 'Archivo no válido.', type: 'error' });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  const drop = (event: DragEvent<HTMLButtonElement>) => { event.preventDefault(); void process(event.dataTransfer.files[0]); };
  return (
    <div className="space-y-6">
      <ZonePicker />
      <button type="button" disabled={busy} aria-busy={busy} onClick={() => input.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={drop} className="flex min-h-48 w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-sky-200 bg-sky-50/60 p-5 text-center text-foreground transition-colors hover:border-sky-400 hover:bg-sky-50 focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-wait disabled:opacity-70 dark:border-sky-700 dark:bg-sky-950/35 dark:hover:border-sky-500 dark:hover:bg-sky-950/55">
        <span className="grid size-12 place-items-center rounded-2xl bg-card text-sky-600 shadow-sm">{busy ? <span className="size-5 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" /> : <UploadCloud />}</span>
        <p className="mt-3 text-sm font-semibold">Añade tu imagen</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">PNG, JPEG, WebP o SVG <br />Máximo 10 MB</p>
      </button>
      <input ref={input} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg" onChange={(event) => void process(event.target.files?.[0])} aria-label="Seleccionar imagen" />
      <div className="rounded-xl border bg-card p-3 text-xs text-muted-foreground"><FileImage className="mb-2 size-5 text-sky-500" />Los SVG se sanitizan y rasterizan para la vista 3D; el original queda dentro del proyecto exportado.</div>
    </div>
  );
}

function LayersPanel() {
  const document = useEditorStore((state) => state.document);
  const selectedId = useEditorStore((state) => state.selectedLayerId);
  const select = useEditorStore((state) => state.selectLayer);
  const update = useEditorStore((state) => state.updateLayer);
  const duplicate = useEditorStore((state) => state.duplicateLayer);
  const remove = useEditorStore((state) => state.removeLayer);
  const toggle = useEditorStore((state) => state.toggleLayer);
  const reorder = useEditorStore((state) => state.moveLayerOrder);
  const center = useEditorStore((state) => state.centerLayer);
  const setZone = useEditorStore((state) => state.setSelectedZone);
  const selected = document.layers.find((layer) => layer.id === selectedId);
  const layers = [...document.layers].sort((a, b) => b.order - a.order);

  if (!layers.length) return (
    <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed bg-muted p-6 text-center">
      <div><GripVertical className="mx-auto size-8 text-muted-foreground" /><h2 className="mt-3 text-sm font-semibold">Aún no hay capas</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Añade texto o una imagen para comenzar.</p></div>
    </div>
  );

  return (
    <div className="space-y-5">
      <Heading title={`Capas (${layers.length}/20)`} hint="Ordena, bloquea y edita cada elemento." />
      <div className="space-y-2">
        {layers.map((layer) => (
          <div key={layer.id} className={cn('rounded-xl border bg-card p-2 transition-colors', selectedId === layer.id && 'border-sky-500 bg-accent/45 ring-1 ring-sky-500')}>
            <button type="button" aria-pressed={selectedId === layer.id} className="flex min-h-11 w-full items-center gap-2 text-left" onClick={() => select(layer.id)}>
              <GripVertical className="size-4 text-muted-foreground" />
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">{layer.type === 'image' ? <FileImage className="size-4" /> : <span className="font-semibold">T</span>}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{layer.type === 'image' ? layer.name : layer.text}</span><span className="block text-[10px] text-muted-foreground">{ZONE_LABELS[layer.zone]}</span></span>
            </button>
            <div className="mt-1 flex justify-end gap-0.5">
              <Button variant="ghost" size="icon-lg" aria-label={layer.visible ? 'Ocultar capa' : 'Mostrar capa'} onClick={() => toggle(layer.id, 'visible')}>{layer.visible ? <Eye /> : <EyeOff />}</Button>
              <Button variant="ghost" size="icon-lg" aria-label={layer.locked ? 'Desbloquear capa' : 'Bloquear capa'} onClick={() => toggle(layer.id, 'locked')}>{layer.locked ? <Lock /> : <Unlock />}</Button>
              <Button variant="ghost" size="icon-lg" aria-label="Subir capa" onClick={() => reorder(layer.id, 1)}><ArrowUp /></Button>
              <Button variant="ghost" size="icon-lg" aria-label="Bajar capa" onClick={() => reorder(layer.id, -1)}><ArrowDown /></Button>
              <Button variant="ghost" size="icon-lg" aria-label="Duplicar capa" onClick={() => duplicate(layer.id)}><Copy /></Button>
              <Button variant="ghost" size="icon-lg" aria-label="Eliminar capa" className="text-red-500" onClick={() => remove(layer.id)}><Trash2 /></Button>
            </div>
          </div>
        ))}
      </div>

      {selected ? (
        <div className="space-y-5 rounded-2xl border bg-muted p-4">
          <div className="flex items-center justify-between"><Heading title="Transformar" /><Button variant="outline" size="sm" className="h-9" disabled={selected.locked} onClick={() => center(selected.id)}><AlignCenter /> Centrar</Button></div>
          <div className="space-y-2">
            <Label>Zona</Label>
            <Select value={selected.zone} disabled={selected.locked} onValueChange={(value) => { if (value) { update(selected.id, { zone: value as ZoneId }); setZone(value as ZoneId); } }}>
              <SelectTrigger className="h-11 w-full bg-card"><SelectValue>{ZONE_LABELS[selected.zone]}</SelectValue></SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>{ZONE_IDS.map((zone) => <SelectItem key={zone} value={zone}>{ZONE_LABELS[zone]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <NumberControl disabled={selected.locked} label="Posición X" value={selected.transform.x * 100} min={0} max={100} step={1} suffix="%" onChange={(value) => update(selected.id, { transform: { x: value / 100 } }, false)} />
          <NumberControl disabled={selected.locked} label="Posición Y" value={selected.transform.y * 100} min={0} max={100} step={1} suffix="%" onChange={(value) => update(selected.id, { transform: { y: value / 100 } }, false)} />
          <NumberControl disabled={selected.locked} label="Tamaño" value={selected.transform.scale * 100} min={20} max={260} step={1} suffix="%" onChange={(value) => update(selected.id, { transform: { scale: value / 100 } }, false)} />
          <NumberControl disabled={selected.locked} label="Rotación" value={selected.transform.rotation} min={-180} max={180} step={1} suffix="°" onChange={(value) => update(selected.id, { transform: { rotation: value } }, false)} />
          {selected.type === 'text' ? (
            <div className="space-y-4 border-t pt-4">
              <div className="space-y-2"><Label htmlFor="layer-content">Contenido</Label><Input id="layer-content" className="h-11" value={selected.text} maxLength={120} disabled={selected.locked} onChange={(event) => update(selected.id, { text: event.target.value } as never)} /></div>
              <div className="space-y-2"><Label htmlFor="layer-font">Tipografía</Label><Select value={selected.font} disabled={selected.locked} onValueChange={(font) => update(selected.id, { font } as never)}><SelectTrigger id="layer-font" className="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent alignItemWithTrigger={false}>{FONTS.map((font) => <SelectItem key={font.id} value={font.id}>{font.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-2 text-xs font-medium">Color<input type="color" disabled={selected.locked} className="block h-11 w-full rounded-lg border bg-card p-1" value={selected.color} onChange={(event) => update(selected.id, { color: event.target.value.toUpperCase() } as never)} /></label>
                <label className="space-y-2 text-xs font-medium">Fondo<input type="color" disabled={selected.locked} className="block h-11 w-full rounded-lg border bg-card p-1" value={selected.background ?? '#000000'} onChange={(event) => update(selected.id, { background: event.target.value.toUpperCase() } as never)} /></label>
              </div>
              <div className="flex min-h-11 items-center justify-between rounded-lg border bg-card px-3 text-sm">Usar fondo<Switch disabled={selected.locked} checked={selected.background !== null} onCheckedChange={(checked) => update(selected.id, { background: checked ? '#000000' : null } as never)} aria-label="Usar fondo en el texto" /></div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ToolPanelContent() {
  const active = useEditorStore((state) => state.activeTool);
  if (active === 'design') return <DesignPanel />;
  if (active === 'color') return <ColorPanel />;
  if (active === 'pattern') return <PatternPanel />;
  if (active === 'gradient') return <GradientPanel />;
  if (active === 'text') return <TextPanel subtype="free" />;
  if (active === 'name') return <TextPanel subtype="name" />;
  if (active === 'number') return <TextPanel subtype="number" />;
  if (active === 'logo') return <LogoPanel />;
  return <LayersPanel />;
}
