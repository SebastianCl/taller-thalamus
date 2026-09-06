'use client';

/* oxlint-disable react/react-compiler -- Three.js GPU resources are intentionally mutated after creation. */

import { ContactShadows, OrbitControls, useGLTF, useProgress } from '@react-three/drei';
import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode, type RefObject } from 'react';
import * as THREE from 'three';
import { Box, MousePointer2, Rotate3D, Home, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getLayerFrame, getLayerHandlePoint, hitTestLayer, hitTestLayerHandle, renderAtlas, type LayerFrame, type LayerHandle, type PixelRect } from '@/lib/atlas';
import { MODEL_MANIFEST, localPointFromAtlasUv, zoneFromAtlasUv } from '@/lib/model-manifest';
import { loadUvZoneMask, zoneFromUvMask, type UvZoneMaskLookup } from '@/lib/uv-zone-mask';
import type { ViewId, ZoneId } from '@/lib/design';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/store/editor-store';

type CapturedViews = Record<ViewId, Blob>;
let captureHandler: null | (() => Promise<CapturedViews>) = null;

type ResizeGesture = {
  id: string;
  zone: ZoneId;
  handle: LayerHandle;
  frame: LayerFrame;
  anchor: { x: number; y: number };
  corner: { x: number; y: number };
  startScale: number;
  rotation: number;
};

function atlasRectFor(zone: ZoneId, zoneMask?: UvZoneMaskLookup | null): PixelRect {
  const rect = zoneMask?.rects?.[zone]?.[0] ?? MODEL_MANIFEST.atlas.zones[zone].rect;
  return rect;
}

function imageAspectFor(layer: { type: string; assetId?: string }, assets: Record<string, { width: number; height: number }>) {
  if (layer.type !== 'image' || !layer.assetId) return 1;
  const asset = assets[layer.assetId];
  return asset ? asset.width / Math.max(1, asset.height) : 1;
}

function pointInAtlasRect(zone: ZoneId, uv: { x: number; y: number }, zoneMask?: UvZoneMaskLookup | null) {
  const local = localPointFromAtlasUv(zone, uv.x, uv.y, zoneMask?.rects?.[zone]);
  const rect = atlasRectFor(zone, zoneMask);
  return { x: rect.x + local.x * rect.width, y: rect.y + local.y * rect.height };
}

function layerHandleAtPointer(
  zone: ZoneId,
  uv: { x: number; y: number },
  layer: Parameters<typeof getLayerFrame>[2],
  assets: Record<string, { width: number; height: number }>,
  measureContext: CanvasRenderingContext2D | null,
  zoneMask?: UvZoneMaskLookup | null,
) {
  if (!measureContext) return null;
  const rect = atlasRectFor(zone, zoneMask);
  const frame = getLayerFrame(measureContext, rect, layer, imageAspectFor(layer, assets));
  const point = pointInAtlasRect(zone, uv, zoneMask);
  return hitTestLayerHandle(frame, point.x, point.y, layer.transform.rotation, Math.max(0.02, rect.width * 0.035));
}

function setResizeCursor(event: { nativeEvent: PointerEvent }, handle: LayerHandle | null) {
  const target = event.nativeEvent.currentTarget as HTMLElement | null;
  if (!target) return;
  target.style.cursor = handle === 'top-left' || handle === 'bottom-right'
    ? 'nwse-resize'
    : handle === 'top-right' || handle === 'bottom-left'
      ? 'nesw-resize'
      : '';
}

function resizeFromPoint(
  gesture: ResizeGesture,
  point: { x: number; y: number },
) {
  const radians = (gesture.rotation * Math.PI) / 180;
  const dx = point.x - gesture.anchor.x;
  const dy = point.y - gesture.anchor.y;
  const localX = dx * Math.cos(radians) + dy * Math.sin(radians);
  const localY = -dx * Math.sin(radians) + dy * Math.cos(radians);
  const startDx = gesture.corner.x - gesture.anchor.x;
  const startDy = gesture.corner.y - gesture.anchor.y;
  const denominator = startDx * startDx + startDy * startDy;
  const ratio = Math.max(0.01, (localX * startDx + localY * startDy) / denominator);
  const scale = gesture.startScale * ratio;
  const scaledAnchorX = (gesture.anchor.x - gesture.frame.x) * ratio;
  const scaledAnchorY = (gesture.anchor.y - gesture.frame.y) * ratio;
  const centerX = gesture.anchor.x - (scaledAnchorX * Math.cos(radians) - scaledAnchorY * Math.sin(radians));
  const centerY = gesture.anchor.y - (scaledAnchorX * Math.sin(radians) + scaledAnchorY * Math.cos(radians));
  return { scale, x: centerX, y: centerY };
}

function oppositeHandle(handle: LayerHandle): LayerHandle {
  return handle === 'top-left' ? 'bottom-right' : handle === 'top-right' ? 'bottom-left' : handle === 'bottom-right' ? 'top-left' : 'top-right';
}

