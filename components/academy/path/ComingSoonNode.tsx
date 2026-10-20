'use client';

import { useTranslation } from 'react-i18next';
import { Clock } from 'lucide-react';
import { intlLocale } from '@/lib/i18n/intl-locale';

interface Props {
  status: 'scheduled' | 'reviewing' | 'planned';
  daysUntil: number | null;
  /** 'planned' only: the next roadmap v2 course and its "YYYY-MM". */
  title?: string;
  targetMonth?: string;
}

/**
 * Teaser node at the bottom of the /academy path — deliberately not a real
 * PathNode (dashed border, no icon-in-a-course sense, not clickable, not
 * wired into the connector-line measurement in AcademyPath.tsx) so it never
 * reads as a locked course you could unlock by clicking. Copy is driven by
 * app/api/academy/next-course-countdown, which counts down to the next
 * scheduled generation run rather than publication — see that route's
 * comment for why publication itself isn't countdown-able. 'planned' names
 * the next roadmap v2 course and the month it is expected.
 */
export function ComingSoonNode({ status, daysUntil, title, targetMonth }: Props) {
  const { t, i18n } = useTranslation('academy');
  const month = targetMonth
    ? new Date(`${targetMonth}-01T12:00:00Z`).toLocaleDateString(intlLocale(i18n.language), {
        month: 'long', year: 'numeric', timeZone: 'UTC',
      })
    : null;
  const planned = status === 'planned' && title;

  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-border">
        <Clock className="h-5 w-5 text-muted-foreground" />
      </div>
      <div>
        {planned && (
          <div className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">{t('comingNextLabel')}</div>
        )}
        <div className="text-sm font-bold tracking-tight text-muted-foreground">
          {planned ? title : t('comingSoonNewCourse')}
        </div>
        <div className="mt-1 text-[11px] font-mono text-muted-foreground">
          {status === 'scheduled' && daysUntil != null
            ? t('comingSoonUnlocksIn', { count: daysUntil })
            : planned && month
              ? t('comingNextExpected', { month })
              : t('comingSoonLaunchingSoon')}
        </div>
      </div>
    </div>
  );
}
