'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useEditorStore } from '@/store/editor-store';

export const EditorViewContext = createContext<{
  view: '2d' | '3d';
  toggleView: () => void;
} | null>(null);

export function StageToolbar({ children }: { children?: ReactNode }) {
  const editor = useContext(EditorViewContext);
  const exporting = useEditorStore((state) => state.exportStatus === 'working');
  const nextView = editor?.view === '2d' ? '3D' : '2D';
  return (
    <div
      className="absolute right-2 top-2 z-10 flex flex-col gap-1 rounded-xl border bg-card/90 p-1 shadow-lg backdrop-blur-md md:right-5 md:top-1/2 md:-translate-y-1/2"
      aria-label="Controles de la vista"
    >
      {editor && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-lg"
                className="text-xs font-bold"
                aria-label={`Cambiar a vista ${nextView}`}
                disabled={exporting}
                onClick={editor.toggleView}
              />
            }
          >
            {nextView}
          </TooltipTrigger>
          <TooltipContent side="left">
            Cambiar a vista {nextView}
          </TooltipContent>
        </Tooltip>
      )}
      {children}
    </div>
  );
}