function rotatedPoint(frame: LayerFrame, handle: LayerHandle, rotation: number) {
  const local = getLayerHandlePoint({ ...frame, x: 0, y: 0 }, handle);
  const radians = (rotation * Math.PI) / 180;
  return {
    x: frame.x + local.x * Math.cos(radians) - local.y * Math.sin(radians),
    y: frame.y + local.x * Math.sin(radians) + local.y * Math.cos(radians),
  };
}

export async function captureShirtViews() {
  if (!captureHandler) throw new Error('El visor 3D todavía no está listo.');
  return captureHandler();
}

const VIEW_ROTATION: Record<ViewId, number> = Object.fromEntries(
  Object.entries(MODEL_MANIFEST.cameras).map(([id, camera]) => [id, camera.rotationY]),
) as Record<ViewId, number>;

function remapGeometryUv<T extends THREE.BufferGeometry>(geometry: T, zone: ZoneId) {
  const uv = geometry.attributes.uv;
  if (!uv) return geometry;
  const rect = MODEL_MANIFEST.atlas.zones[zone].rect;
  const v0 = 1 - rect.y - rect.height;
  for (let index = 0; index < uv.count; index += 1) {
    uv.setXY(index, rect.x + uv.getX(index) * rect.width, v0 + uv.getY(index) * rect.height);
  }
  uv.needsUpdate = true;
  return geometry;
}

function createTorsoGeometry(side: 'front' | 'back') {
  const zone: ZoneId = side === 'front' ? 'front' : 'back';
  const geometry = new THREE.PlaneGeometry(3.1, 4.35, 38, 52);
  const positions = geometry.attributes.position;
  const direction = side === 'front' ? 1 : -1;

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const normalizedY = (y + 2.175) / 4.35;
    const shoulderEase = THREE.MathUtils.smoothstep(normalizedY, 0.56, 1);
    const width = 0.91 + shoulderEase * 0.09 - Math.sin(normalizedY * Math.PI) * 0.035;
    const normalizedX = x / 1.55;
    const bodyCurve = Math.max(0, 1 - normalizedX * normalizedX) * 0.16;
    const fold = Math.sin(y * 5.2 + x * 2.7) * 0.022 * (0.3 + Math.abs(normalizedX));
    const hemRipple = Math.exp(-Math.pow(normalizedY / 0.14, 2)) * Math.sin(x * 8) * 0.025;
    positions.setXYZ(index, x * width, y, direction * (0.1 + bodyCurve + fold + hemRipple));
  }

  geometry.computeVertexNormals();
  return remapGeometryUv(geometry, zone);
}

