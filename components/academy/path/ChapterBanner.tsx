'use client';

import { useTranslation } from 'react-i18next';

interface Props {
  label: string;
  courseCount: number;
  requiresPro: boolean;
}

/** Flat section divider between groups of nodes on the /academy path — a label, not a decorative "world" banner. */
export function ChapterBanner({ label, courseCount, requiresPro }: Props) {
  const { t } = useTranslation('academy');
  return (
    <div className="relative z-[2] flex items-center justify-center gap-2 rounded-xl border border-border/50 bg-card px-4 py-2.5 my-2">
      {/* A heading, so the path is navigable by chapter with a screen reader. */}
      <h2 className="text-sm font-bold tracking-tight">{label}</h2>
      <span className="text-xs text-muted-foreground tabular-nums">
        {t('chapterBannerCourseCount', { count: courseCount })}
      </span>
      {requiresPro && (
        <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-xs font-semibold text-amber-500">
          {t('chapterBannerPro')}
        </span>
      )}
    </div>
  );
}
