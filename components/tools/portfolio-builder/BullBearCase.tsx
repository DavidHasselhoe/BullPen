'use client';

import { useTranslation } from 'react-i18next';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { useExperienceLevel } from '@/hooks/use-experience-level';

interface Props {
  bullCase: string[];
  bearCase: string[];
}

/**
 * The one deliberate exception to this feature's tier-color migration —
 * Bull vs Bear is a genuine directional financial framing (would help vs
 * hurt returns), not a severity judgment, so emerald/red stays here exactly
 * as it does for a real gain/loss figure elsewhere in the app.
 */
export function BullBearCase({ bullCase, bearCase }: Props) {
  const { t } = useTranslation('tools');
  const { isSimplified } = useExperienceLevel();
  if (!bullCase?.length && !bearCase?.length) return null;

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      {bullCase?.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-emerald-400">
            <TrendingUp className="h-3.5 w-3.5" />
            {isSimplified ? t('portfolioBuilderWhyThisCouldWork') : t('portfolioBuilderBullCase')}
          </h3>
          <ol className="space-y-2.5">
            {bullCase.map((point, i) => (
              <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-foreground/85">
                <span className="mt-0.5 shrink-0 font-mono text-xs font-semibold text-emerald-400/60 tabular-nums">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span>{point}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {bearCase?.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-red-400">
            <TrendingDown className="h-3.5 w-3.5" />
            {isSimplified ? t('portfolioBuilderWhyItCouldGoWrong') : t('portfolioBuilderBearCase')}
          </h3>
          <ol className="space-y-2.5">
            {bearCase.map((point, i) => (
              <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-foreground/85">
                <span className="mt-0.5 shrink-0 font-mono text-xs font-semibold text-red-400/60 tabular-nums">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span>{point}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
