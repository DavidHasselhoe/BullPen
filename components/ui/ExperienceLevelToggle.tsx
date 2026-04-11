'use client';

import { useState } from 'react';
import { useExperienceLevel } from '@/hooks/use-experience-level';
import { cn } from '@/lib/utils';
import { Sparkles, BarChart2 } from 'lucide-react';

interface ExperienceLevelToggleProps {
  /** Optional className on the wrapper */
  className?: string;
  /** 'pill' (default) = compact inline toggle; 'full' = labeled version with description */
  variant?: 'pill' | 'full';
}

/**
 * Simple | Pro toggle for experience level.
 * - Simple = beginner (plain labels, key metrics, no technical indicators)
 * - Pro = intermediate/advanced (full jargon, all metrics, technical indicators)
 */
export function ExperienceLevelToggle({ className, variant = 'pill' }: ExperienceLevelToggleProps) {
  const { level, isSimplified, setLevel } = useExperienceLevel();
  const [isSaving, setIsSaving] = useState(false);

  const handleToggle = async (toSimple: boolean) => {
    if (isSaving) return;
    const newLevel = toSimple ? 'beginner' : 'intermediate';
    if (level === newLevel) return;
    setIsSaving(true);
    try {
      await setLevel(newLevel);
    } finally {
      setIsSaving(false);
    }
  };

  if (variant === 'full') {
    return (
      <div className={cn('space-y-2', className)}>
        <p className="text-sm font-medium text-foreground">View Mode</p>
        <p className="text-xs text-muted-foreground">
          Simple mode uses plain-English labels. Pro mode shows full financial terminology.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => handleToggle(true)}
            disabled={isSaving}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium transition-all',
              isSimplified
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground'
            )}
          >
            <Sparkles className="h-4 w-4" />
            Simple
          </button>
          <button
            onClick={() => handleToggle(false)}
            disabled={isSaving}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium transition-all',
              !isSimplified
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground'
            )}
          >
            <BarChart2 className="h-4 w-4" />
            Pro
          </button>
        </div>
      </div>
    );
  }

  // Default: compact pill
  return (
    <div
      className={cn(
        'flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5 text-xs',
        isSaving && 'opacity-60 pointer-events-none',
        className
      )}
    >
      <button
        onClick={() => handleToggle(true)}
        className={cn(
          'flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-all',
          isSimplified
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <Sparkles className="h-3 w-3" />
        Simple
      </button>
      <button
        onClick={() => handleToggle(false)}
        className={cn(
          'flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-all',
          !isSimplified
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <BarChart2 className="h-3 w-3" />
        Pro
      </button>
    </div>
  );
}
