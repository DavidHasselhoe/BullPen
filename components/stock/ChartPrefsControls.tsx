'use client';

import { RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { UseChartPrefs, ChartPrefs, ChartRange, ChartIndicator } from '@/hooks/use-chart-prefs';

export const RANGE_OPTIONS: { value: ChartRange; label: string }[] = [
  { value: '1D', label: '1D' },
  { value: '1W', label: '5D' },
  { value: '1M', label: '1M' },
  { value: '6M', label: '6M' },
  { value: '1Y', label: '1Y' },
  { value: 'YTD', label: 'YTD' },
  { value: '5Y', label: '5Y' },
  { value: 'MAX', label: 'ALL' },
];

export const INDICATOR_OPTIONS: { value: ChartIndicator; label: string }[] = [
  { value: 'sma50',  label: 'SMA 50'  },
  { value: 'sma200', label: 'SMA 200' },
  { value: 'ema20',  label: 'EMA 20'  },
  { value: 'bbands', label: 'BB'      },
  { value: 'rsi',    label: 'RSI'     },
  { value: 'macd',   label: 'MACD'    },
];

interface Props extends UseChartPrefs {
  /** Optional live-chart hooks — supplied on the stock page, omitted in Settings. */
  onRangeChange?: (r: ChartRange) => void;
  onIndicatorsChange?: (inds: ChartIndicator[]) => void;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground/85 mb-2">
      {children}
    </p>
  );
}

function ToggleRow({
  label, description, checked, onToggle,
}: { label: string; description?: string; checked: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground leading-none">{label}</p>
        {description && (
          <p className="text-[11px] text-muted-foreground/80 leading-snug mt-0.5">{description}</p>
        )}
      </div>
      <Switch checked={checked} onCheckedChange={onToggle} className="shrink-0" />
    </div>
  );
}

function RadioRow<T extends string>({
  label, options, value, onChange,
}: { label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="mt-3">
      <p className="text-xs font-medium text-foreground mb-1.5">{label}</p>
      <div className="flex gap-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex-1 rounded-md py-1.5 text-[11px] font-medium transition-all border',
              value === opt.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-transparent text-muted-foreground border-border hover:text-foreground'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Presentational chart-preferences panel. Shared by the stock-page popover
 * (`ChartSettingsPanel`) and the Settings → Charts section so both edit the
 * same `useChartPrefs` source and stay perfectly in sync.
 */
export function ChartPrefsControls({
  prefs, setPref, reset, onRangeChange, onIndicatorsChange,
}: Props) {
  const { t } = useTranslation('stock');
  const toggleIndicator = (ind: ChartIndicator) => {
    const next = prefs.defaultIndicators.includes(ind)
      ? prefs.defaultIndicators.filter((i) => i !== ind)
      : [...prefs.defaultIndicators, ind];
    setPref('defaultIndicators', next);
    onIndicatorsChange?.(next);
  };

  const setDefaultRange = (r: ChartRange) => {
    setPref('defaultRange', r);
    onRangeChange?.(r);
  };

  const setPrefTyped = <K extends keyof ChartPrefs>(key: K, val: ChartPrefs[K]) => {
    setPref(key, val);
  };

  return (
    <div className="space-y-5">
      {/* ── Defaults ─────────────────────────────────────────────────── */}
      <div>
        <SectionLabel>{t('chartPrefsDefaultsSection')}</SectionLabel>

        <div className="space-y-3">
          <div>
            <p className="text-xs font-medium text-foreground mb-1.5">{t('chartPrefsDefaultTimeframe')}</p>
            <div className="flex flex-wrap gap-1">
              {RANGE_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDefaultRange(value)}
                  className={cn(
                    'rounded-md px-2 py-0.5 text-[11px] font-medium transition-all border',
                    prefs.defaultRange === value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-transparent text-muted-foreground border-border hover:text-foreground'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-foreground mb-1.5">{t('chartPrefsDefaultIndicators')}</p>
            <div className="flex flex-wrap gap-1">
              {INDICATOR_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggleIndicator(value)}
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[11px] font-medium transition-all border',
                    prefs.defaultIndicators.includes(value)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-transparent text-muted-foreground border-border hover:text-foreground'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Overlays ─────────────────────────────────────────────────── */}
      <div className="border-t border-border/30 pt-4">
        <SectionLabel>{t('chartPrefsOverlaysSection')}</SectionLabel>
        <div className="divide-y divide-border/20">
          <ToggleRow
            label={t('chartPrefsEarningsEventsLabel')}
            description={t('chartPrefsEarningsEventsDescription')}
            checked={prefs.showEarnings}
            onToggle={() => setPref('showEarnings', !prefs.showEarnings)}
          />
          <ToggleRow
            label={t('chartPrefsYourTradesLabel')}
            description={t('chartPrefsYourTradesDescription')}
            checked={prefs.showTransactions}
            onToggle={() => setPref('showTransactions', !prefs.showTransactions)}
          />
          <ToggleRow
            label={t('chartPrefsPeriodOpenLineLabel')}
            description={t('chartPrefsPeriodOpenLineDescription')}
            checked={prefs.showPrevClose}
            onToggle={() => setPref('showPrevClose', !prefs.showPrevClose)}
          />
        </div>
      </div>

      {/* ── Display ──────────────────────────────────────────────────── */}
      <div className="border-t border-border/30 pt-4">
        <SectionLabel>{t('chartPrefsDisplaySection')}</SectionLabel>
        <div className="divide-y divide-border/20">
          <ToggleRow
            label={t('chartPrefsVolumeBarsLabel')}
            description={t('chartPrefsVolumeBarsDescription')}
            checked={prefs.showVolume}
            onToggle={() => setPref('showVolume', !prefs.showVolume)}
          />
          <ToggleRow
            label={t('chartPrefsExtendedHoursLabel')}
            description={t('chartPrefsExtendedHoursDescription')}
            checked={prefs.showExtendedHours}
            onToggle={() => setPref('showExtendedHours', !prefs.showExtendedHours)}
          />
        </div>

        <RadioRow
          label={t('chartPrefsChartStyleLabel')}
          options={[
            { value: 'area', label: t('chartPrefsChartStyleArea') },
            { value: 'line', label: t('chartPrefsChartStyleLine') },
          ]}
          value={prefs.chartStyle}
          onChange={(v) => setPrefTyped('chartStyle', v)}
        />
      </div>

      {/* ── Reset ────────────────────────────────────────────────────── */}
      <div className="border-t border-border/30 pt-3">
        <button
          type="button"
          onClick={reset}
          className="flex items-center gap-1.5 text-xs text-muted-foreground/80 hover:text-foreground transition-colors"
        >
          <RotateCcw className="h-3 w-3" />
          {t('chartPrefsResetToDefaults')}
        </button>
      </div>
    </div>
  );
}
