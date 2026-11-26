'use client';

import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { RotateCcw, HelpCircle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useAIPanel } from '@/components/ai/AIPanelProvider';
import { BullAiIcon } from '@/components/ai/BullAiIcon';
import { SavedScreens } from '@/components/screener/SavedScreens';
import type { SavedScreenScope } from '@/lib/screener/saved-screen-limits';

export interface ScreenerFilterValues {
  sector: string;
  industry: string;
  healthScoreMin: string;
  healthScoreMax: string;
  marketCapMin: string;
  marketCapMax: string;
  peMin: string;
  peMax: string;
  pbMin: string;
  pbMax: string;
  betaMin: string;
  betaMax: string;
  divYieldMin: string;
  divYieldMax: string;
  profitMarginMin: string;
  profitMarginMax: string;
  revenueGrowthMin: string;
  revenueGrowthMax: string;
  week52ChangeMin: string;
  week52ChangeMax: string;
}

export const EMPTY_FILTERS: ScreenerFilterValues = {
  sector: '',
  industry: '',
  healthScoreMin: '',
  healthScoreMax: '',
  marketCapMin: '',
  marketCapMax: '',
  peMin: '',
  peMax: '',
  pbMin: '',
  pbMax: '',
  betaMin: '',
  betaMax: '',
  divYieldMin: '',
  divYieldMax: '',
  profitMarginMin: '',
  profitMarginMax: '',
  revenueGrowthMin: '',
  revenueGrowthMax: '',
  week52ChangeMin: '',
  week52ChangeMax: '',
};

export interface PresetView {
  /** Shown and moved next to % Chg, so the preset's criteria are on screen. */
  columns: string[];
  /** Omitted for a saved preset: it keeps whatever sort the table has. */
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
}

interface Preset extends PresetView {
  label: string;
  filters: Partial<ScreenerFilterValues>;
  /** One line under the chips while the preset is picked: what it finds and the catch. */
  note?: string;
}

function getPresets(t: TFunction): Preset[] {
  return [
    { label: t('screenerPresetAll'),        filters: {},                                                columns: [], sortKey: 'market_cap', sortDir: 'desc' },
    { label: t('screenerPresetHighHealth'), filters: { healthScoreMin: '70' },                          columns: [], sortKey: 'health_score', sortDir: 'desc', note: t('screenerPresetNoteHighHealth') },
    { label: t('screenerPresetDeepValue'),  filters: { peMax: '15', pbMax: '2' },                       columns: ['pe_ratio', 'pb_ratio'], sortKey: 'pe_ratio', sortDir: 'asc', note: t('screenerPresetNoteDeepValue') },
    { label: t('screenerPresetGrowth'),     filters: { revenueGrowthMin: '15' },                        columns: ['revenue_growth_yoy', 'earnings_growth_yoy'], sortKey: 'revenue_growth_yoy', sortDir: 'desc', note: t('screenerPresetNoteGrowth') },
    { label: t('screenerPresetDividend'),   filters: { divYieldMin: '2.5' },                            columns: ['dividend_yield', 'annual_dividend', 'payout_ratio'], sortKey: 'dividend_yield', sortDir: 'desc', note: t('screenerPresetNoteDividend') },
    { label: t('screenerPresetQuality'),    filters: { profitMarginMin: '15', revenueGrowthMin: '10' }, columns: ['profit_margin', 'revenue_growth_yoy'], sortKey: 'profit_margin', sortDir: 'desc', note: t('screenerPresetNoteQuality') },
    { label: t('screenerPresetLargeCap'),   filters: { marketCapMin: '100' },                           columns: ['market_cap'], sortKey: 'market_cap', sortDir: 'desc', note: t('screenerPresetNoteLargeCap') },
  ];
}

type RangeId = 'health' | 'marketCap' | 'pe' | 'pb' | 'profitMargin' | 'revenueGrowth' | 'beta' | 'divYield' | 'week52';

interface RangeDef {
  label: string;
  unit?: '$B' | '%';
  /** Short "what's a good range" anchor — beginners learn while filtering, power users ignore it. */
  hint: string;
  minKey: keyof ScreenerFilterValues;
  maxKey: keyof ScreenerFilterValues;
  step: string;
  /** Plain one-click bands. Picking one fills Min/Max, so the numbers stay on screen. A label-less band shows its own value ("2%+"). */
  choices?: { label?: string; min?: string; max?: string }[];
}

