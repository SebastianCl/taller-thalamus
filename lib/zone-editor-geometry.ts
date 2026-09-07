import type { LayerFrame, LayerHandle, PixelRect } from '@/lib/atlas';
import { getLayerHandlePoint } from '@/lib/atlas';

export type Point = { x: number; y: number };
export type Viewport = Point & { scale: number };

export function fitZone(
  width: number,
  height: number,
  rect: PixelRect,
  zoom: number,
  pan: Point,
): Viewport {
  const scale =
    Math.max(
      0.01,
      Math.min(
        Math.max(1, width - 96) / rect.width,
        Math.max(1, height - Math.min(112, Math.max(32, height * 0.2))) /
          rect.height,
      ),
    ) * zoom;
  return {
    scale,
    x: (width - rect.width * scale) / 2 + pan.x,
    y: (height - rect.height * scale) / 2 + pan.y,
  };
}

export function screenToZone(point: Point, viewport: Viewport): Point {
  return {
    x: (point.x - viewport.x) / viewport.scale,
    y: (point.y - viewport.y) / viewport.scale,
  };
}

export function rotatePoint(point: Point, degrees: number): Point {
  const angle = (degrees * Math.PI) / 180;
  return {
    x: point.x * Math.cos(angle) - point.y * Math.sin(angle),
    y: point.x * Math.sin(angle) + point.y * Math.cos(angle),
  };
}

export function framePoint(
  frame: LayerFrame,
  point: Point,
  rotation: number,
): Point {
  const rotated = rotatePoint(point, rotation);
  return { x: frame.x + rotated.x, y: frame.y + rotated.y };
}

export function containsLayer(
  frame: LayerFrame,
  point: Point,
  rotation: number,
): boolean {
  const local = rotatePoint(
    { x: point.x - frame.x, y: point.y - frame.y },
    -rotation,
  );
  return (
    Math.abs(local.x) <= frame.width / 2 &&
    Math.abs(local.y) <= frame.height / 2
  );
}

export function resizeLayer(
  frame: LayerFrame,
  handle: LayerHandle,
  rotation: number,
  startScale: number,
  pointer: Point,
) {
  const corner = getLayerHandlePoint(frame, handle);
  const anchor = framePoint(frame, { x: -corner.x, y: -corner.y }, rotation);
  const vector = rotatePoint({ x: corner.x * 2, y: corner.y * 2 }, rotation);
  const lengthSquared = vector.x ** 2 + vector.y ** 2;
  const ratio =
    lengthSquared > 0
      ? ((pointer.x - anchor.x) * vector.x +
          (pointer.y - anchor.y) * vector.y) /
        lengthSquared
      : 1;
  const scale = Math.max(0.1, Math.min(4, startScale * ratio));
  const actualRatio = scale / startScale;
  return {
    scale,
    x: anchor.x + (vector.x * actualRatio) / 2,
    y: anchor.y + (vector.y * actualRatio) / 2,
  };
}

export function rotationDelta(
  start: Point,
  current: Point,
  center: Point,
): number {
  const angle =
    ((Math.atan2(current.y - center.y, current.x - center.x) -
      Math.atan2(start.y - center.y, start.x - center.x)) *
      180) /
    Math.PI;
  return ((angle + 540) % 360) - 180;
}

export function snapCenter(
  point: Point,
  width: number,
  height: number,
  scale: number,
  enabled: boolean,
) {
  const snapX = enabled && Math.abs(point.x - width / 2) * scale < 8;
  const snapY = enabled && Math.abs(point.y - height / 2) * scale < 8;
  return {
    x: snapX ? width / 2 : point.x,
    y: snapY ? height / 2 : point.y,
    snapX,
    snapY,
  };
}
