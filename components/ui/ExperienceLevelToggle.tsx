'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useExperienceLevel } from '@/hooks/use-experience-level';
import { cn } from '@/lib/utils';
import { Sparkles, BarChart2 } from 'lucide-react';

interface ExperienceLevelToggleProps {
  /** Optional className on the wrapper */
  className?: string;
}

/**
 * Simple | Full toggle for experience level, beside the data it changes.
 * - Simple = beginner (plain labels, key metrics, no technical indicators)
 * - Full = intermediate/advanced (full terminology, all metrics)
 *
 * Called "Full", not "Pro": "Pro" is the paid plan, and a Free user saw it
 * selected here while the menu said Free. The three-level choice lives in
 * Settings > Customize; this only flips between simple and not.
 */
export function ExperienceLevelToggle({ className }: ExperienceLevelToggleProps) {
  const { t } = useTranslation('common');
  const { isSimplified, setLevel } = useExperienceLevel();
  const [isSaving, setIsSaving] = useState(false);

  const handleToggle = async (toSimple: boolean) => {
    if (isSaving || toSimple === isSimplified) return;
    setIsSaving(true);
    try {
      // Only ever moves between beginner and intermediate: an Advanced user is
      // already "Full" and never reaches this, so they keep Advanced.
      await setLevel(toSimple ? 'beginner' : 'intermediate');
    } finally {
      setIsSaving(false);
    }
  };

  const option = (simple: boolean) => {
    const active = simple === isSimplified;
    const Icon = simple ? Sparkles : BarChart2;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={active}
        onClick={() => handleToggle(simple)}
        title={t(simple ? 'experienceToggleSimpleTitle' : 'experienceToggleFullTitle')}
        className={cn(
          'flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <Icon className="h-3 w-3" aria-hidden />
        {t(simple ? 'experienceToggleSimple' : 'experienceToggleFull')}
      </button>
    );
  };

  return (
    <div
      role="radiogroup"
      aria-label={t('experienceToggleAria')}
      className={cn(
        'flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5 text-xs',
        isSaving && 'opacity-60 pointer-events-none',
        className
      )}
    >
      {option(true)}
      {option(false)}
    </div>
  );
}
