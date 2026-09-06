'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { GARMENTS, getGarment } from '@/lib/garments';
import type { ModelId } from '@/lib/garment-types';
import { useEditorStore } from '@/store/editor-store';

export function GarmentPicker() {
  const modelId = useEditorStore((state) => state.document.modelId);
  const changeGarment = useEditorStore((state) => state.changeGarment);
  const busy = useEditorStore(
    (state) =>
      state.exportStatus === 'working' || state.autosaveStatus === 'loading',
  );
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Tipo de prenda</h2>
      </div>
      <Select
        value={modelId}
        disabled={busy}
        onValueChange={(value) => {
          if (value) changeGarment(value as ModelId);
        }}
      >
        <SelectTrigger id="garment-picker" className="h-11 w-full bg-muted">
          <SelectValue>{getGarment(modelId).label}</SelectValue>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          {GARMENTS.map((garment) => (
            <SelectItem key={garment.id} value={garment.id}>
              {garment.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Tu diseño se adapta al cambiar de prenda.
      </p>
    </section>
  );
}
