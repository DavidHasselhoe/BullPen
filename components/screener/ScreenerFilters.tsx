'use client';

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
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
import { RotateCcw, HelpCircle, Plus, X, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import {
  useScreenerFilterPresets,
  useCreateScreenerFilterPreset,
  useDeleteScreenerFilterPreset,
} from '@/hooks/use-screener-filter-presets';

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
  sortKey: string;
  sortDir: 'asc' | 'desc';
}

interface Preset extends PresetView {
  label: string;
  filters: Partial<ScreenerFilterValues>;
}

function getPresets(t: TFunction): Preset[] {
  return [
    { label: t('screenerPresetAll'),        filters: {},                                                columns: [], sortKey: 'market_cap', sortDir: 'desc' },
    { label: t('screenerPresetHighHealth'), filters: { healthScoreMin: '70' },                          columns: [], sortKey: 'health_score', sortDir: 'desc' },
    { label: t('screenerPresetDeepValue'),  filters: { peMax: '15', pbMax: '2' },                       columns: ['pe_ratio', 'pb_ratio'], sortKey: 'pe_ratio', sortDir: 'asc' },
    { label: t('screenerPresetGrowth'),     filters: { revenueGrowthMin: '15' },                        columns: ['revenue_growth_yoy', 'earnings_growth_yoy'], sortKey: 'revenue_growth_yoy', sortDir: 'desc' },
    { label: t('screenerPresetDividend'),   filters: { divYieldMin: '2.5' },                            columns: ['dividend_yield', 'annual_dividend', 'payout_ratio'], sortKey: 'dividend_yield', sortDir: 'desc' },
    { label: t('screenerPresetQuality'),    filters: { profitMarginMin: '15', revenueGrowthMin: '10' }, columns: ['profit_margin', 'revenue_growth_yoy'], sortKey: 'profit_margin', sortDir: 'desc' },
    { label: t('screenerPresetLargeCap'),   filters: { marketCapMin: '100' },                           columns: ['market_cap'], sortKey: 'market_cap', sortDir: 'desc' },
  ];
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

/** Inline "+ Save current filters" affordance — toggles to a name input on
 *  click rather than a full dialog, matching ScreenerViewBar's RenamePill
 *  pattern for the same kind of lightweight, one-field save. */
function SaveFilterPresetControl({ filters }: { filters: ScreenerFilterValues }) {
  const { t } = useTranslation('tools');
  const [naming, setNaming] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const createPreset = useCreateScreenerFilterPreset();

  const save = async () => {
    const name = (inputRef.current?.value ?? '').trim();
    setNaming(false);
    if (!name) return;
    const activeFilters = Object.fromEntries(
      Object.entries(filters).filter(([, v]) => v !== '')
    ) as Partial<ScreenerFilterValues>;
    await createPreset.mutateAsync({ name, filters: activeFilters }).catch(() => {});
  };

  if (naming) {
    return (
      <input
        ref={inputRef}
        autoFocus
        defaultValue=""
        placeholder={t('screenerFilterPresetNamePlaceholder')}
        maxLength={60}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.currentTarget.blur(); }
          if (e.key === 'Escape') { setNaming(false); }
        }}
        className="h-[22px] w-32 rounded-full border border-primary bg-transparent px-2.5 text-[11px] font-medium text-foreground outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setNaming(true)}
      disabled={createPreset.isPending}
      className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-border px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
    >
      {createPreset.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
      {t('screenerSaveFilterPreset')}
    </button>
  );
}

interface ScreenerFiltersProps {
  filters: ScreenerFilterValues;
  sectors: string[];
  industries: string[];
  onChange: (filters: ScreenerFilterValues) => void;
  onReset: () => void;
  /** A built-in preset was clicked: bring its columns into view and sort by its metric. */
  onPresetApply?: (view: PresetView) => void;
}

function RangeFilter({
  label,
  unit,
  hint,
  minKey,
  maxKey,
  filters,
  onChange,
  step,
}: {
  label: string;
  unit?: string;
  /** Short "what's a good range" anchor shown on hover — beginners learn while filtering, power users ignore it. */
  hint?: string;
  minKey: keyof ScreenerFilterValues;
  maxKey: keyof ScreenerFilterValues;
  filters: ScreenerFilterValues;
  onChange: (f: ScreenerFilterValues) => void;
  step?: string;
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
      <div className="flex gap-2">
        <Input
          type="number"
          placeholder={t('screenerMinPlaceholder')}
          value={filters[minKey]}
          onChange={(e) => onChange({ ...filters, [minKey]: e.target.value })}
          className="h-8 text-xs"
          step={step}
        />
        <Input
          type="number"
          placeholder={t('screenerMaxPlaceholder')}
          value={filters[maxKey]}
          onChange={(e) => onChange({ ...filters, [maxKey]: e.target.value })}
          className="h-8 text-xs"
          step={step}
        />
      </div>
    </div>
  );
}

