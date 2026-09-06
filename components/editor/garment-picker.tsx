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
    <div className="flex items-center gap-2">
      <label
        htmlFor="garment-picker"
        className="text-xs font-medium text-muted-foreground"
      >
        Prenda
      </label>
      <Select
        value={modelId}
        disabled={busy}
        onValueChange={(value) => {
          if (value) changeGarment(value as ModelId);
        }}
      >
        <SelectTrigger id="garment-picker" className="h-9 w-36 bg-card">
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
      <span className="hidden text-xs text-muted-foreground sm:inline">
        Tu diseño se adapta al cambiar de prenda
      </span>
    </div>
  );
}