/** One source for the sidebar inputs, the active-filter chips and the zero-result "remove X" button. */
function getRanges(t: TFunction): Record<RangeId, RangeDef> {
  return {
    // Bands match the Health Score's own labels (lib/finance/health-score.ts).
    health: { label: t('screenerHealthScoreLabel'), hint: t('screenerHealthScoreHint'), minKey: 'healthScoreMin', maxKey: 'healthScoreMax', step: '5',
      choices: [
        { label: t('screenerChoiceHealthStrong'), min: '85' },
        { label: t('screenerChoiceHealthGood'), min: '70', max: '84' },
        { label: t('screenerChoiceHealthFair'), min: '55', max: '69' },
        { label: t('screenerChoiceHealthWeak'), max: '54' },
      ] },
    marketCap: { label: t('screenerMarketCapLabel'), unit: '$B', hint: t('screenerMarketCapHint'), minKey: 'marketCapMin', maxKey: 'marketCapMax', step: '10',
      choices: [
        { label: t('screenerChoiceCapMega'), min: '200' },
        { label: t('screenerChoiceCapLarge'), min: '10', max: '200' },
        { label: t('screenerChoiceCapMid'), min: '2', max: '10' },
        { label: t('screenerChoiceCapSmall'), max: '2' },
      ] },
    pe: { label: t('screenerPeRatioLabel'), hint: t('screenerPeRatioHint'), minKey: 'peMin', maxKey: 'peMax', step: '1',
      choices: [
        { label: t('screenerChoiceCheap'), max: '15' },
        { label: t('screenerChoiceAverage'), min: '15', max: '25' },
        { label: t('screenerChoicePricey'), min: '25' },
      ] },
    pb: { label: t('screenerPbRatioLabel'), hint: t('screenerPbRatioHint'), minKey: 'pbMin', maxKey: 'pbMax', step: '0.1' },
    profitMargin: { label: t('screenerProfitMarginLabel'), unit: '%', hint: t('screenerProfitMarginHint'), minKey: 'profitMarginMin', maxKey: 'profitMarginMax', step: '1',
      choices: [{ label: t('screenerChoiceProfitable'), min: '0.01' }, { min: '15' }] },
    revenueGrowth: { label: t('screenerRevenueGrowthLabel'), unit: '%', hint: t('screenerRevenueGrowthHint'), minKey: 'revenueGrowthMin', maxKey: 'revenueGrowthMax', step: '1',
      choices: [{ label: t('screenerChoiceGrowing'), min: '0.01' }, { min: '15' }] },
    beta: { label: t('screenerBetaLabel'), hint: t('screenerBetaHint'), minKey: 'betaMin', maxKey: 'betaMax', step: '0.1',
      choices: [
        { label: t('screenerChoiceSteady'), max: '0.8' },
        { label: t('screenerChoiceAverage'), min: '0.8', max: '1.2' },
        { label: t('screenerChoiceVolatile'), min: '1.2' },
      ] },
    divYield: { label: t('screenerDividendYieldLabel'), unit: '%', hint: t('screenerDividendYieldHint'), minKey: 'divYieldMin', maxKey: 'divYieldMax', step: '0.1',
      choices: [{ label: t('screenerChoicePaysDividend'), min: '0.01' }, { min: '2' }, { min: '4' }] },
    week52: { label: t('screener52wSpreadLabel'), unit: '%', hint: t('screener52wSpreadHint'), minKey: 'week52ChangeMin', maxKey: 'week52ChangeMax', step: '5' },
  };
}

function fmtValue(v: string, unit?: RangeDef['unit']): string {
  return unit === '$B' ? `$${v}B` : unit === '%' ? `${v}%` : v;
}

/** "Health 70+", "P/E up to 15", "Market cap $10B to $200B". */
function rangeLabel(t: TFunction, def: RangeDef, min: string, max: string): string {
  if (min && max) return t('screenerChipRange', { label: def.label, min: fmtValue(min, def.unit), max: fmtValue(max, def.unit) });
  if (min) return t('screenerChipMin', { label: def.label, value: fmtValue(min, def.unit) });
  return t('screenerChipMax', { label: def.label, value: fmtValue(max, def.unit) });
}

export interface ActiveFilter {
  /** The filter keys this chip stands for; clearing them removes it. */
  keys: (keyof ScreenerFilterValues)[];
  label: string;
}

