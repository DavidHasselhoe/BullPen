'use client';

/**
 * Pro: what buying a member's trades the day they became public, and holding
 * until today, returned against SPY over the same windows. See getScorecard
 * for the method; the method line below repeats it because a return figure
 * without its method is exactly the misleading number this page avoids.
 */

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { LineChart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ProBadge } from '@/components/billing/ProBadge';
import { useEntitlements } from '@/hooks/use-entitlements';
import type { Scorecard } from '@/lib/congress/insights';
import { cn } from '@/lib/utils';

function pct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' }) {
  return (
    <div className="rounded-lg border border-border/50 bg-card/40 px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-0.5 font-mono text-lg font-semibold tabular-nums',
          tone === 'up' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'down' ? 'text-red-600 dark:text-red-400' : 'text-foreground',
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function PoliticianScorecard({ slug, displayName }: { slug: string; displayName: string }) {
  const { t } = useTranslation('discover');
  const { isPro } = useEntitlements();

  const { data, isLoading } = useQuery({
    queryKey: ['congress-scorecard', slug],
    queryFn: async (): Promise<Scorecard | null> => {
      const res = await fetch(`/api/congress/${slug}/scorecard`);
      if (!res.ok) return null;
      return (await res.json()).scorecard ?? null;
    },
    enabled: isPro,
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  if (!isPro) {
    return (
      <section className="mb-8 flex items-center justify-between gap-4 rounded-xl border border-border/50 bg-card/40 px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <LineChart className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              {t('scoreTitle')} <ProBadge />
            </p>
            <p className="text-xs text-muted-foreground">
              {t('scoreLockedPitch', { name: displayName })}
            </p>
          </div>
        </div>
        <Link
          href="/upgrade"
          className="shrink-0 whitespace-nowrap rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
        >
          {t('scoreUnlock')}
        </Link>
      </section>
    );
  }

  return (
    <section aria-labelledby="congress-scorecard-heading" className="mb-10">
      <h2 id="congress-scorecard-heading" className="mb-1 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
        {t('scoreTitle')}
      </h2>
      <p className="mb-3 text-sm text-muted-foreground">
        {t('scoreIntro')}
      </p>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-busy>
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-[68px] animate-pulse rounded-lg bg-muted/40" />)}
        </div>
      ) : !data ? (
        <p className="rounded-xl border border-dashed border-border/60 px-4 py-6 text-center text-sm text-muted-foreground">
          {t('scoreNotEnough')}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label={t('scoreMedianReturn')} value={pct(data.medianReturnPct)} tone={data.medianReturnPct >= 0 ? 'up' : 'down'} />
            <Stat label={t('scoreMedianVsSpx')} value={pct(data.medianExcessPct)} tone={data.medianExcessPct >= 0 ? 'up' : 'down'} />
            <Stat label={t('scoreBeat')} value={`${Math.round(data.beatSpyPct)}%`} />
            <Stat label={t('scoreMedianHeld')} value={t('scoreDays', { count: data.medianDaysHeld })} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t('scoreFootnote', { count: data.count })}
          </p>
        </>
      )}
    </section>
  );
}
