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
    return <p className="mb-2 text-xs text-muted-foreground last:mb-0">{t('navigateTakingYouThere')}</p>;
  }
  if (decision === 'declined') {
    return <p className="mb-2 text-xs text-muted-foreground last:mb-0">{t('navigateStayingHere')}</p>;
  }
  // A stale, never-answered prompt from a past conversation — offering to
  // navigate is only meaningful in the moment Bull just said it, so don't
  // resurrect a live-clickable prompt from history.
  if (isHistorical) return null;

  return (
    <div className="mb-2 flex gap-2 last:mb-0">
      <button
        type="button"
        onClick={onConfirm}
        className="inline-flex items-center justify-center rounded-full bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 active:scale-[0.97]"
      >
        {t('navigateYes')}
      </button>
      <button
        type="button"
        onClick={onDecline}
        className="inline-flex items-center justify-center rounded-full border border-border bg-muted/40 px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground active:scale-[0.97]"
      >
        {t('navigateNo')}
      </button>
    </div>
  );
}
