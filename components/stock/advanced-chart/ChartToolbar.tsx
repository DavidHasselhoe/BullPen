'use client';

import { CandlestickChart, LineChart, AreaChart, BarChart3, CalendarDays, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IndicatorMenu } from './IndicatorMenu';
import type { AdvancedChartType, ChartRange } from '@/hooks/use-chart-prefs';
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
  showVolume: boolean;
  onToggleVolume: () => void;
  showEvents: boolean;
  onToggleEvents: () => void;
  onClose: () => void;
}

export function ChartToolbar({
  symbol, price, changePct, chartType, onChartType, range, onRange,
  indicators, onAddIndicator, onRemoveIndicator, onUpdateIndicator,
  showVolume, onToggleVolume, showEvents, onToggleEvents, onClose,
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

      {/* Range */}
      <div className="flex items-center gap-0.5">
        {RANGES.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => onRange(value)}
            className={cn(
              'rounded-md px-2 py-1 text-xs font-medium transition-all',
              range === value ? 'bg-accent text-foreground' : 'text-muted-foreground/60 hover:text-foreground'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Right cluster */}
      <div className="ml-auto flex items-center gap-1.5">
        <IndicatorMenu
          indicators={indicators}
          onAdd={onAddIndicator}
          onRemove={onRemoveIndicator}
          onUpdate={onUpdateIndicator}
        />
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