function useAtlasTexture(masked = true) {
  const document = useEditorStore((state) => state.document);
  const assets = useEditorStore((state) => state.assets);
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId);
  const interactionMode = useEditorStore((state) => state.interactionMode);
  const invalidate = useThree((state) => state.invalidate);
  const imageCache = useRef<Record<string, HTMLImageElement>>({});
  const [imageVersion, setImageVersion] = useState(0);
  const [fontVersion, setFontVersion] = useState(0);
  const [zoneMask, setZoneMask] = useState<UvZoneMaskLookup | null>(null);
  const canvas = useMemo(() => {
    const element = window.document.createElement('canvas');
    const mobile = window.matchMedia('(max-width: 767px)').matches;
    element.width = element.height = mobile ? MODEL_MANIFEST.atlas.mobileSize : MODEL_MANIFEST.atlas.desktopSize;
    return element;
  }, []);
  const texture = useMemo(() => {
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    result.flipY = false;
    result.wrapS = result.wrapT = THREE.ClampToEdgeWrapping;
    result.generateMipmaps = false;
    result.minFilter = THREE.LinearFilter;
    result.magFilter = THREE.LinearFilter;
    result.anisotropy = 4;
    return result;
  }, [canvas]);

  useEffect(() => {
    if (!masked) return;
    const controller = new AbortController();
    void loadUvZoneMask(canvas.width, controller.signal)
      .then(setZoneMask)
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          console.error('No se pudo aplicar la máscara UV exacta; se usará la segmentación de respaldo.', error);
        }
      });
    return () => controller.abort();
  }, [canvas, masked]);

  useEffect(() => {
    let disposed = false;
    for (const [id, image] of Object.entries(imageCache.current)) {
      if (assets[id]) continue;
      image.src = '';
      delete imageCache.current[id];
    }
    for (const asset of Object.values(assets)) {
      if (imageCache.current[asset.id]) continue;
      const image = new Image();
      image.onload = () => {
        if (disposed) return;
        imageCache.current[asset.id] = image;
        setImageVersion((version) => version + 1);
      };
      image.src = asset.previewUrl;
    }
    return () => { disposed = true; };
  }, [assets]);

  useEffect(() => {
    let active = true;
    void window.document.fonts.ready.then(() => { if (active) setFontVersion((version) => version + 1); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const visibleSelection = interactionMode === 'move' ? selectedLayerId : null;
    renderAtlas(canvas, document, assets, imageCache.current, visibleSelection, masked ? zoneMask : null);
    texture.needsUpdate = true;
    invalidate();
  }, [assets, canvas, document, fontVersion, imageVersion, interactionMode, invalidate, masked, selectedLayerId, texture, zoneMask]);

  useEffect(() => () => texture.dispose(), [texture]);
  return { texture, zoneMask };
}

function ClothMaterial({ texture, selected = false }: { texture: THREE.Texture; selected?: boolean }) {
  return (
    <meshPhysicalMaterial
      map={texture}
      color="#ffffff"
      roughness={0.84}
      metalness={0}
      clearcoat={0.035}
      sheen={0.5}
      sheenColor={new THREE.Color('#f4f8ff')}
      emissive={selected ? '#0e7490' : '#000000'}
      emissiveIntensity={selected ? 0.07 : 0}
      side={THREE.DoubleSide}
    />
  );
}

function createFabricNormalTexture() {
  const canvas = window.document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = 'rgb(128,128,255)';
    context.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 4) {
      context.strokeStyle = y % 8 === 0 ? 'rgb(136,124,250)' : 'rgb(120,132,255)';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(256, y + 1);
      context.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(18, 18);
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

function createFabricScalarTexture(base: number, variation: number) {
  const data = new Uint8Array(64 * 64 * 4);
  let seed = 29;
  for (let index = 0; index < 64 * 64; index += 1) {
    seed = (seed * 16807) % 2147483647;
    const value = Math.max(0, Math.min(255, Math.round(base + (seed / 2147483647 - 0.5) * variation)));
    data[index * 4] = value;
    data[index * 4 + 1] = value;
    data[index * 4 + 2] = value;
    data[index * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, 64, 64, THREE.RGBAFormat);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(12, 12);
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

type ZoneHandlers = {
  onPointerDown: (event: ThreeEvent<PointerEvent>) => void;
  onPointerMove: (event: ThreeEvent<PointerEvent>) => void;
  onPointerUp: (event: ThreeEvent<PointerEvent>) => void;
  onPointerCancel: (event: ThreeEvent<PointerEvent>) => void;
};

function ProceduralJerseyModel({ groupRef }: { groupRef: RefObject<THREE.Group | null> }) {
  const invalidate = useThree((state) => state.invalidate);
  const document = useEditorStore((state) => state.document);
  const selectedZone = useEditorStore((state) => state.selectedZone);
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId);
  const assets = useEditorStore((state) => state.assets);
  const interactionMode = useEditorStore((state) => state.interactionMode);
  const setSelectedZone = useEditorStore((state) => state.setSelectedZone);
  const selectLayer = useEditorStore((state) => state.selectLayer);
  const beginGesture = useEditorStore((state) => state.beginGesture);
  const updateLayerLive = useEditorStore((state) => state.updateLayerLive);
  const updateLayerResizeLive = useEditorStore((state) => state.updateLayerResizeLive);
  const endGesture = useEditorStore((state) => state.endGesture);
  const view = useEditorStore((state) => state.view);
  const { texture } = useAtlasTexture(false);
  const dragLayer = useRef<string | null>(null);
  const resizeGesture = useRef<ResizeGesture | null>(null);
  const measureContext = useMemo(() => window.document.createElement('canvas').getContext('2d'), []);

  const geometries = useMemo(() => ({
    front: createTorsoGeometry('front'),
    back: createTorsoGeometry('back'),
    sleeveLeft: remapGeometryUv(new THREE.BoxGeometry(1.35, 1.45, 0.38, 10, 14, 2), 'sleeveLeft'),
    sleeveRight: remapGeometryUv(new THREE.BoxGeometry(1.35, 1.45, 0.38, 10, 14, 2), 'sleeveRight'),
    sideLeft: remapGeometryUv(new THREE.BoxGeometry(0.17, 4.05, 0.32, 2, 20, 2), 'sideLeft'),
    sideRight: remapGeometryUv(new THREE.BoxGeometry(0.17, 4.05, 0.32, 2, 20, 2), 'sideRight'),
    collar: remapGeometryUv(new THREE.TorusGeometry(0.48, 0.115, 14, 64), 'collar'),
  }), []);

  useEffect(() => () => Object.values(geometries).forEach((geometry) => geometry.dispose()), [geometries]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const target = VIEW_ROTATION[view];
    const current = groupRef.current.rotation.y;
    const next = THREE.MathUtils.damp(current, target, 7, delta);
    groupRef.current.rotation.y = next;
    if (Math.abs(next - target) > 0.001) invalidate();
  });

  const handlers = useCallback((zone: ZoneId): ZoneHandlers => ({
    onPointerDown: (event) => {
      setSelectedZone(zone);
      if (!event.uv) return;
      const state = useEditorStore.getState();
      const selected = state.document.layers.find((layer) => layer.id === state.selectedLayerId);
      if (interactionMode === 'move' && measureContext && selected?.zone === zone && !selected.locked) {
        const rect = atlasRectFor(zone);
        const frame = getLayerFrame(measureContext, rect, selected, imageAspectFor(selected, assets));
        const point = pointInAtlasRect(zone, event.uv);
        const handle = hitTestLayerHandle(frame, point.x, point.y, selected.transform.rotation, Math.max(0.02, rect.width * 0.035));
        if (handle) {
          const anchor = rotatedPoint(frame, oppositeHandle(handle), selected.transform.rotation);
          resizeGesture.current = { id: selected.id, zone, handle, frame, anchor, corner: rotatedPoint(frame, handle, selected.transform.rotation), startScale: selected.transform.scale, rotation: selected.transform.rotation };
          event.stopPropagation();
          beginGesture();
          (event.target as Element | null)?.setPointerCapture?.(event.pointerId);
          return;
        }
      }
      const point = localPointFromAtlasUv(zone, event.uv.x, event.uv.y);
      const layer = hitTestLayer(state.document, zone, point.x, point.y);
      if (layer && interactionMode === 'move') {
        event.stopPropagation();
        selectLayer(layer.id);
        dragLayer.current = layer.id;
        beginGesture();
        (event.target as Element | null)?.setPointerCapture?.(event.pointerId);
      } else if (interactionMode === 'move') {
        event.stopPropagation();
        selectLayer(null);
      }
    },
    onPointerMove: (event) => {
      if (!event.uv) {
        setResizeCursor(event, null);
        return;
      }
      if (resizeGesture.current) {
        setResizeCursor(event, resizeGesture.current.handle);
        event.stopPropagation();
        const point = pointInAtlasRect(resizeGesture.current.zone, event.uv);
        const next = resizeFromPoint(resizeGesture.current, point);
        const rect = atlasRectFor(resizeGesture.current.zone);
        updateLayerResizeLive(resizeGesture.current.id, next.scale, (next.x - rect.x) / rect.width, (next.y - rect.y) / rect.height);
        return;
      }
      const state = useEditorStore.getState();
      const selected = state.document.layers.find((layer) => layer.id === state.selectedLayerId);
      setResizeCursor(event, interactionMode === 'move' && selected?.zone === zone && !selected.locked ? layerHandleAtPointer(zone, event.uv, selected, assets, measureContext) : null);
      if (!dragLayer.current) return;
      event.stopPropagation();
      const point = localPointFromAtlasUv(zone, event.uv.x, event.uv.y);
      updateLayerLive(dragLayer.current, point.x, point.y);
    },
    onPointerUp: (event) => {
      if (!dragLayer.current && !resizeGesture.current) return;
      event.stopPropagation();
      dragLayer.current = null;
      resizeGesture.current = null;
      setResizeCursor(event, null);
      endGesture();
      (event.target as Element | null)?.releasePointerCapture?.(event.pointerId);
    },
    onPointerCancel: (event) => {
      if (!dragLayer.current && !resizeGesture.current) return;
      event.stopPropagation();
      dragLayer.current = null;
      resizeGesture.current = null;
      setResizeCursor(event, null);
      endGesture();
    },
  }), [assets, beginGesture, endGesture, interactionMode, measureContext, selectLayer, setSelectedZone, updateLayerLive, updateLayerResizeLive]);

  const zone = document.zones;

  return (
    <group ref={groupRef} position={[0, -0.1, 0]} dispose={null}>
      <mesh name="TorsoFront" geometry={geometries.front} castShadow receiveShadow {...handlers('front')}>
        <ClothMaterial texture={texture} selected={selectedZone === 'front' || document.layers.some((layer) => layer.id === selectedLayerId && layer.zone === 'front')} />
      </mesh>
      <mesh name="TorsoBack" geometry={geometries.back} castShadow receiveShadow {...handlers('back')}>
        <ClothMaterial texture={texture} selected={selectedZone === 'back' || document.layers.some((layer) => layer.id === selectedLayerId && layer.zone === 'back')} />
      </mesh>
      <mesh name="SideLeft" geometry={geometries.sideLeft} position={[-1.53, -0.15, 0]} castShadow {...handlers('sideLeft')}>
        <ClothMaterial texture={texture} selected={selectedZone === 'sideLeft'} />
      </mesh>
      <mesh name="SideRight" geometry={geometries.sideRight} position={[1.53, -0.15, 0]} castShadow {...handlers('sideRight')}>
        <ClothMaterial texture={texture} selected={selectedZone === 'sideRight'} />
      </mesh>
      <mesh name="SleeveLeft" geometry={geometries.sleeveLeft} position={[-1.92, 1.25, 0]} rotation={[0, 0, -0.58]} castShadow {...handlers('sleeveLeft')}>
        <ClothMaterial texture={texture} selected={selectedZone === 'sleeveLeft'} />
      </mesh>
      <mesh name="SleeveRight" geometry={geometries.sleeveRight} position={[1.92, 1.25, 0]} rotation={[0, 0, 0.58]} castShadow {...handlers('sleeveRight')}>
        <ClothMaterial texture={texture} selected={selectedZone === 'sleeveRight'} />
      </mesh>
      <mesh name="Collar" geometry={geometries.collar} position={[0, 2.05, 0.13]} castShadow {...handlers('collar')}>
        <ClothMaterial texture={texture} selected={selectedZone === 'collar'} />
      </mesh>
      <mesh position={[0, 2.05, 0.105]}>
        <circleGeometry args={[0.41, 48]} />
        <meshStandardMaterial color="#152033" roughness={1} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -2.27, 0]} castShadow>
        <boxGeometry args={[2.9, 0.1, 0.36, 24, 2, 2]} />
        <meshPhysicalMaterial color={zone.front.color} roughness={0.9} />
      </mesh>
    </group>
  );
}

