import type { AssetRecord } from '@/lib/persistence';
import type { DesignDocument, DesignLayer, ZoneId, ZoneStyle } from '@/lib/design';
import { MODEL_MANIFEST } from '@/lib/model-manifest';

export const PATTERNS = [
  { id: 'stripes', name: 'Rayas' },
  { id: 'pinstripes', name: 'Líneas finas' },
  { id: 'hoops', name: 'Franjas' },
  { id: 'checks', name: 'Cuadros' },
  { id: 'chevrons', name: 'Chevrón' },
  { id: 'dots', name: 'Puntos' },
  { id: 'hexagons', name: 'Hexágonos' },
  { id: 'waves', name: 'Ondas' },
  { id: 'diamonds', name: 'Diamantes' },
  { id: 'speckle', name: 'Textura' },
  { id: 'topography', name: 'Topografía' },
  { id: 'rays', name: 'Rayos' },
] as const;

export const FONTS = [
  { id: 'Inter', name: 'Inter' },
  { id: 'Montserrat', name: 'Montserrat' },
  { id: 'Oswald', name: 'Oswald' },
  { id: 'Anton', name: 'Anton' },
  { id: 'Roboto Slab', name: 'Roboto Slab' },
  { id: 'Manrope', name: 'Manrope' },
] as const;

type PixelRect = { x: number; y: number; width: number; height: number };

function toPixelRect(rect: { x: number; y: number; width: number; height: number }, size: number): PixelRect {
  return {
    x: Math.round(rect.x * size),
    y: Math.round(rect.y * size),
    width: Math.round(rect.width * size),
    height: Math.round(rect.height * size),
  };
}

function pixelRects(zone: ZoneId, size: number): PixelRect[] {
  const config = MODEL_MANIFEST.atlas.zones[zone];
  return [config.rect, ...(config.secondaryRects ?? [])].map((rect) => toPixelRect(rect, size));
}

function drawZoneBase(context: CanvasRenderingContext2D, rect: PixelRect, style: ZoneStyle) {
  context.fillStyle = style.color;
  context.fillRect(rect.x, rect.y, rect.width, rect.height);
  if (!style.gradient) return;

  const radians = (style.gradient.angle * Math.PI) / 180;
  const radius = Math.hypot(rect.width, rect.height) / 2;
  const shift = style.gradient.offset * radius * 0.5;
  const cx = rect.x + rect.width * 0.5 + Math.cos(radians) * shift;
  const cy = rect.y + rect.height * 0.5 + Math.sin(radians) * shift;
  const gradient = context.createLinearGradient(
    cx - Math.cos(radians) * radius,
    cy - Math.sin(radians) * radius,
    cx + Math.cos(radians) * radius,
    cy + Math.sin(radians) * radius,
  );
  gradient.addColorStop(0, style.gradient.from);
  gradient.addColorStop(1, style.gradient.to);
  context.fillStyle = gradient;
  context.fillRect(rect.x, rect.y, rect.width, rect.height);
}

