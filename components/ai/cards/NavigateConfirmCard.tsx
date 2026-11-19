'use client';

import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import type { NavigateDecision } from '@/lib/ai/tool-ux';

interface NavigateConfirmCardProps {
  /** Where accepting takes the user. Same path as the current page = the page updates in place. */
  path: string;
  /** Bull's own words for the action ("Apply filter"), in the user's language. */
  confirmLabel?: string;
  decision?: NavigateDecision;
  isHistorical: boolean;
  onConfirm: () => void;
  onDecline: () => void;
}

/**
 * The accept / Not now pair under Bull's reply when it offers to take the user
 * somewhere, or to change the page they're on (new screener filters), without
 * being asked. See ClientAction's `navigate` variant in lib/ai/tool-ux.ts.
 * The accept button says what it does: Bull's own label when it wrote one,
 * else "Apply" for the current page and "Go there" for another one.
 */
export function NavigateConfirmCard({ path, confirmLabel, decision, isHistorical, onConfirm, onDecline }: NavigateConfirmCardProps) {
  const { t } = useTranslation('ai');
  const pathname = usePathname();
  const samePage = path.split('?')[0] === pathname;

  if (decision === 'confirmed') {
    return <p className="mt-3 text-xs text-muted-foreground first:mt-0">{samePage ? t('navigatePageUpdated') : t('navigateTakingYouThere')}</p>;
  }
  if (decision === 'declined') {
    return <p className="mt-3 text-xs text-muted-foreground first:mt-0">{samePage ? t('navigateNothingChanged') : t('navigateStayingHere')}</p>;
  }
  // A stale, never-answered prompt from a past conversation — offering to
  // navigate is only meaningful in the moment Bull just said it, so don't
  // resurrect a live-clickable prompt from history.
  if (isHistorical) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2 first:mt-0">
      {/* The reply bubble is bg-muted, so "Not now" sits on bg-background with a
          real border to read as a button rather than a tint of the bubble. */}
      <button
        type="button"
        onClick={onConfirm}
        className="inline-flex h-8 min-w-16 items-center justify-center rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-sm transition-[background-color,box-shadow,transform] duration-150 hover:bg-primary/80 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-muted active:scale-[0.97]"
      >
        {confirmLabel ?? (samePage ? t('navigateApply') : t('navigateGoThere'))}
      </button>
      <button
        type="button"
        onClick={onDecline}
        className="inline-flex h-8 min-w-16 items-center justify-center rounded-full border border-foreground/15 bg-background px-4 text-xs font-semibold text-foreground transition-[border-color,box-shadow,transform] duration-150 hover:border-foreground/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-muted active:scale-[0.97]"
      >
        {t('navigateNotNow')}
      </button>
    </div>
  );
}