function LicensedJerseyModel({ groupRef }: { groupRef: RefObject<THREE.Group | null> }) {
  const gltf = useGLTF('/models/taller-sport.glb') as unknown as { scene: THREE.Group };
  const invalidate = useThree((state) => state.invalidate);
  const { texture, zoneMask } = useAtlasTexture();
  const fabricNormal = useMemo(() => createFabricNormalTexture(), []);
  const fabricRoughness = useMemo(() => createFabricScalarTexture(220, 18), []);
  const fabricAo = useMemo(() => createFabricScalarTexture(247, 10), []);
  const view = useEditorStore((state) => state.view);
  const assets = useEditorStore((state) => state.assets);
  const interactionMode = useEditorStore((state) => state.interactionMode);
  const setSelectedZone = useEditorStore((state) => state.setSelectedZone);
  const selectLayer = useEditorStore((state) => state.selectLayer);
  const beginGesture = useEditorStore((state) => state.beginGesture);
  const updateLayerLive = useEditorStore((state) => state.updateLayerLive);
  const updateLayerResizeLive = useEditorStore((state) => state.updateLayerResizeLive);
  const endGesture = useEditorStore((state) => state.endGesture);
  const dragLayer = useRef<string | null>(null);
  const resizeGesture = useRef<ResizeGesture | null>(null);
  const measureContext = useMemo(() => window.document.createElement('canvas').getContext('2d'), []);

  const model = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;
      object.geometry = object.geometry.clone();
      const uv = object.geometry.getAttribute('uv');
      if (uv && !object.geometry.getAttribute('uv1')) object.geometry.setAttribute('uv1', uv.clone());
      if (uv && object.geometry.index && object.geometry.getAttribute('normal') && !object.geometry.getAttribute('tangent')) object.geometry.computeTangents();
      const original = Array.isArray(object.material) ? object.material[0] : object.material;
      const material = (original as THREE.MeshStandardMaterial).clone();
      material.map = texture;
      material.normalMap = fabricNormal;
      material.normalScale.set(0.32, 0.32);
      material.roughnessMap = fabricRoughness;
      material.metalnessMap = null;
      material.aoMap = fabricAo;
      material.aoMapIntensity = 0.28;
      material.color.set('#ffffff');
      material.roughness = Math.max(0.62, material.roughness);
      material.metalness = 0;
      material.side = THREE.FrontSide;
      material.needsUpdate = true;
      object.material = material;
    });
    const bounds = new THREE.Box3().setFromObject(clone);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const scale = 3.85 / size.y;
    clone.scale.setScalar(scale);
    clone.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
    return clone;
  }, [fabricAo, fabricNormal, fabricRoughness, gltf.scene, texture]);

  useEffect(() => () => {
    model.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const material = Array.isArray(object.material) ? object.material : [object.material];
        material.forEach((item) => item.dispose());
      }
    });
  }, [model]);

  useEffect(() => () => fabricNormal.dispose(), [fabricNormal]);
  useEffect(() => () => fabricRoughness.dispose(), [fabricRoughness]);
  useEffect(() => () => fabricAo.dispose(), [fabricAo]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const target = VIEW_ROTATION[view];
    const next = THREE.MathUtils.damp(groupRef.current.rotation.y, target, 7, delta);
    groupRef.current.rotation.y = next;
    if (Math.abs(next - target) > 0.001) invalidate();
  });

  const onPointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (!event.uv) return;
    const zone = zoneMask
      ? zoneFromUvMask(zoneMask, event.uv.x, event.uv.y)
      : zoneFromAtlasUv(event.uv.x, event.uv.y);
    if (!zone) return;
    setSelectedZone(zone);
    const state = useEditorStore.getState();
    const selected = state.document.layers.find((layer) => layer.id === state.selectedLayerId);
    if (interactionMode === 'move' && measureContext && selected?.zone === zone && !selected.locked) {
      const rect = atlasRectFor(zone, zoneMask);
      const frame = getLayerFrame(measureContext, rect, selected, imageAspectFor(selected, assets));
      const point = pointInAtlasRect(zone, event.uv, zoneMask);
      const handle = hitTestLayerHandle(frame, point.x, point.y, selected.transform.rotation, Math.max(0.02, rect.width * 0.035));
      if (handle) {
        const anchor = rotatedPoint(frame, oppositeHandle(handle), selected.transform.rotation);
        resizeGesture.current = { id: selected.id, zone, handle, frame, anchor, corner: rotatedPoint(frame, handle, selected.transform.rotation), startScale: selected.transform.scale, rotation: selected.transform.rotation };
        event.stopPropagation();
        beginGesture();
        (event.target as Element | null)?.setPointerCapture?.(event.pointerId);
        return;
      }
    }
    const point = localPointFromAtlasUv(zone, event.uv.x, event.uv.y, zoneMask?.rects?.[zone]);
    const layer = hitTestLayer(state.document, zone, point.x, point.y);
    if (layer && interactionMode === 'move') {
      event.stopPropagation();
      selectLayer(layer.id);
      dragLayer.current = layer.id;
      beginGesture();
      (event.target as Element | null)?.setPointerCapture?.(event.pointerId);
    } else if (interactionMode === 'move') {
      event.stopPropagation();
      selectLayer(null);
    }
  };
  const onPointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (!event.uv) {
      setResizeCursor(event, null);
      return;
    }
    if (resizeGesture.current) {
      setResizeCursor(event, resizeGesture.current.handle);
      event.stopPropagation();
      const point = pointInAtlasRect(resizeGesture.current.zone, event.uv, zoneMask);
      const next = resizeFromPoint(resizeGesture.current, point);
      const rect = atlasRectFor(resizeGesture.current.zone, zoneMask);
      updateLayerResizeLive(resizeGesture.current.id, next.scale, (next.x - rect.x) / rect.width, (next.y - rect.y) / rect.height);
      return;
    }
    const state = useEditorStore.getState();
    const selected = state.document.layers.find((layer) => layer.id === state.selectedLayerId);
    const hoverZone = zoneMask ? zoneFromUvMask(zoneMask, event.uv.x, event.uv.y) : zoneFromAtlasUv(event.uv.x, event.uv.y);
    setResizeCursor(event, interactionMode === 'move' && hoverZone && selected?.zone === hoverZone && !selected.locked ? layerHandleAtPointer(hoverZone, event.uv, selected, assets, measureContext, zoneMask) : null);
    if (!dragLayer.current) return;
    const layer = useEditorStore.getState().document.layers.find((item) => item.id === dragLayer.current);
    if (!layer) return;
    event.stopPropagation();
    const point = localPointFromAtlasUv(layer.zone, event.uv.x, event.uv.y, zoneMask?.rects?.[layer.zone]);
    updateLayerLive(layer.id, point.x, point.y);
  };
  const finish = (event: ThreeEvent<PointerEvent>) => {
    if (!dragLayer.current && !resizeGesture.current) return;
    event.stopPropagation();
    dragLayer.current = null;
    resizeGesture.current = null;
    setResizeCursor(event, null);
    endGesture();
    (event.target as Element | null)?.releasePointerCapture?.(event.pointerId);
  };

  return (
    <group ref={groupRef} position={[0, -0.08, 0]}>
      <primitive object={model} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={finish} onPointerCancel={finish} />
    </group>
  );
}

