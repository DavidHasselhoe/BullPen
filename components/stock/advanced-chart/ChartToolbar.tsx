'use client';

import { CandlestickChart, LineChart, AreaChart, BarChart3, CalendarDays, Ruler, BellPlus, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IndicatorMenu } from './IndicatorMenu';
import { PresetMenu } from './PresetMenu';
import type { AdvancedChartType, ChartRange } from '@/hooks/use-chart-prefs';
import type { ChartPreset } from '@/hooks/use-chart-presets';
import type { IndicatorInstance } from '@/lib/finance/indicators';

const RANGES: { value: ChartRange; label: string }[] = [
  { value: '1D', label: '1D' },
  { value: '1W', label: '5D' },
  { value: '1M', label: '1M' },
  { value: '6M', label: '6M' },
  { value: '1Y', label: '1Y' },
  { value: 'YTD', label: 'YTD' },
  { value: '5Y', label: '5Y' },
  { value: 'MAX', label: 'ALL' },
];

const CHART_TYPES: { value: AdvancedChartType; label: string; Icon: typeof LineChart }[] = [
  { value: 'candles', label: 'Candles', Icon: CandlestickChart },
  { value: 'line', label: 'Line', Icon: LineChart },
  { value: 'area', label: 'Area', Icon: AreaChart },
];

interface Props {
  symbol: string;
  price?: number | null;
  changePct?: number | null;
  chartType: AdvancedChartType;
  onChartType: (t: AdvancedChartType) => void;
  range: ChartRange;
  onRange: (r: ChartRange) => void;
  indicators: IndicatorInstance[];
  onAddIndicator: (type: string) => void;
  onRemoveIndicator: (id: string) => void;
  onUpdateIndicator: (id: string, params: Record<string, number>) => void;
  onApplyPreset: (presetId: string) => void;
  onClearIndicators: () => void;
  presets: ChartPreset[];
  onApplyUserPreset: (preset: ChartPreset) => void;
  onSavePreset: (name: string) => void;
  onDeletePreset: (id: string) => void;
  showVolume: boolean;
  onToggleVolume: () => void;
  showEvents: boolean;
  onToggleEvents: () => void;
  tool: 'none' | 'measure' | 'alert';
  onToolChange: (t: 'none' | 'measure' | 'alert') => void;
  aiOpen: boolean;
  onToggleAI: () => void;
  onClose: () => void;
}

export function ChartToolbar({
  symbol, price, changePct, chartType, onChartType, range, onRange,
  indicators, onAddIndicator, onRemoveIndicator, onUpdateIndicator, onApplyPreset, onClearIndicators,
  presets, onApplyUserPreset, onSavePreset, onDeletePreset,
  showVolume, onToggleVolume, showEvents, onToggleEvents, tool, onToolChange, aiOpen, onToggleAI, onClose,
}: Props) {
  const pct = changePct ?? 0;
  const pos = pct >= 0;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border/60 px-4 py-2.5">
      {/* Symbol + price */}
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-bold tracking-tight text-foreground">{symbol}</span>
        {price != null && price > 0 && (
          <>
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {price.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
            </span>
            {changePct != null && (
              <span className={cn('text-xs font-medium tabular-nums', pos ? 'text-emerald-400' : 'text-red-400')}>
                {pos ? '+' : ''}{pct.toFixed(2)}%
              </span>
            )}
          </>
        )}
      </div>

      {/* Chart type */}
      <div className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
        {CHART_TYPES.map(({ value, label, Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => onChartType(value)}
            title={label}
            aria-pressed={chartType === value}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all',
              chartType === value ? 'bg-background text-foreground shadow' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Range — horizontal scroller on mobile so it stays one row */}
      <div className="scrollbar-hide -mx-1 flex max-w-full items-center gap-0.5 overflow-x-auto px-1">
        {RANGES.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => onRange(value)}
            className={cn(
              'shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all',
              range === value ? 'bg-accent text-foreground' : 'text-muted-foreground/60 hover:text-foreground'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Right cluster */}
      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={onToggleAI}
          aria-pressed={aiOpen}
          title="Ask AI about this chart"
          className={cn(
            'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors',
            aiOpen
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-primary/30 bg-primary/5 text-primary hover:bg-primary/10',
          )}
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Ask AI</span>
        </button>
        <PresetMenu
          presets={presets}
          onApply={onApplyUserPreset}
          onSave={onSavePreset}
          onDelete={onDeletePreset}
        />
        <IndicatorMenu
          indicators={indicators}
          onAdd={onAddIndicator}
          onRemove={onRemoveIndicator}
          onUpdate={onUpdateIndicator}
          onApplyPreset={onApplyPreset}
          onClear={onClearIndicators}
        />
        <button
          type="button"
          onClick={() => onToolChange(tool === 'measure' ? 'none' : 'measure')}
          aria-pressed={tool === 'measure'}
          title="Measure tool — drag between two points"
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-md border border-border transition-colors',
            tool === 'measure' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          )}
        >
          <Ruler className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onToolChange(tool === 'alert' ? 'none' : 'alert')}
          aria-pressed={tool === 'alert'}
          title="Set a price alert — click a level on the chart"
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-md border border-border transition-colors',
            tool === 'alert' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          )}
        >
          <BellPlus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onToggleVolume}
          aria-pressed={showVolume}
          title="Toggle volume"
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-md border border-border transition-colors',
            showVolume ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          )}
        >
          <BarChart3 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onToggleEvents}
          aria-pressed={showEvents}
          title="Toggle earnings events"
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-md border border-border transition-colors',
            showEvents ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          )}
        >
          <CalendarDays className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close fullscreen chart"
          title="Close (Esc)"
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
