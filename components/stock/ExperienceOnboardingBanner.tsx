'use client';

import { useState } from 'react';
import { useExperienceLevel, type ExperienceLevel } from '@/hooks/use-experience-level';
import { useAuth } from '@/hooks/use-auth';
import { X, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const OPTIONS: { level: ExperienceLevel; label: string; description: string }[] = [
  {
    level: 'beginner',
    label: 'New to investing',
    description: 'Show plain-English explanations',
  },
  {
    level: 'intermediate',
    label: 'Some experience',
    description: 'Balanced view with tooltips',
  },
  {
    level: 'advanced',
    label: 'Experienced investor',
    description: 'Full data and terminology',
  },
];

/**
 * Shown on the stock detail page when the user's experience_level has not been set yet.
 * Lets them pick their level inline without navigating to Settings.
 */
export function ExperienceOnboardingBanner() {
  const { user } = useAuth();
  const { setLevel } = useExperienceLevel();
  const [dismissed, setDismissed] = useState(false);
  const [saving, setSaving] = useState<ExperienceLevel | null>(null);

  // Only show when logged in and experience_level is null
  if (!user || user.experience_level !== null || dismissed) return null;

  const handleSelect = async (level: ExperienceLevel) => {
    setSaving(level);
    try {
      await setLevel(level);
      setDismissed(true);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-foreground">
              Personalize your view
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Tell us your investing experience so we can show you the right level of detail.
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              {OPTIONS.map(({ level, label, description }) => (
                <button
                  key={level}
                  onClick={() => handleSelect(level)}
                  disabled={saving !== null}
                  className={cn(
                    'flex flex-col items-start rounded-lg border px-3 py-2 text-left text-xs transition-all',
                    saving === level
                      ? 'border-primary bg-primary/10 text-primary opacity-70'
                      : 'border-border bg-background hover:border-primary/50 hover:bg-primary/5 text-foreground'
                  )}
                >
                  <span className="font-medium">{label}</span>
                  <span className="text-muted-foreground mt-0.5">{description}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
