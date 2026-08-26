'use client';

import { useTranslation } from 'react-i18next';
import { Plus, X, LineChart as LineChartIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  INDICATORS,
  INDICATOR_PRESETS,
  getIndicatorDef,
  indicatorLabel,
  type IndicatorInstance,
} from '@/lib/finance/indicators';

interface Props {
  indicators: IndicatorInstance[];
  onAdd: (type: string) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, params: Record<string, number>) => void;
  onApplyPreset: (presetId: string) => void;
  onClear: () => void;
}

const OVERLAYS = INDICATORS.filter((d) => d.group === 'overlay');
const OSCILLATORS = INDICATORS.filter((d) => d.group === 'oscillator');

function clampParam(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function IndicatorMenu({ indicators, onAdd, onRemove, onUpdate, onApplyPreset, onClear }: Props) {
  const { t } = useTranslation('stock');
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-tour="add-indicator-button"
          className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <LineChartIcon className="h-3.5 w-3.5" />
          {t('indicatorsButton')}
          {indicators.length > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">
              {indicators.length}
            </span>
          )}
        </button>
      </PopoverTrigger>

      {/* z above both the z-[100] fullscreen modal and the z-[120] Academy chart-tour overlay — content portals to <body>. */}
      <PopoverContent align="end" className="z-[130] w-80 p-0">
        {/* Presets */}
        <div className="border-b border-border/60 p-2">
          <p className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
            {t('indicatorPresetsLabel')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {INDICATOR_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onApplyPreset(preset.id)}
                title={preset.description}
                className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Active indicators */}
        {indicators.length > 0 && (
          <div className="border-b border-border/60 p-2">
            <div className="flex items-center justify-between px-1 pb-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">{t('indicatorActiveLabel')}</p>
              <button
                type="button"
                onClick={onClear}
                className="text-[11px] font-medium text-muted-foreground/85 transition-colors hover:text-red-400"
              >
                {t('indicatorClearAll')}
              </button>
            </div>
            <div className="space-y-1.5">
              {indicators.map((inst) => {
                const def = getIndicatorDef(inst.type);
                if (!def) return null;
                const color = inst.color ?? def.lines.find((l) => l.primary)?.color ?? def.lines[0]?.color;
                return (
                  <div key={inst.id} className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                    <span className="w-12 shrink-0 truncate text-xs font-medium text-foreground">{def.label}</span>
                    <div className="flex flex-1 items-center gap-1">
                      {def.params.map((spec) => (
                        <input
                          key={spec.key}
                          type="number"
                          aria-label={t('indicatorParamAriaLabel', { indicator: indicatorLabel(inst), param: spec.label })}
                          title={spec.label}
                          value={inst.params[spec.key]}
                          min={spec.min}
                          max={spec.max}
                          step={spec.step ?? 1}
                          onChange={(e) =>
                            onUpdate(inst.id, {
                              ...inst.params,
                              [spec.key]: clampParam(parseFloat(e.target.value), spec.min, spec.max),
                            })
                          }
                          className="h-7 w-14 rounded border border-input bg-background px-1.5 text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemove(inst.id)}
                      aria-label={t('indicatorRemoveAriaLabel', { indicator: def.label })}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground/80 transition-colors hover:bg-red-500/10 hover:text-red-400"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Add catalog */}
        <div className="max-h-72 overflow-y-auto p-2">
          <AddGroup title={t('indicatorOverlaysGroup')} defs={OVERLAYS} onAdd={onAdd} />
          <AddGroup title={t('indicatorOscillatorsGroup')} defs={OSCILLATORS} onAdd={onAdd} className="mt-2" />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AddGroup({
  title, defs, onAdd, className,
}: {
  title: string;
  defs: typeof INDICATORS;
  onAdd: (type: string) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
        {title}
      </p>
      <div className="space-y-0.5">
        {defs.map((def) => (
          <button
            key={def.type}
            type="button"
            onClick={() => onAdd(def.type)}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/60'
            )}
          >
            <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" />
            <span className="w-12 shrink-0 text-xs font-semibold text-foreground">{def.label}</span>
            <span className="flex-1 truncate text-xs text-muted-foreground">{def.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
