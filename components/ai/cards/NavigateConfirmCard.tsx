'use client';

import { useTranslation } from 'react-i18next';
import type { NavigateDecision } from '@/lib/ai/tool-ux';

interface NavigateConfirmCardProps {
  decision?: NavigateDecision;
  isHistorical: boolean;
  onConfirm: () => void;
  onDecline: () => void;
}

/**
 * Yes/No prompt shown under Bull's reply when it's offering to take the user
 * somewhere they didn't explicitly ask to go — see ClientAction's `navigate`
 * variant in lib/ai/tool-ux.ts. Bull's own message text already states the
 * destination ("...want me to take you there?"), so this card is just the
 * two buttons plus the resolved state once clicked; it never repeats the
 * destination itself.
 */
export function NavigateConfirmCard({ decision, isHistorical, onConfirm, onDecline }: NavigateConfirmCardProps) {
  const { t } = useTranslation('ai');

  if (decision === 'confirmed') {
    return <p className="mt-3 text-xs text-muted-foreground first:mt-0">{t('navigateTakingYouThere')}</p>;
  }
  if (decision === 'declined') {
    return <p className="mt-3 text-xs text-muted-foreground first:mt-0">{t('navigateStayingHere')}</p>;
  }
  // A stale, never-answered prompt from a past conversation — offering to
  // navigate is only meaningful in the moment Bull just said it, so don't
  // resurrect a live-clickable prompt from history.
  if (isHistorical) return null;

  return (
    <div className="mt-3 flex gap-2 first:mt-0">
      {/* The reply bubble is bg-muted, so "No" sits on bg-background with a
          real border to read as a button rather than a tint of the bubble. */}
      <button
        type="button"
        onClick={onConfirm}
        className="inline-flex h-8 min-w-16 items-center justify-center rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-sm transition-[background-color,box-shadow,transform] duration-150 hover:bg-primary/80 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-muted active:scale-[0.97]"
      >
        {t('navigateYes')}
      </button>
      <button
        type="button"
        onClick={onDecline}
        className="inline-flex h-8 min-w-16 items-center justify-center rounded-full border border-foreground/15 bg-background px-4 text-xs font-semibold text-foreground transition-[border-color,box-shadow,transform] duration-150 hover:border-foreground/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-muted active:scale-[0.97]"
      >
        {t('navigateNo')}
      </button>
    </div>
  );
}
