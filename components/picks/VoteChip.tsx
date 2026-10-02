'use client';

import { useTranslation } from 'react-i18next';
import { Users } from 'lucide-react';
import type { PickVote } from '@/lib/picks/types';

/**
 * How the independent commit runs voted. Public, beside conviction: it is how
 * the pick was reached and the v2 pipeline's main reason to trust it. It used
 * to be a 12px line at the end of the Pro-only thesis.
 */
export function VoteChip({ vote }: { vote: PickVote }) {
  const { t } = useTranslation('discover');
  const label = vote.tiebreak
    ? t('pickVoteTiebreak')
    : vote.agreed === vote.of
      ? t('pickVoteAll', { of: vote.of })
      : t('pickVoteSome', { agreed: vote.agreed, of: vote.of });
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border border-border/40 bg-muted/30 px-2 py-1 text-[11px] font-medium text-muted-foreground"
      title={t('pickVoteExplain')}
    >
      <Users className="h-3 w-3" aria-hidden />
      {label}
    </span>
  );
}
