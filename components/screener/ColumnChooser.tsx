'use client';

import { Reorder, useDragControls } from 'framer-motion';
import { SlidersHorizontal, GripVertical, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { ScreenerColumn } from './screener-columns';
import type { UseScreenerColumns } from '@/hooks/use-screener-columns';

interface Props {
  columns: UseScreenerColumns;
}

function ColumnItem({
  col,
  hidden,
  onToggle,
}: {
  col: ScreenerColumn;
  hidden: boolean;
  onToggle: () => void;
}) {
  const controls = useDragControls();

  return (
    <Reorder.Item
      value={col.key}
      dragListener={false}
      dragControls={controls}
      className="flex items-center gap-2 rounded-md px-1.5 py-1.5 bg-popover hover:bg-muted/50 select-none"
    >
      <button
        type="button"
        onPointerDown={(e) => controls.start(e)}
        className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground touch-none"
        aria-label={`Reorder ${col.label}`}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onClick={onToggle}
        className="flex flex-1 items-center justify-between gap-2 text-left"
      >
        <span className={cn('text-xs', hidden ? 'text-muted-foreground/50' : 'text-foreground')}>
          {col.label}
        </span>
        {hidden
          ? <EyeOff className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
          : <Eye className="h-3.5 w-3.5 text-primary shrink-0" />}
      </button>
    </Reorder.Item>
  );
}

export function ColumnChooser({ columns }: Props) {
  const { orderedColumns, isHidden, toggle, showAll, hideAll, reorder, reset } = columns;
  const visibleCount = orderedColumns.filter((c) => !isHidden(c.key)).length;
  const orderedKeys = orderedColumns.map((c) => c.key);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Columns
          <span className="text-muted-foreground/60">{visibleCount}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <div className="flex items-center justify-between px-1.5 pb-2 mb-1 border-b border-border/60">
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-foreground">Columns</span>
            <span className="text-[10px] text-muted-foreground/60">Drag to reorder · click to show/hide</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={showAll}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              All
            </button>
            <span className="text-border/60">·</span>
            <button
              type="button"
              onClick={hideAll}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              None
            </button>
            <span className="text-border/60">·</span>
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
          </div>
        </div>

        <div className="max-h-[55vh] overflow-y-auto">
          <Reorder.Group axis="y" values={orderedKeys} onReorder={reorder} className="space-y-0.5">
            {orderedColumns.map((col) => (
              <ColumnItem
                key={col.key}
                col={col}
                hidden={isHidden(col.key)}
                onToggle={() => toggle(col.key)}
              />
            ))}
          </Reorder.Group>
        </div>
      </PopoverContent>
    </Popover>
  );
}