function drawPattern(context: CanvasRenderingContext2D, rect: PixelRect, style: ZoneStyle) {
  if (!style.pattern) return;
  const unit = Math.max(14, Math.round(Math.min(rect.width, rect.height) * 0.095 * style.patternScale));
  context.save();
  context.beginPath();
  context.rect(rect.x, rect.y, rect.width, rect.height);
  context.clip();
  context.globalAlpha = style.patternOpacity;
  context.strokeStyle = style.patternColor;
  context.fillStyle = style.patternColor;
  context.lineWidth = Math.max(2, unit * 0.16);
  context.translate(rect.x + rect.width / 2, rect.y + rect.height / 2);
  context.rotate((style.patternAngle * Math.PI) / 180);
  context.translate(-(rect.x + rect.width / 2), -(rect.y + rect.height / 2));
  const left = rect.x - rect.height;
  const right = rect.x + rect.width + rect.height;
  const top = rect.y - rect.width;
  const bottom = rect.y + rect.height + rect.width;

  if (style.pattern === 'stripes' || style.pattern === 'pinstripes') {
    context.lineWidth = style.pattern === 'pinstripes' ? Math.max(1.5, unit * 0.08) : Math.max(4, unit * 0.42);
    for (let x = left; x < right; x += unit) {
      context.beginPath(); context.moveTo(x, top); context.lineTo(x, bottom); context.stroke();
    }
  } else if (style.pattern === 'hoops') {
    context.lineWidth = Math.max(5, unit * 0.48);
    for (let y = top; y < bottom; y += unit) {
      context.beginPath(); context.moveTo(left, y); context.lineTo(right, y); context.stroke();
    }
  } else if (style.pattern === 'checks') {
    for (let y = top; y < bottom; y += unit) {
      for (let x = left; x < right; x += unit) {
        if ((Math.floor(x / unit) + Math.floor(y / unit)) % 2 === 0) context.fillRect(x, y, unit, unit);
      }
    }
  } else if (style.pattern === 'chevrons') {
    for (let y = top; y < bottom; y += unit) {
      context.beginPath(); context.moveTo(left, y); context.lineTo((left + right) / 2, y + unit * 0.55); context.lineTo(right, y); context.stroke();
    }
  } else if (style.pattern === 'dots') {
    for (let y = top; y < bottom; y += unit) for (let x = left; x < right; x += unit) {
      context.beginPath(); context.arc(x, y, unit * 0.16, 0, Math.PI * 2); context.fill();
    }
  } else if (style.pattern === 'hexagons') {
    const radius = unit * 0.38;
    for (let row = -4; row < Math.ceil((bottom - top) / (unit * 0.72)) + 4; row += 1) {
      for (let col = -4; col < Math.ceil((right - left) / unit) + 4; col += 1) {
        const cx = left + col * unit + (row % 2 ? unit / 2 : 0);
        const cy = top + row * unit * 0.72;
        context.beginPath();
        for (let point = 0; point < 6; point += 1) {
          const angle = (Math.PI / 3) * point;
          const px = cx + Math.cos(angle) * radius;
          const py = cy + Math.sin(angle) * radius;
          if (point === 0) context.moveTo(px, py); else context.lineTo(px, py);
        }
        context.closePath(); context.stroke();
      }
    }
  } else if (style.pattern === 'waves' || style.pattern === 'topography') {
    context.lineWidth = style.pattern === 'topography' ? Math.max(1, unit * 0.07) : Math.max(2, unit * 0.14);
    for (let y = top; y < bottom; y += unit * 0.55) {
      context.beginPath();
      for (let x = left; x <= right; x += 5) {
        const py = y + Math.sin(x / unit * Math.PI * 1.7 + y * 0.015) * unit * (style.pattern === 'topography' ? 0.3 : 0.2);
        if (x === left) context.moveTo(x, py); else context.lineTo(x, py);
      }
      context.stroke();
    }
  } else if (style.pattern === 'diamonds') {
    for (let y = top; y < bottom; y += unit) for (let x = left; x < right; x += unit) {
      context.beginPath(); context.moveTo(x, y - unit * 0.35); context.lineTo(x + unit * 0.35, y); context.lineTo(x, y + unit * 0.35); context.lineTo(x - unit * 0.35, y); context.closePath(); context.stroke();
    }
  } else if (style.pattern === 'speckle') {
    let seed = 17;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let index = 0; index < 700; index += 1) {
      const x = rect.x + random() * rect.width;
      const y = rect.y + random() * rect.height;
      context.globalAlpha = style.patternOpacity * (0.3 + random() * 0.7);
      context.fillRect(x, y, 1 + random() * unit * 0.09, 1 + random() * unit * 0.09);
    }
  } else if (style.pattern === 'rays') {
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height * 0.62;
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
      context.beginPath(); context.moveTo(cx, cy); context.lineTo(cx + Math.cos(angle) * rect.width, cy + Math.sin(angle) * rect.width); context.stroke();
    }
  }
  context.restore();
}

