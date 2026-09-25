'use client';

/**
 * Tracked politicians' disclosed trades in this stock, last 12 months.
 *
 * Free for everyone: the disclosures are public records, and this card is the
 * main way someone reading a stock page discovers Washington Trading at all.
 * Renders nothing when no tracked member traded the stock, which is most
 * stocks: an empty "no activity" card on every page would be noise.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Landmark } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PoliticianAvatar } from '@/components/congress/PoliticianAvatar';
import { formatAmountRange, moveBeforeDisclosure, tradeDirection } from '@/lib/congress/types';
import type { ActivityTrade } from '@/lib/congress/insights';
import { cn } from '@/lib/utils';

const INITIAL_ROWS = 5;

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export function WashingtonActivityCard({ ticker }: { ticker: string }) {
  const { t } = useTranslation('stock');
  const [expanded, setExpanded] = useState(false);

  const { data } = useQuery({
    queryKey: ['congress-symbol', ticker],
    queryFn: async (): Promise<ActivityTrade[]> => {
      const res = await fetch(`/api/congress/symbol/${ticker}`);
      if (!res.ok) return [];
      return (await res.json()).trades ?? [];
    },
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  if (!data || data.length === 0) return null;

  const members = new Set(data.map((d) => d.slug)).size;
  const buyers = new Set(data.filter((d) => tradeDirection(d.tradeType) === 'buy').map((d) => d.slug)).size;
  const sellers = new Set(data.filter((d) => tradeDirection(d.tradeType) === 'sell').map((d) => d.slug)).size;
  const rows = expanded ? data : data.slice(0, INITIAL_ROWS);

  return (
    <Card className="mb-8">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Landmark className="h-4 w-4 text-muted-foreground" aria-hidden />
          {t('washingtonTitle')}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t('washingtonSummary', { count: members, ticker })}{' '}
          <span className="tabular-nums">{t('washingtonBuyersSellers', { buyers, sellers })}</span>
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="divide-y divide-border/50">
          {rows.map((r, i) => {
            const dir = tradeDirection(r.tradeType);
            const move = moveBeforeDisclosure(r);
            return (
              <li key={`${r.slug}-${r.transactionDate}-${i}`} className="flex items-center gap-3 py-2.5">
                <PoliticianAvatar displayName={r.displayName} slug={r.slug} size={28} />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/discover/politicians/${r.slug}`}
                    className="block truncate rounded-sm text-sm font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {/* clamp-ok: a person's name in a dense row */}
                    {r.displayName}
                  </Link>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {t('washingtonTraded', { date: fmtDate(r.transactionDate) })}
                    {r.disclosureDate && <> · {t('washingtonPublic', { date: fmtDate(r.disclosureDate) })}</>}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <span
                    className={cn(
                      'inline-block rounded-md px-1.5 py-0.5 text-xs font-medium',
                      dir === 'buy'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : dir === 'sell'
                          ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                          : 'bg-muted/50 text-muted-foreground',
                    )}
                  >
                    {dir === 'buy' ? t('washingtonBought') : dir === 'sell' ? t('washingtonSold') : r.tradeType}
                  </span>
                  <p className="mt-0.5 font-mono text-xs tabular-nums text-foreground">
                    {formatAmountRange(r.amountLow, r.amountHigh, r.amountRange)}
                  </p>
                  {move != null && (
                    <p className="text-xs tabular-nums text-muted-foreground" title={t('washingtonMoveTitle')}>
                      {t('washingtonMove', { pct: `${move >= 0 ? '+' : ''}${move.toFixed(1)}%` })}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          {data.length > INITIAL_ROWS ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="rounded-sm text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {expanded ? t('washingtonShowLess') : t('washingtonShowAll', { count: data.length })}
            </button>
          ) : <span />}
          <Link
            href="/discover#washington-trading"
            className="rounded-sm text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('washingtonSeeAll')}
          </Link>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{t('washingtonDelayNote')}</p>
      </CardContent>
    </Card>
  );
}
