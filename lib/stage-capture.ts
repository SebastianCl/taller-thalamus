import type { ViewId } from '@/lib/design';
import type { ModelId } from '@/lib/garment-types';

type Capture = () => Promise<Record<ViewId, Blob>>;
let active: { modelId: ModelId; capture: Capture } | null = null;

export function registerCapture(modelId: ModelId, capture: Capture) {
  const registration = { modelId, capture };
  active = registration;
  return () => {
    if (active === registration) active = null;
  };
}

export function getActiveCapture(modelId: ModelId) {
  if (!active || active.modelId !== modelId)
    throw new Error('El visor de esta prenda todavía no está listo.');
  return active.capture;
}