/** Every filter that is on, one entry per sidebar control, in sidebar order. */
export function describeActiveFilters(t: TFunction, filters: ScreenerFilterValues): ActiveFilter[] {
  const out: ActiveFilter[] = [];
  if (filters.sector) out.push({ keys: ['sector', 'industry'], label: filters.sector });
  if (filters.industry) out.push({ keys: ['industry'], label: filters.industry });
  for (const def of Object.values(getRanges(t))) {
    const min = filters[def.minKey];
    const max = filters[def.maxKey];
    if (min || max) out.push({ keys: [def.minKey, def.maxKey], label: rangeLabel(t, def, min, max) });
  }
  return out;
}

function activePreset(filters: ScreenerFilterValues, presets: Preset[]): string {
  const hasAny = Object.values(filters).some(Boolean);
  if (!hasAny) return presets[0].label;
  for (const p of presets.slice(1)) {
    const keys = Object.keys(p.filters) as (keyof ScreenerFilterValues)[];
    const userKeys = Object.keys(filters).filter(k => (filters as Record<string,string>)[k]) as (keyof ScreenerFilterValues)[];
    if (
      keys.length === userKeys.length &&
      keys.every(k => p.filters[k] === filters[k])
    ) return p.label;
  }
  return '';
}

interface ScreenerFiltersProps {
  filters: ScreenerFilterValues;
  sectors: string[];
  industries: string[];
  onChange: (filters: ScreenerFilterValues) => void;
  onReset: () => void;
  /** A built-in preset was clicked: bring its columns into view and sort by its metric. */
  onPresetApply?: (view: PresetView) => void;
  /** The universe a screen saved now will be alerted on (the active view). */
  saveScope?: SavedScreenScope;
}

