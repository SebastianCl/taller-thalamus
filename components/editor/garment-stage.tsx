'use client';

import {
  Component,
  Suspense,
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import { useGLTF, useProgress } from '@react-three/drei';
import { ShirtStage, captureShirtViews } from './shirt-stage';
import { NewGarmentStage } from './new-garment-stage';
import { loadUvZoneMask } from '@/lib/uv-zone-mask';
import { registerCapture } from '@/lib/stage-capture';
import { useEditorStore } from '@/store/editor-store';

// Observe readiness around the original stage without altering its rendering.
function ShirtReadiness({
  container,
}: {
  container: RefObject<HTMLDivElement | null>;
}) {
  useGLTF('/models/taller-sport.glb');
  const documentId = useEditorStore((state) => state.document.id);
  const assets = useEditorStore((state) => state.assets);
  const { active } = useProgress();
  useEffect(() => registerCapture('taller-sport-v1', captureShirtViews), []);
  useEffect(() => {
    const controller = new AbortController();
    let canvas: HTMLCanvasElement | null = null;
    const status = (value: 'loading' | 'ready' | 'error') => {
      if (controller.signal.aborted) return;
      if (value === 'ready') {
        const context = canvas?.getContext('webgl2');
        if (!context || context.isContextLost()) value = 'error';
      }
      useEditorStore.getState().setStageStatus('taller-sport-v1', value);
    };
    const lost = () => status('error');
    const restored = () => {
      status('loading');
      requestAnimationFrame(() => status('ready'));
    };
    status('loading');
    if (!active) {
      const images = Object.values(assets).map(async (asset) => {
        const image = new Image();
        image.src = asset.previewUrl;
        await image.decode();
      });
      void Promise.all([
        loadUvZoneMask(1024, controller.signal),
        window.document.fonts.ready,
        ...images,
      ])
        .then(() =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              if (controller.signal.aborted) return;
              canvas = container.current?.querySelector('canvas') ?? null;
              canvas?.addEventListener('webglcontextlost', lost);
              canvas?.addEventListener('webglcontextrestored', restored);
              status('ready');
            }),
          ),
        )
        .catch(() => status('error'));
    }
    return () => {
      controller.abort();
      canvas?.removeEventListener('webglcontextlost', lost);
      canvas?.removeEventListener('webglcontextrestored', restored);
    };
  }, [documentId, assets, active, container]);
  return null;
}

class ReadinessBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    useEditorStore.getState().setStageStatus('taller-sport-v1', 'error');
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function GarmentStage() {
  const container = useRef<HTMLDivElement>(null);
  const modelId = useEditorStore((state) => state.document.modelId);
  if (modelId !== 'taller-sport-v1') return <NewGarmentStage key={modelId} />;
  return (
    <div ref={container} className="h-full min-h-0">
      <ShirtStage />
      <ReadinessBoundary>
        <Suspense fallback={null}>
          <ShirtReadiness container={container} />
        </Suspense>
      </ReadinessBoundary>
    </div>
  );
}