function drawLayer(
  context: CanvasRenderingContext2D,
  rect: PixelRect,
  layer: DesignLayer,
  image: HTMLImageElement | undefined,
  selected: boolean,
  safePolygon: [number, number][],
) {
  if (!layer.visible) return;
  const x = rect.x + layer.transform.x * rect.width;
  const y = rect.y + layer.transform.y * rect.height;
  const baseSize = Math.min(rect.width, rect.height) * 0.34 * layer.transform.scale;

  context.save();
  context.beginPath();
  safePolygon.forEach(([localX, localY], index) => {
    const px = rect.x + rect.width * localX;
    const py = rect.y + rect.height * localY;
    if (index === 0) context.moveTo(px, py); else context.lineTo(px, py);
  });
  context.closePath();
  context.clip();
  context.translate(x, y);
  context.rotate((layer.transform.rotation * Math.PI) / 180);

  let width = baseSize;
  let height = baseSize;
  if (layer.type === 'text') {
    const fontSize = baseSize * (layer.subtype === 'number' ? 1.05 : layer.subtype === 'name' ? 0.4 : 0.32);
    context.font = `600 ${fontSize}px "${layer.font}", sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const metrics = context.measureText(layer.text || ' ');
    width = metrics.width + fontSize * 0.35;
    height = fontSize * 1.25;
    if (layer.background) {
      context.fillStyle = layer.background;
      context.fillRect(-width / 2, -height / 2, width, height);
    }
    context.fillStyle = layer.color;
    context.fillText(layer.text, 0, 0);
  } else if (image) {
    const imageWidth = image.naturalWidth;
    const imageHeight = image.naturalHeight;
    const aspect = Number(imageWidth) / Math.max(1, Number(imageHeight));
    width = aspect >= 1 ? baseSize : baseSize * aspect;
    height = aspect >= 1 ? baseSize / aspect : baseSize;
    context.drawImage(image, -width / 2, -height / 2, width, height);
  }

  if (selected) {
    context.strokeStyle = '#22D3EE';
    context.lineWidth = Math.max(2, rect.width * 0.006);
    context.setLineDash([Math.max(5, rect.width * 0.02), Math.max(4, rect.width * 0.012)]);
    context.strokeRect(-width / 2 - 8, -height / 2 - 8, width + 16, height + 16);
  }
  context.restore();
}

export function renderAtlas(
  canvas: HTMLCanvasElement,
  document: DesignDocument,
  assets: Record<string, AssetRecord>,
  images: Record<string, HTMLImageElement>,
  selectedLayerId?: string | null,
) {
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return;
  const size = canvas.width;
  context.fillStyle = '#dfe5ec';
  context.fillRect(0, 0, size, size);

  for (const zone of Object.keys(document.zones) as ZoneId[]) {
    for (const rect of pixelRects(zone, size)) {
      drawZoneBase(context, rect, document.zones[zone]);
      drawPattern(context, rect, document.zones[zone]);
      const layers = document.layers.filter((layer) => layer.zone === zone).sort((a, b) => a.order - b.order);
      for (const layer of layers) {
        const image = layer.type === 'image' ? images[assets[layer.assetId]?.id] : undefined;
        drawLayer(context, rect, layer, image, selectedLayerId === layer.id, MODEL_MANIFEST.atlas.zones[zone].safePolygon);
      }
    }
  }
}

export function hitTestLayer(document: DesignDocument, zone: ZoneId, x: number, y: number) {
  return [...document.layers]
    .filter((layer) => layer.zone === zone && layer.visible && !layer.locked)
    .sort((a, b) => b.order - a.order)
    .find((layer) => {
      const radius = Math.max(0.07, 0.18 * layer.transform.scale);
      return Math.abs(layer.transform.x - x) <= radius && Math.abs(layer.transform.y - y) <= radius;
    });
}
