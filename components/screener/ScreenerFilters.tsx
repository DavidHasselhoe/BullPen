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
  revenueMin: string;
  revenueMax: string;
  grossMarginMin: string;
  grossMarginMax: string;
  operatingMarginMin: string;
  operatingMarginMax: string;
  netMarginMin: string;
  netMarginMax: string;
  epsMin: string;
  epsMax: string;
  fcfMin: string;
  fcfMax: string;
  revenueGrowthMin: string;
  revenueGrowthMax: string;
  deMin: string;
  deMax: string;
}

export const EMPTY_FILTERS: ScreenerFilterValues = {
  sector: '',
  revenueMin: '',
  revenueMax: '',
  grossMarginMin: '',
  grossMarginMax: '',
  operatingMarginMin: '',
  operatingMarginMax: '',
  netMarginMin: '',
  netMarginMax: '',
  epsMin: '',
  epsMax: '',
  fcfMin: '',
  fcfMax: '',
  revenueGrowthMin: '',
  revenueGrowthMax: '',
  deMin: '',
  deMax: '',
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
}: {
  label: string;
  unit?: string;
  minKey: keyof ScreenerFilterValues;
  maxKey: keyof ScreenerFilterValues;
  filters: ScreenerFilterValues;
  onChange: (filters: ScreenerFilterValues) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="flex gap-2">
        <Input
          type="number"
          placeholder={`Min${unit ? ` (${unit})` : ''}`}
          value={filters[minKey]}
          onChange={(e) => onChange({ ...filters, [minKey]: e.target.value })}
          className="h-8 text-xs"
        />
        <Input
          type="number"
          placeholder={`Max${unit ? ` (${unit})` : ''}`}
          value={filters[maxKey]}
          onChange={(e) => onChange({ ...filters, [maxKey]: e.target.value })}
          className="h-8 text-xs"
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
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <RangeFilter label="Revenue" unit="$B" minKey="revenueMin" maxKey="revenueMax" filters={filters} onChange={onChange} />
      <RangeFilter label="Gross Margin" unit="%" minKey="grossMarginMin" maxKey="grossMarginMax" filters={filters} onChange={onChange} />
      <RangeFilter label="Operating Margin" unit="%" minKey="operatingMarginMin" maxKey="operatingMarginMax" filters={filters} onChange={onChange} />
      <RangeFilter label="Net Margin" unit="%" minKey="netMarginMin" maxKey="netMarginMax" filters={filters} onChange={onChange} />
      <RangeFilter label="EPS Diluted" unit="$" minKey="epsMin" maxKey="epsMax" filters={filters} onChange={onChange} />
      <RangeFilter label="Free Cash Flow" unit="$B" minKey="fcfMin" maxKey="fcfMax" filters={filters} onChange={onChange} />
      <RangeFilter label="Revenue Growth YoY" unit="%" minKey="revenueGrowthMin" maxKey="revenueGrowthMax" filters={filters} onChange={onChange} />
      <RangeFilter label="Debt / Equity" minKey="deMin" maxKey="deMax" filters={filters} onChange={onChange} />
    </div>
  );
}
