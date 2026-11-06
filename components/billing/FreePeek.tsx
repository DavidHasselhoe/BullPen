'use client';

/**
 * The free monthly look at Discover's Pro cross-reference panels
 * (lib/billing/free-peek.ts). One look opens both "Your stocks in Washington"
 * and "Your stocks in funds", so redeeming refetches both.
 */

import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { fmtClockTime } from '@/lib/dates/clock';
import { useClock } from '@/hooks/use-clock';

const PANEL_QUERIES = [['congress-overlap'], ['institutions-overlap']];

/** Secondary to the panel's upgrade link: only rendered while this month's look is unspent. */
export function PeekButton() {
  const { t } = useTranslation('discover');
  const queryClient = useQueryClient();
  const unlock = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/billing/peek', { method: 'POST' });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) throw new Error('peek failed');
    },
    onSuccess: () => Promise.all(PANEL_QUERIES.map((queryKey) => queryClient.invalidateQueries({ queryKey }))),
  });

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => unlock.mutate()}
        disabled={unlock.isPending}
        className="inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      >
        {unlock.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
        {t('peekTryFree')}
      </button>
      {unlock.isError && <p role="alert" className="text-xs text-destructive">{t('peekError')}</p>}
    </div>
  );
}

/** Shown on top of the full panel while a free account's look is open. */
export function PeekNotice({ until }: { until: string }) {
  const { t } = useTranslation('discover');
  const clock = useClock();
  const end = new Date(until);
  const time = fmtClockTime(end, clock);
  const today = end.toDateString() === new Date().toDateString();
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
      <span>{t(today ? 'peekOpenUntilToday' : 'peekOpenUntilTomorrow', { time })}</span>
      <Link href="/upgrade?from=overlap_peek" className="font-medium text-primary underline-offset-2 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {t('peekKeepWithPro')}
      </Link>
    </p>
  );
}
