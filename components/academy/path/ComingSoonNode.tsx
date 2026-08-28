'use client';

import { useTranslation } from 'react-i18next';
import { Clock } from 'lucide-react';

interface Props {
  status: 'scheduled' | 'reviewing';
  daysUntil: number | null;
}

/**
 * Teaser node at the bottom of the /academy path — deliberately not a real
 * PathNode (dashed border, no icon-in-a-course sense, not clickable, not
 * wired into the connector-line measurement in AcademyPath.tsx) so it never
 * reads as a locked course you could unlock by clicking. Copy is driven by
 * app/api/academy/next-course-countdown, which counts down to the next
 * scheduled generation run rather than publication — see that route's
 * comment for why publication itself isn't countdown-able.
 */
export function ComingSoonNode({ status, daysUntil }: Props) {
  const { t } = useTranslation('academy');
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-border">
        <Clock className="h-5 w-5 text-muted-foreground/60" />
      </div>
      <div>
        <div className="text-sm font-bold tracking-tight text-muted-foreground/80">{t('comingSoonNewCourse')}</div>
        <div className="mt-1 text-[11px] font-mono text-muted-foreground/70">
          {status === 'scheduled' && daysUntil != null
            ? t('comingSoonUnlocksIn', { count: daysUntil })
            : t('comingSoonLaunchingSoon')}
        </div>
      </div>
    </div>
  );
}
