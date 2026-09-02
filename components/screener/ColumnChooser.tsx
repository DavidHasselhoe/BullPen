'use client';

import { Fragment } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { SlidersHorizontal, GripVertical, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { getGroupLabels, type ScreenerColumn } from './screener-columns';
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
  const { t } = useTranslation('tools');
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
        className="cursor-grab active:cursor-grabbing text-muted-foreground/80 hover:text-muted-foreground touch-none"
        aria-label={t('screenerReorderColumnAriaLabel', { label: col.label })}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onClick={onToggle}
        className="flex flex-1 items-center justify-between gap-2 text-left"
      >
        <span className={cn('text-xs', hidden ? 'text-muted-foreground/85' : 'text-foreground')}>
          {col.label}
        </span>
        {hidden
          ? <EyeOff className="h-3.5 w-3.5 text-muted-foreground/80 shrink-0" />
          : <Eye className="h-3.5 w-3.5 text-primary shrink-0" />}
      </button>
    </Reorder.Item>
  );
}

export function ColumnChooser({ columns }: Props) {
  const { t } = useTranslation('tools');
  const { orderedColumns, isHidden, toggle, showAll, hideAll, reorder, reset } = columns;
  const visibleCount = orderedColumns.filter((c) => !isHidden(c.key)).length;
  const orderedKeys = orderedColumns.map((c) => c.key);
  const groupLabels = getGroupLabels(t);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {t('screenerColumnsButton')}
          <span className="text-muted-foreground/80">{visibleCount}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <div className="flex items-center justify-between px-1.5 pb-2 mb-1 border-b border-border/60">
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-foreground">{t('screenerColumnsButton')}</span>
            <span className="text-[11px] text-muted-foreground/80">{t('screenerColumnsHint')}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={showAll}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {t('screenerColumnsAll')}
            </button>
            <span className="text-border/60">·</span>
            <button
              type="button"
              onClick={hideAll}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {t('screenerColumnsNone')}
            </button>
            <span className="text-border/60">·</span>
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              {t('screenerColumnsReset')}
            </button>
          </div>
        </div>

        <div className="max-h-[55vh] overflow-y-auto">
          {/* Group labels render as plain <li> siblings (not a wrapping <div>) so
             every Reorder.Item stays a direct child of Reorder.Group's <ul> —
             both for valid list markup and so Framer Motion's drag-reorder
             layout measurement sees real sibling elements, not nested ones. */}
          <Reorder.Group axis="y" values={orderedKeys} onReorder={reorder} className="space-y-0.5">
            {orderedColumns.map((col, i) => {
              const prevGroup = i > 0 ? orderedColumns[i - 1].group : null;
              const showGroupLabel = col.group !== prevGroup;
              return (
                <Fragment key={col.key}>
                  {showGroupLabel && (
                    <li className="px-1.5 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 first:pt-0.5">
                      {groupLabels[col.group]}
                    </li>
                  )}
                  <ColumnItem
                    col={col}
                    hidden={isHidden(col.key)}
                    onToggle={() => toggle(col.key)}
                  />
                </Fragment>
              );
            })}
          </Reorder.Group>
        </div>
      </PopoverContent>
    </Popover>
  );
}
