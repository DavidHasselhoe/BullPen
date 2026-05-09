'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export const PRESETS = [
  { label: '1 year', years: 1 },
  { label: '3 years', years: 3 },
  { label: '5 years', years: 5 },
  { label: '10 years', years: 10 },
];

const OPTIONS: { label: string; years: number | null }[] = [
  ...PRESETS,
  { label: 'Custom', years: null },
];

interface TimeSelectorProps {
  value: number | null;
  onChange: (index: number | null) => void;
  customDate?: string;
  onCustomDateChange?: (date: string) => void;
  className?: string;
}

export function TimeSelector({
  value,
  onChange,
  customDate = '',
  onCustomDateChange,
  className,
}: TimeSelectorProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="relative flex flex-wrap gap-1 p-1 rounded-xl bg-muted/50 border border-border/50">
        {OPTIONS.map((opt, i) => (
          <button
            key={opt.label}
            type="button"
            onClick={() => {
              onChange(opt.years === null ? null : i);
              if (opt.years === null && !customDate && onCustomDateChange) {
                const d = new Date();
                d.setFullYear(d.getFullYear() - 5);
                onCustomDateChange(d.toISOString().slice(0, 10));
              }
            }}
            className={cn(
              'relative z-10 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200',
              'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background',
              (value === i || (opt.years === null && value === null))
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {value === i || (opt.years === null && value === null) ? (
              <motion.div
                layoutId="time-selector-bg"
                className="absolute inset-0 rounded-lg bg-background shadow-sm"
                transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
                style={{ zIndex: -1 }}
              />
            ) : null}
            <span className="relative z-0">{opt.label}</span>
          </button>
        ))}
      </div>
      {value === null && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden"
        >
          <input
            type="date"
            value={customDate}
            onChange={(e) => onCustomDateChange?.(e.target.value)}
            className="flex h-10 w-full max-w-xs rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </motion.div>
      )}
    </div>
  );
}
