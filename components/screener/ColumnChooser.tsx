'use client';

import { Reorder, useDragControls } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { SlidersHorizontal, GripVertical, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SCREENER_COLUMNS, getGroupLabels, type ColumnGroup, type ScreenerColumn } from './screener-columns';
import type { UseScreenerColumns } from '@/hooks/use-screener-columns';

interface Props {
  columns: UseScreenerColumns;
}

const GROUP_ORDER: ColumnGroup[] = ['health', 'price', 'volume', 'valuation', 'profitability', 'risk'];
const REGISTRY_INDEX = Object.fromEntries(SCREENER_COLUMNS.map((c, i) => [c.key, i]));

const SECTION_LABEL = 'px-1.5 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground';

function ShownItem({ col, onToggle }: { col: ScreenerColumn; onToggle: () => void }) {
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
        className="cursor-grab active:cursor-grabbing text-muted-foreground touch-none"
        aria-label={t('screenerReorderColumnAriaLabel', { label: col.label })}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onToggle}
        aria-label={t('screenerHideColumnAriaLabel', { label: col.label })}
        className="flex flex-1 items-center justify-between gap-2 text-left"
      >
        <span className="text-xs text-foreground">{col.label}</span>
        <Eye className="h-3.5 w-3.5 text-primary shrink-0" />
      </button>
    </Reorder.Item>
  );
}

/**
 * Two lists rather than one with group headings: a reorderable list can't keep
 * headings honest (a dragged or newly added column landed under the wrong one,
 * which showed PRICE and VALUATION twice). Shown columns are in table order and
 * draggable; hidden ones stay grouped by category so they're easy to find.
 */
export function ColumnChooser({ columns }: Props) {
  const { t } = useTranslation('tools');
  const { orderedColumns, isHidden, toggle, showAll, hideAll, reorder, reset } = columns;
  const shown = orderedColumns.filter((c) => !isHidden(c.key));
  const hidden = orderedColumns.filter((c) => isHidden(c.key));
  const hiddenKeys = hidden.map((c) => c.key);
  const groupLabels = getGroupLabels(t);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {t('screenerColumnsButton')}
          <span className="text-muted-foreground">{shown.length}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <div className="flex items-center justify-between px-1.5 pb-2 mb-1 border-b border-border/60">
          <span className="text-xs font-semibold text-foreground">{t('screenerColumnsButton')}</span>
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
          <p className={SECTION_LABEL + ' pt-0.5'}>{t('screenerColumnsShownHeading', { count: shown.length })}</p>
          {shown.length === 0 ? (
            <p className="px-1.5 py-1.5 text-xs text-muted-foreground">{t('screenerColumnsNoneShown')}</p>
          ) : (
            <Reorder.Group
              axis="y"
              values={shown.map((c) => c.key)}
              onReorder={(keys) => reorder([...keys, ...hiddenKeys])}
              className="space-y-0.5"
            >
              {shown.map((col) => (
                <ShownItem key={col.key} col={col} onToggle={() => toggle(col.key)} />
              ))}
            </Reorder.Group>
          )}

          {GROUP_ORDER.map((group) => {
            const cols = hidden
              .filter((c) => c.group === group)
              .sort((a, b) => REGISTRY_INDEX[a.key] - REGISTRY_INDEX[b.key]);
            if (cols.length === 0) return null;
            return (
              <div key={group}>
                <p className={SECTION_LABEL}>{groupLabels[group]}</p>
                {cols.map((col) => (
                  <button
                    key={col.key}
                    type="button"
                    onClick={() => toggle(col.key)}
                    aria-label={t('screenerShowColumnAriaLabel', { label: col.label })}
                    className="flex w-full items-center justify-between gap-2 rounded-md py-1.5 pl-7 pr-1.5 text-left hover:bg-muted/50"
                  >
                    <span className="text-xs text-muted-foreground">{col.label}</span>
                    <EyeOff className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
