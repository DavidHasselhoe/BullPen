'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { MetricType } from '@/lib/types/database';

// Metrics explicitly stated in SEC filings only (no computed/derived metrics like FCF)
const METRICS: Array<{ value: MetricType; label: string }> = [
  { value: 'revenue', label: 'Revenue' },
  { value: 'cost_of_revenue', label: 'Cost of Revenue' },
  { value: 'gross_profit', label: 'Gross Profit' },
  { value: 'operating_income', label: 'Operating Income' },
  { value: 'net_income', label: 'Net Income' },
  { value: 'eps_basic', label: 'EPS (Basic)' },
  { value: 'eps_diluted', label: 'EPS (Diluted)' },
  { value: 'operating_cash_flow', label: 'Operating Cash Flow' },
];

interface MetricSelectorProps {
  selected: MetricType;
  onChange: (metric: MetricType) => void;
}

export function MetricSelector({ selected, onChange }: MetricSelectorProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {METRICS.map((metric) => (
        <Button
          key={metric.value}
          variant={selected === metric.value ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChange(metric.value)}
          className={cn(
            selected === metric.value &&
              'bg-foreground text-background hover:bg-foreground/90'
          )}
        >
          {metric.label}
        </Button>
      ))}
    </div>
  );
}
