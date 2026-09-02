'use client';

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
import { RotateCcw, HelpCircle } from 'lucide-react';

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

interface Preset {
  label: string;
  filters: Partial<ScreenerFilterValues>;
}

function getPresets(t: TFunction): Preset[] {
  return [
    { label: t('screenerPresetAll'),          filters: {} },
    { label: t('screenerPresetHighHealth'),    filters: { healthScoreMin: '70' } },
    { label: t('screenerPresetDeepValue'),     filters: { peMax: '15', pbMax: '2' } },
    { label: t('screenerPresetGrowth'),        filters: { revenueGrowthMin: '15' } },
    { label: t('screenerPresetDividend'),      filters: { divYieldMin: '2.5' } },
    { label: t('screenerPresetQuality'),       filters: { profitMarginMin: '15', revenueGrowthMin: '10' } },
    { label: t('screenerPresetLargeCap'),      filters: { marketCapMin: '100' } },
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

interface ScreenerFiltersProps {
  filters: ScreenerFilterValues;
  sectors: string[];
  industries: string[];
  onChange: (filters: ScreenerFilterValues) => void;
  onReset: () => void;
  /** Keys of currently-visible screener columns. Filters whose column is hidden are omitted
   *  unless the filter already has an active value (so users can always clear it). */
  visibleColumnKeys?: Set<string>;
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

export function ScreenerFilters({ filters, sectors, industries, onChange, onReset, visibleColumnKeys }: ScreenerFiltersProps) {
  const { t } = useTranslation('tools');
  const presets = getPresets(t);
  const hasFilters = Object.values(filters).some((v) => v !== '');
  const current = activePreset(filters, presets);

  // Returns true when the filter should be shown:
  // - no column visibility constraint (visibleColumnKeys not passed), OR
  // - the corresponding column is visible, OR
  // - the filter already has an active value (always allow clearing)
  const show = (colKey: string, ...filterKeys: (keyof ScreenerFilterValues)[]): boolean => {
    if (!visibleColumnKeys) return true;
    if (visibleColumnKeys.has(colKey)) return true;
    return filterKeys.some((k) => !!filters[k]);
  };

  const applyPreset = (preset: Preset) => {
    onChange({ ...EMPTY_FILTERS, ...preset.filters });
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
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">{t('screenerPresetsHeading')}</p>
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
      {show('health_score', 'healthScoreMin', 'healthScoreMax') && (
        <div className="space-y-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85 pb-1">{t('screenerGroupHealthScore')}</p>
          <RangeFilter label={t('screenerHealthScoreLabel')} hint={t('screenerHealthScoreHint')} minKey="healthScoreMin" maxKey="healthScoreMax" filters={filters} onChange={onChange} step="5" />
        </div>
      )}

      {/* Valuation */}
      {(show('market_cap', 'marketCapMin', 'marketCapMax') ||
        show('pe_ratio', 'peMin', 'peMax') ||
        show('pb_ratio', 'pbMin', 'pbMax')) && (
        <div className="space-y-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85 pb-1">{t('screenerValuationHeading')}</p>
          {show('market_cap', 'marketCapMin', 'marketCapMax') && (
            <RangeFilter label={t('screenerMarketCapLabel')} unit="$B" hint={t('screenerMarketCapHint')} minKey="marketCapMin" maxKey="marketCapMax" filters={filters} onChange={onChange} step="10" />
          )}
          {show('pe_ratio', 'peMin', 'peMax') && (
            <div className="pt-3">
              <RangeFilter label={t('screenerPeRatioLabel')} hint={t('screenerPeRatioHint')} minKey="peMin" maxKey="peMax" filters={filters} onChange={onChange} step="1" />
            </div>
          )}
          {show('pb_ratio', 'pbMin', 'pbMax') && (
            <div className="pt-3">
              <RangeFilter label={t('screenerPbRatioLabel')} hint={t('screenerPbRatioHint')} minKey="pbMin" maxKey="pbMax" filters={filters} onChange={onChange} step="0.1" />
            </div>
          )}
        </div>
      )}

      {/* Profitability */}
      {(show('profit_margin', 'profitMarginMin', 'profitMarginMax') ||
        show('revenue_growth_yoy', 'revenueGrowthMin', 'revenueGrowthMax')) && (
        <div className="space-y-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85 pb-1">{t('screenerProfitabilityHeading')}</p>
          {show('profit_margin', 'profitMarginMin', 'profitMarginMax') && (
            <RangeFilter label={t('screenerProfitMarginLabel')} unit="%" hint={t('screenerProfitMarginHint')} minKey="profitMarginMin" maxKey="profitMarginMax" filters={filters} onChange={onChange} step="1" />
          )}
          {show('revenue_growth_yoy', 'revenueGrowthMin', 'revenueGrowthMax') && (
            <div className="pt-3">
              <RangeFilter label={t('screenerRevenueGrowthLabel')} unit="%" hint={t('screenerRevenueGrowthHint')} minKey="revenueGrowthMin" maxKey="revenueGrowthMax" filters={filters} onChange={onChange} step="1" />
            </div>
          )}
        </div>
      )}

      {/* Risk & Income */}
      {(show('beta', 'betaMin', 'betaMax') ||
        show('dividend_yield', 'divYieldMin', 'divYieldMax')) && (
        <div className="space-y-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85 pb-1">{t('screenerRiskIncomeHeading')}</p>
          {show('beta', 'betaMin', 'betaMax') && (
            <RangeFilter label={t('screenerBetaLabel')} hint={t('screenerBetaHint')} minKey="betaMin" maxKey="betaMax" filters={filters} onChange={onChange} step="0.1" />
          )}
          {show('dividend_yield', 'divYieldMin', 'divYieldMax') && (
            <div className="pt-3">
              <RangeFilter label={t('screenerDividendYieldLabel')} unit="%" hint={t('screenerDividendYieldHint')} minKey="divYieldMin" maxKey="divYieldMax" filters={filters} onChange={onChange} step="0.1" />
            </div>
          )}
        </div>
      )}

      {/* 52-Week Range */}
      {show('week52_high', 'week52ChangeMin', 'week52ChangeMax') && (
        <div className="space-y-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85 pb-1">{t('screenerPriceRangeHeading')}</p>
          <RangeFilter label={t('screener52wSpreadLabel')} unit="%" hint={t('screener52wSpreadHint')} minKey="week52ChangeMin" maxKey="week52ChangeMax" filters={filters} onChange={onChange} step="5" />
        </div>
      )}
    </div>
  );
}
