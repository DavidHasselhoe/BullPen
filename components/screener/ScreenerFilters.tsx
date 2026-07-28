'use client';

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
import { RotateCcw } from 'lucide-react';

export interface ScreenerFilterValues {
  sector: string;
  industry: string;
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
  // Client-only: relative volume (live ÷ 90-day avg). Not sent to the API.
  rvolMin: string;
}

export const EMPTY_FILTERS: ScreenerFilterValues = {
  sector: '',
  industry: '',
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
  rvolMin: '',
};

interface Preset {
  label: string;
  filters: Partial<ScreenerFilterValues>;
}

const PRESETS: Preset[] = [
  { label: 'All',             filters: {} },
  { label: 'Deep Value',      filters: { peMax: '15', pbMax: '2' } },
  { label: 'Growth',          filters: { revenueGrowthMin: '15' } },
  { label: 'Dividend',        filters: { divYieldMin: '2.5' } },
  { label: 'Quality',         filters: { profitMarginMin: '15', revenueGrowthMin: '10' } },
  { label: 'Large Cap',       filters: { marketCapMin: '100' } },
  { label: 'Volume Surge',    filters: { rvolMin: '2' } },
];

function activePreset(filters: ScreenerFilterValues): string {
  const hasAny = Object.values(filters).some(Boolean);
  if (!hasAny) return 'All';
  for (const p of PRESETS.slice(1)) {
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
  minKey,
  maxKey,
  filters,
  onChange,
  step,
}: {
  label: string;
  unit?: string;
  minKey: keyof ScreenerFilterValues;
  maxKey: keyof ScreenerFilterValues;
  filters: ScreenerFilterValues;
  onChange: (f: ScreenerFilterValues) => void;
  step?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">
        {label}{unit ? <span className="ml-1 opacity-60">({unit})</span> : null}
      </Label>
      <div className="flex gap-2">
        <Input
          type="number"
          placeholder="Min"
          value={filters[minKey]}
          onChange={(e) => onChange({ ...filters, [minKey]: e.target.value })}
          className="h-8 text-xs"
          step={step}
        />
        <Input
          type="number"
          placeholder="Max"
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
  const hasFilters = Object.values(filters).some((v) => v !== '');
  const current = activePreset(filters);

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
        <h3 className="text-sm font-semibold">Filters</h3>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={onReset} className="h-7 text-xs gap-1.5">
            <RotateCcw className="h-3 w-3" />
            Reset
          </Button>
        )}
      </div>

      {/* Presets */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/85">Presets</p>
        <div className="flex flex-wrap gap-1">
          {PRESETS.map((p) => (
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
          <Label className="text-xs font-medium text-muted-foreground">Sector</Label>
          <Select
            value={filters.sector || 'all'}
            onValueChange={(v) => onChange({ ...filters, sector: v === 'all' ? '' : v, industry: '' })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Any sector" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any sector</SelectItem>
              {sectors.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {industries.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Industry</Label>
            <Select
              value={filters.industry || 'all'}
              onValueChange={(v) => onChange({ ...filters, industry: v === 'all' ? '' : v })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Any industry" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any industry</SelectItem>
                {industries.map((ind) => (
                  <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Valuation */}
      {(show('market_cap', 'marketCapMin', 'marketCapMax') ||
        show('pe_ratio', 'peMin', 'peMax') ||
        show('pb_ratio', 'pbMin', 'pbMax')) && (
        <div className="space-y-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/85 pb-1">Valuation</p>
          {show('market_cap', 'marketCapMin', 'marketCapMax') && (
            <RangeFilter label="Market Cap" unit="$B" minKey="marketCapMin" maxKey="marketCapMax" filters={filters} onChange={onChange} step="10" />
          )}
          {show('pe_ratio', 'peMin', 'peMax') && (
            <div className="pt-3">
              <RangeFilter label="P/E Ratio (TTM)" minKey="peMin" maxKey="peMax" filters={filters} onChange={onChange} step="1" />
            </div>
          )}
          {show('pb_ratio', 'pbMin', 'pbMax') && (
            <div className="pt-3">
              <RangeFilter label="P/B Ratio" minKey="pbMin" maxKey="pbMax" filters={filters} onChange={onChange} step="0.1" />
            </div>
          )}
        </div>
      )}

      {/* Profitability */}
      {(show('profit_margin', 'profitMarginMin', 'profitMarginMax') ||
        show('revenue_growth_yoy', 'revenueGrowthMin', 'revenueGrowthMax')) && (
        <div className="space-y-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/85 pb-1">Profitability</p>
          {show('profit_margin', 'profitMarginMin', 'profitMarginMax') && (
            <RangeFilter label="Profit Margin" unit="%" minKey="profitMarginMin" maxKey="profitMarginMax" filters={filters} onChange={onChange} step="1" />
          )}
          {show('revenue_growth_yoy', 'revenueGrowthMin', 'revenueGrowthMax') && (
            <div className="pt-3">
              <RangeFilter label="Revenue Growth YoY" unit="%" minKey="revenueGrowthMin" maxKey="revenueGrowthMax" filters={filters} onChange={onChange} step="1" />
            </div>
          )}
        </div>
      )}

      {/* Risk & Income */}
      {(show('beta', 'betaMin', 'betaMax') ||
        show('dividend_yield', 'divYieldMin', 'divYieldMax')) && (
        <div className="space-y-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/85 pb-1">Risk & Income</p>
          {show('beta', 'betaMin', 'betaMax') && (
            <RangeFilter label="Beta" minKey="betaMin" maxKey="betaMax" filters={filters} onChange={onChange} step="0.1" />
          )}
          {show('dividend_yield', 'divYieldMin', 'divYieldMax') && (
            <div className="pt-3">
              <RangeFilter label="Dividend Yield" unit="%" minKey="divYieldMin" maxKey="divYieldMax" filters={filters} onChange={onChange} step="0.1" />
            </div>
          )}
        </div>
      )}

      {/* 52-Week Range */}
      {show('week52_high', 'week52ChangeMin', 'week52ChangeMax') && (
        <div className="space-y-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/85 pb-1">Price Range</p>
          <RangeFilter label="52W H/L Spread" unit="%" minKey="week52ChangeMin" maxKey="week52ChangeMax" filters={filters} onChange={onChange} step="5" />
        </div>
      )}

      {/* Volume */}
      {show('rvol', 'rvolMin') && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/85 pb-1">Volume</p>
          <Label className="text-xs font-medium text-muted-foreground">
            Min Relative Volume <span className="ml-1 opacity-60">(×)</span>
          </Label>
          <Input
            type="number"
            placeholder="e.g. 2"
            value={filters.rvolMin}
            onChange={(e) => onChange({ ...filters, rvolMin: e.target.value })}
            className="h-8 text-xs"
            step="0.5"
            min="0"
          />
          <p className="text-[10px] text-muted-foreground/85 leading-snug">
            Today&apos;s volume vs 90-day average. Needs live market data.
          </p>
        </div>
      )}
    </div>
  );
}
