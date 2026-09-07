'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Button } from '@/components/ui/button';
import {
  getLayerFrame,
  getLayerHandlePoint,
  hitTestLayerHandle,
  pixelRects,
  renderAtlas,
  type LayerFrame,
  type LayerHandle,
  type PixelRect,
} from '@/lib/atlas';
import { ZONE_LABELS, type DesignLayer } from '@/lib/design';
import { getGarment } from '@/lib/garments';
import { GARMENT_ZONES } from '@/lib/garment-types';
import { loadUvZoneMask, type UvZoneMaskLookup } from '@/lib/uv-zone-mask';
import {
  containsLayer,
  fitZone,
  framePoint,
  resizeLayer,
  rotationDelta,
  screenToZone,
  snapCenter,
  type Point,
  type Viewport,
} from '@/lib/zone-editor-geometry';
import { useEditorStore } from '@/store/editor-store';

type Resources = {
  mask: UvZoneMaskLookup;
  images: Record<string, HTMLImageElement>;
  modelId: string;
  assets: ReturnType<typeof useEditorStore.getState>['assets'];
};
type Gesture =
  | {
      pointerId: number;
      start: Point;
      pan: Point;
      kind: 'pan';
    }
  | {
      pointerId: number;
      start: Point;
      kind: 'move' | 'resize' | 'rotate';
      layer: DesignLayer;
      frame: LayerFrame;
      handle: LayerHandle | null;
      angle: number;
      previous: Point;
    };
const HANDLES: LayerHandle[] = [
  'top-left',
  'top-right',
  'bottom-right',
  'bottom-left',
];
const ATLAS_SIZE = 1024;

export function ZoneEditor() {
  const documentId = useEditorStore((state) => state.document.id);
  const modelId = useEditorStore((state) => state.document.modelId);
  const zone = useEditorStore((state) => state.selectedZone);
  return <ZoneCanvas key={`${documentId}:${modelId}:${zone}`} />;
}