type ModelBoundaryProps = { children: ReactNode; fallback: ReactNode; onError: () => void };
type ModelBoundaryState = { failed: boolean };

class ModelErrorBoundary extends Component<ModelBoundaryProps, ModelBoundaryState> {
  state: ModelBoundaryState = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

useGLTF.preload('/models/taller-sport.glb');

function CaptureBridge({ groupRef }: { groupRef: RefObject<THREE.Group | null> }) {
  const { gl, scene, camera, invalidate } = useThree();

  useEffect(() => {
    const capture = async () => {
      if (!groupRef.current) throw new Error('El modelo aún se está preparando.');
      const originalRotation = groupRef.current.rotation.y;
      const originalSize = gl.getSize(new THREE.Vector2());
      const originalPixelRatio = gl.getPixelRatio();
      const perspectiveCamera = camera as THREE.PerspectiveCamera;
      const originalAspect = perspectiveCamera.aspect;
      const captures = {} as CapturedViews;
      try {
        gl.setPixelRatio(1);
        gl.setSize(1600, 1600, false);
        perspectiveCamera.aspect = 1;
        perspectiveCamera.updateProjectionMatrix();
        for (const view of ['front', 'back', 'left', 'right'] as ViewId[]) {
          groupRef.current.rotation.y = VIEW_ROTATION[view];
          gl.render(scene, camera);
          captures[view] = await new Promise<Blob>((resolve, reject) => gl.domElement.toBlob((blob) => blob ? resolve(blob) : reject(new Error('No se pudo crear una vista PNG.')), 'image/png'));
        }
      } finally {
        groupRef.current.rotation.y = originalRotation;
        gl.setPixelRatio(originalPixelRatio);
        gl.setSize(originalSize.x, originalSize.y, false);
        perspectiveCamera.aspect = originalAspect;
        perspectiveCamera.updateProjectionMatrix();
        invalidate();
      }
      return captures;
    };
    captureHandler = capture;
    return () => { if (captureHandler === capture) captureHandler = null; };
  }, [camera, gl, groupRef, invalidate, scene]);

  return null;
}

function WebGLWatcher({ onLost, onRestored }: { onLost: () => void; onRestored: () => void }) {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    const canvas = gl.domElement;
    const lose = (event: Event) => { event.preventDefault(); onLost(); };
    canvas.addEventListener('webglcontextlost', lose);
    canvas.addEventListener('webglcontextrestored', onRestored);
    return () => {
      canvas.removeEventListener('webglcontextlost', lose);
      canvas.removeEventListener('webglcontextrestored', onRestored);
    };
  }, [gl, onLost, onRestored]);
  return null;
}

