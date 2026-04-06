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

interface ScreenerFiltersProps {
  filters: ScreenerFilterValues;
  sectors: string[];
  onChange: (filters: ScreenerFilterValues) => void;
  onReset: () => void;
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

export function ScreenerFilters({ filters, sectors, onChange, onReset }: ScreenerFiltersProps) {
  const hasFilters = Object.values(filters).some((v) => v !== '');

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

      {/* Sector */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Sector</Label>
        <Select
          value={filters.sector || 'all'}
          onValueChange={(v) => onChange({ ...filters, sector: v === 'all' ? '' : v })}
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

      {/* Valuation */}
      <div className="space-y-0.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 pb-1">Valuation</p>
        <RangeFilter label="Market Cap" unit="$B" minKey="marketCapMin" maxKey="marketCapMax" filters={filters} onChange={onChange} step="10" />
        <div className="pt-3">
          <RangeFilter label="P/E Ratio (TTM)" minKey="peMin" maxKey="peMax" filters={filters} onChange={onChange} step="1" />
        </div>
        <div className="pt-3">
          <RangeFilter label="P/B Ratio" minKey="pbMin" maxKey="pbMax" filters={filters} onChange={onChange} step="0.1" />
        </div>
      </div>

      {/* Growth & Profitability */}
      <div className="space-y-0.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 pb-1">Profitability</p>
        <RangeFilter label="Profit Margin" unit="%" minKey="profitMarginMin" maxKey="profitMarginMax" filters={filters} onChange={onChange} step="1" />
        <div className="pt-3">
          <RangeFilter label="Revenue Growth YoY" unit="%" minKey="revenueGrowthMin" maxKey="revenueGrowthMax" filters={filters} onChange={onChange} step="1" />
        </div>
      </div>

      {/* Risk & Income */}
      <div className="space-y-0.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 pb-1">Risk & Income</p>
        <RangeFilter label="Beta" minKey="betaMin" maxKey="betaMax" filters={filters} onChange={onChange} step="0.1" />
        <div className="pt-3">
          <RangeFilter label="Dividend Yield" unit="%" minKey="divYieldMin" maxKey="divYieldMax" filters={filters} onChange={onChange} step="0.1" />
        </div>
      </div>

      {/* 52-Week Range */}
      <div className="space-y-0.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 pb-1">Price Range</p>
        <RangeFilter label="52W H/L Spread" unit="%" minKey="week52ChangeMin" maxKey="week52ChangeMax" filters={filters} onChange={onChange} step="5" />
      </div>
    </div>
  );
}