function ZoneCanvas() {
  const design = useEditorStore((state) => state.document);
  const assets = useEditorStore((state) => state.assets);
  const zone = useEditorStore((state) => state.selectedZone);
  const selectedId = useEditorStore((state) => state.selectedLayerId);
  const exporting = useEditorStore((state) => state.exportStatus === 'working');
  const manifest = getGarment(design.modelId).manifest;
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const atlas = useRef<HTMLCanvasElement | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const geometry = useRef<{ rect: PixelRect; viewport: Viewport } | null>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [resources, setResources] = useState<Resources | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [panMode, setPanMode] = useState(false);
  const [guides, setGuides] = useState(true);
  const [gesturing, setGesturing] = useState(false);
  const ready =
    resources?.modelId === design.modelId &&
    resources?.assets === assets &&
    !error;

  useEffect(() => {
    const controller = new AbortController();
    const images = Object.values(assets).map(async (asset) => {
      const image = new Image();
      image.src = asset.previewUrl;
      await image.decode();
      return [asset.id, image] as const;
    });
    void Promise.all([
      loadUvZoneMask(ATLAS_SIZE, controller.signal, manifest),
      window.document.fonts.ready,
      Promise.all(images),
    ])
      .then(([mask, , loaded]) => {
        if (!controller.signal.aborted) {
          setError('');
          setResources({
            mask,
            images: Object.fromEntries(loaded),
            modelId: design.modelId,
            assets,
          });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError('No se pudo cargar la zona. Intenta cargarla de nuevo.');
      });
    return () => controller.abort();
  }, [assets, design.modelId, manifest, retry]);

  useLayoutEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);

  useEffect(
    () => () => {
      if (gesture.current?.kind !== 'pan')
        useEditorStore.getState().endGesture();
      gesture.current = null;
    },
    [],
  );

  // Redraw content independently of pan/zoom, keeping the exact atlas geometry.
  useLayoutEffect(() => {
    if (!ready || !resources) return;
    atlas.current ??= window.document.createElement('canvas');
    atlas.current.width = atlas.current.height = ATLAS_SIZE;
    renderAtlas(
      atlas.current,
      design,
      assets,
      resources.images,
      null,
      resources.mask,
      manifest,
      zone,
    );
  }, [design, assets, resources, ready, manifest, zone]);

  useLayoutEffect(() => {
    if (!ready || !resources || !canvas.current || !atlas.current) return;
    const ctx = canvas.current.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.current.width = Math.max(1, Math.round(size.width * dpr));
    canvas.current.height = Math.max(1, Math.round(size.height * dpr));
    const sourceRect = pixelRects(
      zone,
      ATLAS_SIZE,
      resources.mask,
      manifest,
    )[0];
    const rect = { ...sourceRect, x: 0, y: 0 };
    const viewport = fitZone(size.width, size.height, rect, zoom, pan);
    geometry.current = { rect, viewport };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.translate(viewport.x, viewport.y);
    ctx.scale(viewport.scale, viewport.scale);
    ctx.drawImage(
      atlas.current,
      sourceRect.x,
      sourceRect.y,
      sourceRect.width,
      sourceRect.height,
      0,
      0,
      rect.width,
      rect.height,
    );
    ctx.lineWidth = 1 / viewport.scale;
    ctx.strokeStyle = '#64748b';
    ctx.strokeRect(0, 0, rect.width, rect.height);
    ctx.beginPath();
    manifest.atlas.zones[zone].safePolygon.forEach(([x, y], i) => {
      if (i === 0) ctx.moveTo(x * rect.width, y * rect.height);
      else ctx.lineTo(x * rect.width, y * rect.height);
    });
    ctx.closePath();
    ctx.setLineDash([5 / viewport.scale, 4 / viewport.scale]);
    ctx.strokeStyle = '#0284c7';
    ctx.stroke();
    if (guides) {
      ctx.beginPath();
      ctx.moveTo(rect.width / 2, 0);
      ctx.lineTo(rect.width / 2, rect.height);
      ctx.moveTo(0, rect.height / 2);
      ctx.lineTo(rect.width, rect.height / 2);
      ctx.strokeStyle = '#0d9488';
      ctx.stroke();
    }
    ctx.setLineDash([]);
    const layer = design.layers.find(
      (item) => item.id === selectedId && item.zone === zone && item.visible,
    );
    if (!layer) return;
    const asset = layer.type === 'image' ? assets[layer.assetId] : null;
    const frame = getLayerFrame(
      ctx,
      rect,
      layer,
      asset ? asset.width / asset.height : 1,
    );
    ctx.translate(frame.x, frame.y);
    ctx.rotate((layer.transform.rotation * Math.PI) / 180);
    ctx.strokeStyle = layer.locked ? '#64748b' : '#0284c7';
    ctx.lineWidth = 2 / viewport.scale;
    ctx.strokeRect(
      -frame.width / 2,
      -frame.height / 2,
      frame.width,
      frame.height,
    );
    if (layer.locked) return;
    const handleSize = 10 / viewport.scale;
    ctx.fillStyle = '#ffffff';
    for (const handle of HANDLES) {
      const point = getLayerHandlePoint(frame, handle);
      ctx.fillRect(
        point.x - handleSize / 2,
        point.y - handleSize / 2,
        handleSize,
        handleSize,
      );
      ctx.strokeRect(
        point.x - handleSize / 2,
        point.y - handleSize / 2,
        handleSize,
        handleSize,
      );
    }
    const rotationY = -frame.height / 2 - 30 / viewport.scale;
    ctx.beginPath();
    ctx.moveTo(0, -frame.height / 2);
    ctx.lineTo(0, rotationY);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, rotationY, 6 / viewport.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }, [
    design,
    selectedId,
    size,
    zoom,
    pan,
    guides,
    assets,
    resources,
    ready,
    manifest,
    zone,
  ]);

  function finish(cancel = false) {
    const active = gesture.current;
    gesture.current = null;
    if (!active) return;
    if (active.kind === 'pan') {
      if (cancel) setPan(active.pan);
    } else if (cancel) useEditorStore.getState().cancelGesture();
    else useEditorStore.getState().endGesture();
    setGesturing(false);
    if (canvas.current?.hasPointerCapture(active.pointerId))
      canvas.current.releasePointerCapture(active.pointerId);
  }

  function pointerPosition(event: ReactPointerEvent<HTMLCanvasElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  function pointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (
      !ready ||
      exporting ||
      gesture.current ||
      !geometry.current ||
      event.button !== 0
    )
      return;
    event.preventDefault();
    event.currentTarget.focus();
    const screen = pointerPosition(event);
    const { rect, viewport } = geometry.current;
    const point = screenToZone(screen, viewport);
    if (panMode) {
      gesture.current = {
        kind: 'pan',
        pointerId: event.pointerId,
        start: screen,
        pan,
      };
    } else {
      const ctx = event.currentTarget.getContext('2d');
      if (!ctx) return;
      const frameFor = (layer: DesignLayer) => {
        const asset = layer.type === 'image' ? assets[layer.assetId] : null;
        return getLayerFrame(
          ctx,
          rect,
          layer,
          asset ? asset.width / asset.height : 1,
        );
      };
      const layers = design.layers
        .filter(
          (layer) => layer.zone === zone && layer.visible && !layer.locked,
        )
        .sort((a, b) => b.order - a.order);
      let layer = layers.find((item) => item.id === selectedId);
      let handle: LayerHandle | null = null;
      let kind: 'move' | 'resize' | 'rotate' = 'move';
      if (layer) {
        const frame = frameFor(layer);
        handle = hitTestLayerHandle(
          frame,
          point.x,
          point.y,
          layer.transform.rotation,
          12 / viewport.scale,
        );
        const rotationPoint = framePoint(
          frame,
          { x: 0, y: -frame.height / 2 - 30 / viewport.scale },
          layer.transform.rotation,
        );
        if (
          Math.hypot(point.x - rotationPoint.x, point.y - rotationPoint.y) <=
          12 / viewport.scale
        )
          kind = 'rotate';
        else if (handle) kind = 'resize';
      }
      if (kind === 'move')
        layer = layers.find((item) =>
          containsLayer(frameFor(item), point, item.transform.rotation),
        );
      useEditorStore.getState().selectLayer(layer?.id ?? null);
      if (!layer) return;
      useEditorStore.getState().beginGesture();
      gesture.current = {
        kind,
        layer: structuredClone(layer),
        frame: frameFor(layer),
        handle,
        start: point,
        previous: point,
        angle: layer.transform.rotation,
        pointerId: event.pointerId,
      };
    }
    setGesturing(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId || !geometry.current)
      return;
    const state = useEditorStore.getState();
    if (
      state.exportStatus === 'working' ||
      (active.kind !== 'pan' && !state.gestureStart)
    ) {
      finish();
      return;
    }
    const screen = pointerPosition(event);
    if (active.kind === 'pan') {
      setPan({
        x: active.pan.x + screen.x - active.start.x,
        y: active.pan.y + screen.y - active.start.y,
      });
      return;
    }
    const { rect, viewport } = geometry.current;
    const point = screenToZone(screen, viewport);
    if (active.kind === 'move') {
      const next = snapCenter(
        {
          x: active.frame.x + point.x - active.start.x,
          y: active.frame.y + point.y - active.start.y,
        },
        rect.width,
        rect.height,
        viewport.scale,
        guides,
      );
      state.updateLayerTransformLive(active.layer.id, {
        x: next.x / rect.width,
        y: next.y / rect.height,
      });
    } else if (active.kind === 'resize' && active.handle) {
      const next = resizeLayer(
        active.frame,
        active.handle,
        active.layer.transform.rotation,
        active.layer.transform.scale,
        point,
      );
      state.updateLayerTransformLive(active.layer.id, {
        scale: next.scale,
        x: next.x / rect.width,
        y: next.y / rect.height,
      });
    } else {
      active.angle += rotationDelta(active.previous, point, active.frame);
      active.previous = point;
      state.updateLayerTransformLive(active.layer.id, {
        rotation: active.angle,
      });
    }
  }

  return (
    <section
      className="flex h-full min-h-0 flex-col bg-muted/40"
      aria-label="Editor 2D por zona"
    >
      <div className="flex flex-wrap items-center gap-2 border-b bg-card p-2">
        <label className="flex items-center gap-2 text-sm">
          Zona
          <select
            aria-label="Zona del editor 2D"
            value={zone}
            disabled={exporting}
            className="h-10 max-w-40 rounded-md border bg-card px-2"
            onChange={(event) => {
              finish();
              useEditorStore
                .getState()
                .setSelectedZone(event.target.value as typeof zone);
            }}
          >
            {GARMENT_ZONES[design.modelId].map((id) => (
              <option key={id} value={id}>
                {ZONE_LABELS[id]}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="outline"
          size="sm"
          disabled={gesturing || zoom <= 0.5}
          aria-label="Reducir zoom 2D"
          onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}
        >
          −
        </Button>
        <output className="min-w-10 text-center text-sm" aria-label="Zoom 2D">
          {Math.round(zoom * 100)} %
        </output>
        <Button
          variant="outline"
          size="sm"
          disabled={gesturing || zoom >= 4}
          aria-label="Aumentar zoom 2D"
          onClick={() => setZoom((value) => Math.min(4, value + 0.25))}
        >
          +
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={gesturing}
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
        >
          Ajustar zona
        </Button>
        <Button
          variant={panMode ? 'secondary' : 'outline'}
          size="sm"
          aria-pressed={panMode}
          disabled={gesturing}
          onClick={() => setPanMode(!panMode)}
        >
          Desplazar
        </Button>
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={guides}
            disabled={gesturing}
            onChange={(event) => setGuides(event.target.checked)}
          />
          Guías y ajuste
        </label>
      </div>
      <div ref={host} className="relative min-h-0 flex-1 overflow-hidden">
        <canvas
          ref={canvas}
          data-editor-stage
          tabIndex={0}
          aria-label={`Diseñar ${ZONE_LABELS[zone]}: arrastra para mover, usa las esquinas para cambiar el tamaño y el círculo para rotar. Flechas para mover; Escape para cancelar.`}
          className="absolute inset-0 h-full w-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500"
          style={{
            cursor: panMode ? (gesturing ? 'grabbing' : 'grab') : 'default',
          }}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={(event) => {
            if (gesture.current?.pointerId === event.pointerId) finish();
          }}
          onPointerCancel={(event) => {
            if (gesture.current?.pointerId === event.pointerId) finish(true);
          }}
          onLostPointerCapture={(event) => {
            if (gesture.current?.pointerId === event.pointerId) finish();
          }}
          onKeyDown={(event) => {
            if (exporting) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            if (gesture.current) {
              if (event.key === 'Escape') finish(true);
              event.preventDefault();
              event.stopPropagation();
            }
          }}
        />
        {!ready && (
          <output className="absolute inset-0 grid place-content-center gap-3 bg-card/90 p-6 text-center text-sm">
            <p>{error || 'Preparando zona…'}</p>
            {error && (
              <Button
                variant="outline"
                onClick={() => {
                  setError('');
                  setResources(null);
                  setRetry((value) => value + 1);
                }}
              >
                Reintentar
              </Button>
            )}
          </output>
        )}
      </div>
      <p className="border-t bg-card px-3 py-2 text-xs text-muted-foreground">
        Área útil delimitada · Arrastra las esquinas para escalar y el círculo
        para rotar. Escape cancela.
      </p>
    </section>
  );
}