function RangeFilter({
  def: { label, unit, hint, minKey, maxKey, step, choices },
  filters,
  onChange,
}: {
  def: RangeDef;
  filters: ScreenerFilterValues;
  onChange: (f: ScreenerFilterValues) => void;
}) {
  const { t } = useTranslation('tools');
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        {label}{unit ? <span className="ml-0.5 opacity-60">({unit})</span> : null}
        {hint && (
          <span title={hint} className="inline-flex shrink-0">
            <HelpCircle className="h-3 w-3 opacity-60" />
          </span>
        )}
      </Label>
      {choices && (
        <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
          {choices.map((c) => {
            const min = c.min ?? '';
            const max = c.max ?? '';
            const on = filters[minKey] === min && filters[maxKey] === max;
            const text = c.label ?? `${fmtValue(min, unit)}+`;
            return (
              <button
                key={text}
                type="button"
                aria-pressed={on}
                // Picking the band that's on clears it, like a toggle.
                onClick={() => onChange({ ...filters, [minKey]: on ? '' : min, [maxKey]: on ? '' : max })}
                className={cn(
                  'min-h-8 grow md:min-h-7 rounded-md border px-1.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  on
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground',
                )}
              >
                {text}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          type="number"
          placeholder={t('screenerMinPlaceholder')}
          aria-label={`${label} ${t('screenerMinPlaceholder')}`}
          value={filters[minKey]}
          onChange={(e) => onChange({ ...filters, [minKey]: e.target.value })}
          className="h-8 text-xs"
          step={step}
        />
        <Input
          type="number"
          placeholder={t('screenerMaxPlaceholder')}
          aria-label={`${label} ${t('screenerMaxPlaceholder')}`}
          value={filters[maxKey]}
          onChange={(e) => onChange({ ...filters, [maxKey]: e.target.value })}
          className="h-8 text-xs"
          step={step}
        />
      </div>
    </div>
  );
}

export function ScreenerFilters({ filters, sectors, industries, onChange, onReset, onPresetApply, saveScope = 'sp500' }: ScreenerFiltersProps) {
  const { t } = useTranslation('tools');
  const { isAuthenticated } = useAuth();
  const { open: openBull } = useAIPanel();
  const presets = getPresets(t);
  const hasFilters = Object.values(filters).some((v) => v !== '');
  const current = activePreset(filters, presets);
  const currentNote = presets.find((p) => p.label === current)?.note;
  const ranges = getRanges(t);

  const applyPreset = (preset: Preset) => {
    onChange({ ...EMPTY_FILTERS, ...preset.filters });
    onPresetApply?.(preset);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t('screenerFiltersLabel')}</h3>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={onReset} className="h-7 text-xs gap-1.5">
            <RotateCcw className="h-3 w-3" />
            {t('screenerColumnsReset')}
          </Button>
        )}
      </div>

      {/* Bull already turns plain English into these filters (openScreener),
          and they land as chips above the results. This only opens the chat
          with an example placeholder, where people filter. */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => openBull({ hint: t('screenerDescribePlaceholder') })}
        className="h-auto min-h-9 w-full justify-start gap-2 whitespace-normal py-1.5 text-left text-xs"
      >
        <BullAiIcon pose="wave" size={22} />
        {t('screenerDescribeButton')}
      </Button>

      {/* Presets */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-foreground">{t('screenerPresetsHeading')}</p>
        <div className="flex flex-wrap gap-1">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              aria-pressed={current === p.label}
              onClick={() => applyPreset(p)}
              className={[
                'rounded-full px-2.5 py-0.5 text-[11px] font-medium border transition-colors',
                current === p.label
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-transparent text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground',
              ].join(' ')}
            >
              {p.label}
            </button>
          ))}
        </div>
        {currentNote && <p className="text-xs leading-relaxed text-muted-foreground">{currentNote}</p>}
      </div>

      {/* Saved screens: named filter sets, orthogonal to screener views
          (which pick tickers, not criteria). Signed-in only. */}
      {isAuthenticated && (
        <SavedScreens
          filters={filters}
          saveScope={saveScope}
          onOpen={(preset) => {
            onChange({ ...EMPTY_FILTERS, ...preset.filters });
            onPresetApply?.({ columns: [] });
          }}
        />
      )}

      {/* Sector & Industry */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">{t('screenerSectorLabel')}</Label>
          <Select
            value={filters.sector || 'all'}
            onValueChange={(v) => onChange({ ...filters, sector: v === 'all' ? '' : v, industry: '' })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder={t('screenerAnySector')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('screenerAnySector')}</SelectItem>
              {sectors.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {industries.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">{t('screenerIndustryLabel')}</Label>
            {/* 125 industries with no sector picked, so it searches. */}
            <SearchableSelect
              size="sm"
              className="text-xs"
              value={filters.industry || 'all'}
              onValueChange={(v) => onChange({ ...filters, industry: v === 'all' ? '' : v })}
              pinned={[{ value: 'all', label: t('screenerAnyIndustry') }]}
              options={industries.map((ind) => ({ value: ind, label: ind }))}
              searchPlaceholder={t('screenerIndustrySearch')}
            />
          </div>
        )}
      </div>

      {/* Health Score */}
      <RangeFilter def={ranges.health} filters={filters} onChange={onChange} />

      {/* Valuation */}
      <div className="space-y-0.5">
        <p className="text-xs font-semibold text-foreground pb-1">{t('screenerValuationHeading')}</p>
        <RangeFilter def={ranges.marketCap} filters={filters} onChange={onChange} />
        <div className="pt-3">
          <RangeFilter def={ranges.pe} filters={filters} onChange={onChange} />
        </div>
        <div className="pt-3">
          <RangeFilter def={ranges.pb} filters={filters} onChange={onChange} />
        </div>
      </div>

      {/* Profitability */}
      <div className="space-y-0.5">
        <p className="text-xs font-semibold text-foreground pb-1">{t('screenerProfitabilityHeading')}</p>
        <RangeFilter def={ranges.profitMargin} filters={filters} onChange={onChange} />
        <div className="pt-3">
          <RangeFilter def={ranges.revenueGrowth} filters={filters} onChange={onChange} />
        </div>
      </div>

      {/* Risk & Income */}
      <div className="space-y-0.5">
        <p className="text-xs font-semibold text-foreground pb-1">{t('screenerRiskIncomeHeading')}</p>
        <RangeFilter def={ranges.beta} filters={filters} onChange={onChange} />
        <div className="pt-3">
          <RangeFilter def={ranges.divYield} filters={filters} onChange={onChange} />
        </div>
      </div>

      {/* 52-Week Range */}
      <div className="space-y-0.5">
        <p className="text-xs font-semibold text-foreground pb-1">{t('screenerPriceRangeHeading')}</p>
        <RangeFilter def={ranges.week52} filters={filters} onChange={onChange} />
      </div>
    </div>
  );
}