export function ScreenerFilters({ filters, sectors, industries, onChange, onReset, onPresetApply }: ScreenerFiltersProps) {
  const { t } = useTranslation('tools');
  const { isAuthenticated } = useAuth();
  const presets = getPresets(t);
  const hasFilters = Object.values(filters).some((v) => v !== '');
  const current = activePreset(filters, presets);
  const { data: myPresets } = useScreenerFilterPresets();
  const deletePreset = useDeleteScreenerFilterPreset();

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

      {/* Presets */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-foreground">{t('screenerPresetsHeading')}</p>
        <div className="flex flex-wrap gap-1">
          {presets.map((p) => (
            <button
              key={p.label}
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
      </div>

      {/* My presets — saved custom filter combinations, orthogonal to screener
         views (which select tickers, not criteria). Signed-in only. */}
      {/* Hidden until there is a preset to show or a filter to save: an empty
          heading on its own read as a broken section. */}
      {isAuthenticated && ((myPresets?.length ?? 0) > 0 || hasFilters) && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-foreground">{t('screenerMyPresetsHeading')}</p>
          <div className="flex flex-wrap items-center gap-1">
            {(myPresets ?? []).map((preset) => (
              <span key={preset.id} className="group/preset relative inline-flex items-center">
                <button
                  type="button"
                  onClick={() => onChange({ ...EMPTY_FILTERS, ...preset.filters })}
                  className="rounded-full border border-border bg-transparent py-0.5 pl-2.5 pr-6 text-[11px] font-medium text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
                >
                  {preset.name}
                </button>
                <button
                  type="button"
                  onClick={() => deletePreset.mutate(preset.id)}
                  aria-label={t('screenerDeleteFilterPreset', { name: preset.name })}
                  className="absolute right-1 flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/preset:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {hasFilters && <SaveFilterPresetControl filters={filters} />}
          </div>
        </div>
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
            <Select
              value={filters.industry || 'all'}
              onValueChange={(v) => onChange({ ...filters, industry: v === 'all' ? '' : v })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder={t('screenerAnyIndustry')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('screenerAnyIndustry')}</SelectItem>
                {industries.map((ind) => (
                  <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Health Score */}
      <RangeFilter label={t('screenerHealthScoreLabel')} hint={t('screenerHealthScoreHint')} minKey="healthScoreMin" maxKey="healthScoreMax" filters={filters} onChange={onChange} step="5" />

      {/* Valuation */}
      <div className="space-y-0.5">
        <p className="text-xs font-semibold text-foreground pb-1">{t('screenerValuationHeading')}</p>
        <RangeFilter label={t('screenerMarketCapLabel')} unit="$B" hint={t('screenerMarketCapHint')} minKey="marketCapMin" maxKey="marketCapMax" filters={filters} onChange={onChange} step="10" />
        <div className="pt-3">
          <RangeFilter label={t('screenerPeRatioLabel')} hint={t('screenerPeRatioHint')} minKey="peMin" maxKey="peMax" filters={filters} onChange={onChange} step="1" />
        </div>
        <div className="pt-3">
          <RangeFilter label={t('screenerPbRatioLabel')} hint={t('screenerPbRatioHint')} minKey="pbMin" maxKey="pbMax" filters={filters} onChange={onChange} step="0.1" />
        </div>
      </div>

      {/* Profitability */}
      <div className="space-y-0.5">
        <p className="text-xs font-semibold text-foreground pb-1">{t('screenerProfitabilityHeading')}</p>
        <RangeFilter label={t('screenerProfitMarginLabel')} unit="%" hint={t('screenerProfitMarginHint')} minKey="profitMarginMin" maxKey="profitMarginMax" filters={filters} onChange={onChange} step="1" />
        <div className="pt-3">
          <RangeFilter label={t('screenerRevenueGrowthLabel')} unit="%" hint={t('screenerRevenueGrowthHint')} minKey="revenueGrowthMin" maxKey="revenueGrowthMax" filters={filters} onChange={onChange} step="1" />
        </div>
      </div>

      {/* Risk & Income */}
      <div className="space-y-0.5">
        <p className="text-xs font-semibold text-foreground pb-1">{t('screenerRiskIncomeHeading')}</p>
        <RangeFilter label={t('screenerBetaLabel')} hint={t('screenerBetaHint')} minKey="betaMin" maxKey="betaMax" filters={filters} onChange={onChange} step="0.1" />
        <div className="pt-3">
          <RangeFilter label={t('screenerDividendYieldLabel')} unit="%" hint={t('screenerDividendYieldHint')} minKey="divYieldMin" maxKey="divYieldMax" filters={filters} onChange={onChange} step="0.1" />
        </div>
      </div>

      {/* 52-Week Range */}
      <div className="space-y-0.5">
        <p className="text-xs font-semibold text-foreground pb-1">{t('screenerPriceRangeHeading')}</p>
        <RangeFilter label={t('screener52wSpreadLabel')} unit="%" hint={t('screener52wSpreadHint')} minKey="week52ChangeMin" maxKey="week52ChangeMax" filters={filters} onChange={onChange} step="5" />
      </div>
    </div>
  );
}
