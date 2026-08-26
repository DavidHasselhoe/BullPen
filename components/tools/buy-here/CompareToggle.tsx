'use client';

import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface CompareToggleProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: string;
  className?: string;
}

export function CompareToggle({
  checked,
  onCheckedChange,
  label,
  className,
}: CompareToggleProps) {
  const { t } = useTranslation('tools');
  const displayLabel = label ?? t('buyHereCompareToggleLabel');
  return (
    <span className={cn('inline-flex items-center gap-3', className)}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          'relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent',
          'transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          checked ? 'bg-primary' : 'bg-muted'
        )}
      >
        <motion.span
          layout
          transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
          className="pointer-events-none absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-background shadow-lg"
          animate={{ x: checked ? 20 : 0 }}
        />
      </button>
      <span className="text-sm font-medium">{displayLabel}</span>
      {checked && (
        <motion.span
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary"
        >
          SPY
        </motion.span>
      )}
    </span>
  );
}
