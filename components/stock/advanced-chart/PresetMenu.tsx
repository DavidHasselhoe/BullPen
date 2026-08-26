'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Bookmark, Plus, Trash2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { ChartPreset } from '@/hooks/use-chart-presets';

interface Props {
  presets: ChartPreset[];
  onApply: (preset: ChartPreset) => void;
  onSave: (name: string) => void;
  onDelete: (id: string) => void;
}

function summarize(p: ChartPreset, t: TFunction): string {
  const parts: string[] = [p.range, p.chartType[0].toUpperCase() + p.chartType.slice(1)];
  if (p.indicators.length) parts.push(t('chartPresetIndicatorCount', { count: p.indicators.length }));
  if (p.showVolume) parts.push(t('chartPresetVolume'));
  if (p.showEvents) parts.push(t('chartPresetEvents'));
  if (p.showTransactions) parts.push(t('chartPresetTrades'));
  return parts.join(' · ');
}

export function PresetMenu({ presets, onApply, onSave, onDelete }: Props) {
  const { t } = useTranslation('stock');
  const [name, setName] = useState('');

  const save = () => {
    const n = name.trim();
    if (!n) return;
    onSave(n);
    setName('');
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Bookmark className="h-3.5 w-3.5" />
          {t('chartPresetsButton')}
          {presets.length > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">
              {presets.length}
            </span>
          )}
        </button>
      </PopoverTrigger>

      {/* z above the z-[100] fullscreen modal — content portals to <body>. */}
      <PopoverContent align="end" className="z-[110] w-72 p-0">
        {/* Save current view */}
        <div className="border-b border-border/60 p-2">
          <p className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
            {t('chartPresetSaveHeading')}
          </p>
          <div className="flex items-center gap-1.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
              placeholder={t('chartPresetNamePlaceholder')}
              maxLength={40}
              aria-label={t('chartPresetNameAriaLabel')}
              className="h-8 flex-1 rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              type="button"
              onClick={save}
              disabled={!name.trim()}
              className="flex h-8 items-center gap-1 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-opacity disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
              {t('chartPresetSaveButton')}
            </button>
          </div>
          <p className="mt-1.5 px-1 text-[11px] leading-relaxed text-muted-foreground/80">
            {t('chartPresetSaveHint')}
          </p>
        </div>

        {/* Saved presets */}
        <div className="max-h-72 overflow-y-auto p-2">
          {presets.length === 0 ? (
            <p className="px-1 py-3 text-center text-xs text-muted-foreground/80">
              {t('chartPresetEmpty')}
            </p>
          ) : (
            <div className="space-y-0.5">
              {presets.map((p) => (
                <div key={p.id} className="group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/60">
                  <button
                    type="button"
                    onClick={() => onApply(p)}
                    className="flex min-w-0 flex-1 flex-col items-start text-left"
                    title={t('chartPresetApplyTitle', { name: p.name })}
                  >
                    <span className="w-full truncate text-xs font-semibold text-foreground">{p.name}</span>
                    <span className="w-full truncate text-[11px] text-muted-foreground">{summarize(p, t)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(p.id)}
                    aria-label={t('chartPresetDeleteAriaLabel', { name: p.name })}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground/80 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