export function ShirtStage() {
  const webgl2 = useMemo(() => Boolean(window.document.createElement('canvas').getContext('webgl2')), []);
  const [contextLost, setContextLost] = useState(false);
  const [modelError, setModelError] = useState(false);
  const [modelAttempt, setModelAttempt] = useState(0);
  const groupRef = useRef<THREE.Group>(null);
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);
  const progress = useProgress();
  const view = useEditorStore((state) => state.view);
  const setView = useEditorStore((state) => state.setView);
  const interactionMode = useEditorStore((state) => state.interactionMode);
  const setInteractionMode = useEditorStore((state) => state.setInteractionMode);
  const selectedZone = useEditorStore((state) => state.selectedZone);

  const zoom = useCallback((factor: number) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const offset = controls.object.position.clone().sub(controls.target);
    const distance = THREE.MathUtils.clamp(offset.length() * factor, 5.3, 10);
    controls.object.position.copy(controls.target.clone().add(offset.normalize().multiplyScalar(distance)));
    controls.update();
  }, []);

  if (webgl2 === false) {
    return (
      <div className="editor-grid flex h-full items-center justify-center p-6" role="alert">
        <div className="max-w-sm rounded-2xl border bg-card p-6 text-center shadow-sm">
          <Box className="mx-auto mb-3 size-9 text-muted-foreground" />
          <h2 className="font-heading text-lg font-bold">Tu navegador no ofrece WebGL 2</h2>
          <p className="mt-2 text-sm text-muted-foreground">Puedes conservar e importar proyectos, pero el visor 3D necesita aceleración gráfica.</p>
        </div>
      </div>
    );
  }

  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- The 3D viewport is a keyboard-operated application surface.
    <section data-editor-stage role="application" tabIndex={0} className="editor-grid relative h-full min-h-0 overflow-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500" aria-label="Visor 3D de la camiseta. Usa las flechas para mover la capa seleccionada.">
      <Canvas
        frameloop="demand"
        dpr={[1, 1.75]}
        shadows="basic"
        camera={{ position: [0, 0.15, 7.4], fov: 36, near: 0.1, far: 60 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
      >
        <ambientLight intensity={1.4} />
        <hemisphereLight args={['#f8fbff', '#536273', 1.6]} />
        <directionalLight position={[4, 6, 5]} intensity={3.2} castShadow shadow-mapSize={[1024, 1024]} />
        <directionalLight position={[-4, 2, 3]} intensity={1.4} color="#bfe8ff" />
        <ModelErrorBoundary
          key={modelAttempt}
          onError={() => setModelError(true)}
          fallback={<ProceduralJerseyModel groupRef={groupRef} />}
        >
          <Suspense fallback={null}>
            <LicensedJerseyModel groupRef={groupRef} />
          </Suspense>
        </ModelErrorBoundary>
        <ContactShadows position={[0, -2.15, 0]} opacity={0.25} scale={8} blur={2.8} far={4} />
        <OrbitControls
          ref={controlsRef}
          makeDefault
          enabled
          mouseButtons={{
            LEFT: interactionMode === 'rotate' ? THREE.MOUSE.ROTATE : (-1 as unknown as THREE.MOUSE),
            MIDDLE: THREE.MOUSE.ROTATE,
          }}
          touches={{
            ONE: interactionMode === 'rotate' ? THREE.TOUCH.ROTATE : (-1 as unknown as THREE.TOUCH),
            TWO: THREE.TOUCH.DOLLY_PAN,
          }}
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          minDistance={5.3}
          maxDistance={10}
          minPolarAngle={Math.PI * 0.29}
          maxPolarAngle={Math.PI * 0.69}
        />
        <CaptureBridge groupRef={groupRef} />
        <WebGLWatcher onLost={() => setContextLost(true)} onRestored={() => setContextLost(false)} />
      </Canvas>

      {progress.active ? (
        <output className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-background/76 backdrop-blur-sm" aria-live="polite">
          <div className="w-56 rounded-2xl border bg-card p-4 shadow-lg">
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground"><span>Cargando camiseta</span><span>{Math.round(progress.progress)}%</span></div>
            <progress className="mt-2 block h-1.5 w-full overflow-hidden rounded-full accent-sky-500" aria-label="Carga del modelo 3D" max={100} value={Math.round(progress.progress)} />
          </div>
        </output>
      ) : null}

      {modelError ? (
        <output className="absolute left-1/2 top-12 z-20 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow-lg" aria-live="polite">
          <span>Se cargó el modelo de respaldo.</span>
          <Button variant="outline" size="sm" className="h-8 border-amber-300 bg-card" onClick={() => { useGLTF.clear('/models/taller-sport.glb'); setModelError(false); setModelAttempt((value) => value + 1); }}>Reintentar 3D</Button>
        </output>
      ) : null}

      {contextLost ? (
        <div className="absolute inset-0 z-30 grid place-items-center bg-background/80 p-6 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-labelledby="webgl-recovery-title">
          <div className="max-w-sm rounded-2xl bg-card p-5 text-center shadow-xl">
            <Box className="mx-auto mb-2 size-8 text-amber-500" />
            <h2 id="webgl-recovery-title" className="font-heading font-bold">Reconectando el visor…</h2>
            <p className="mt-1 text-sm text-muted-foreground">Tu diseño está a salvo. Si no vuelve en unos segundos, recarga la página.</p>
            <Button className="mt-4" onClick={() => location.reload()}>Recargar visor</Button>
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center md:top-4">
        <div className="rounded-full border bg-card/82 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur-md">
          Zona activa: <span className="text-foreground">{MODEL_MANIFEST.atlas.zones[selectedZone] ? ({ front: 'Frente', back: 'Espalda', sleeveLeft: 'Manga izquierda', sleeveRight: 'Manga derecha', collar: 'Cuello', sideLeft: 'Lateral izquierdo', sideRight: 'Lateral derecho' } as Record<ZoneId, string>)[selectedZone] : 'Frente'}</span>
        </div>
      </div>

      {/* <div className="absolute bottom-14 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-white/80 bg-white/90 p-1 shadow-lg backdrop-blur-md md:bottom-6">
        {(['front', 'left', 'back', 'right'] as ViewId[]).map((item) => (
          <Button key={item} variant={view === item ? 'default' : 'ghost'} size="sm" className="h-9 min-w-10 px-3 text-xs" onClick={() => setView(item)} aria-pressed={view === item}>
            {item === 'front' ? 'Frente' : item === 'back' ? 'Espalda' : item === 'left' ? 'Izq.' : 'Der.'}
          </Button>
        ))}
      </div> */}

      <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1 rounded-xl border bg-card/92 p-1 shadow-lg backdrop-blur md:hidden">
        <Button aria-pressed={interactionMode === 'move'} variant={interactionMode === 'move' ? 'default' : 'ghost'} size="sm" className="h-9" onClick={() => setInteractionMode('move')}><MousePointer2 /> Editar</Button>
        <Button aria-pressed={interactionMode === 'rotate'} variant={interactionMode === 'rotate' ? 'default' : 'ghost'} size="sm" className="h-9" onClick={() => setInteractionMode('rotate')}><Rotate3D /> Girar</Button>
      </div>

      <div className="absolute right-3 top-1/2 flex -translate-y-1/2 flex-col gap-1 rounded-xl border bg-card/90 p-1 shadow-lg backdrop-blur-md md:right-5">
        <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-lg" aria-label="Restablecer vista" onClick={() => { setView('front'); controlsRef.current?.reset(); }} />}><Home /></TooltipTrigger><TooltipContent side="left">Restablecer vista</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-lg" aria-label="Acercar cámara" onClick={() => zoom(0.82)} />}><ZoomIn /></TooltipTrigger><TooltipContent side="left">Acercar</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-lg" aria-label="Alejar cámara" onClick={() => zoom(1.22)} />}><ZoomOut /></TooltipTrigger><TooltipContent side="left">Alejar</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-lg" aria-label="Girar" onClick={() => setView(view === 'front' ? 'back' : 'front')} />}><RefreshCw /></TooltipTrigger><TooltipContent side="left">Girar 180°</TooltipContent></Tooltip>
      </div>

      <div className="absolute bottom-4 left-4 hidden items-center gap-1 rounded-xl border border-sidebar-border bg-sidebar/90 p-1 text-sidebar-foreground shadow-lg backdrop-blur md:flex">
        <Button aria-pressed={interactionMode === 'move'} variant="ghost" size="sm" className={cn('h-9 text-xs text-white hover:bg-white/12 hover:text-white', interactionMode === 'move' && 'bg-sky-500 hover:bg-sky-500')} onClick={() => setInteractionMode('move')}><MousePointer2 /> Editar</Button>
        <Button aria-pressed={interactionMode === 'rotate'} variant="ghost" size="sm" className={cn('h-9 text-xs text-white hover:bg-white/12 hover:text-white', interactionMode === 'rotate' && 'bg-sky-500 hover:bg-sky-500')} onClick={() => setInteractionMode('rotate')}><Rotate3D /> Girar</Button>
      </div>
    </section>
  );
}
