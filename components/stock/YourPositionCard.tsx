'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { useHomePortfolio } from '@/hooks/use-home-portfolio';
import { useUserSettings } from '@/hooks/use-user-settings';
import { formatCurrency } from '@/lib/currency/currency-conversion';
import { cn } from '@/lib/utils';

/**
 * "How am I doing on this one", for people who hold the stock.
 *
 * Every figure is computed the way the My Holdings table computes it (value,
 * unrealized P/L against average cost, share of the holdings total excluding
 * cash) from the same quote request Home uses, so the three surfaces can never
 * disagree. Mounted only for holders, so nobody else pays for the quotes.
 */
export function YourPositionCard({ ticker }: { ticker: string }) {
  const { t, i18n } = useTranslation('stock');
  const { roundNumbers } = useUserSettings();
  const home = useHomePortfolio();

  const h = home.holdings.find((x) => x.symbol.toUpperCase() === ticker.toUpperCase());
  const q = h ? home.quotes?.[h.symbol] : undefined;
  if (!h || !h.quantity || !q) return null;

  const fmt = (usd: number, signed = false) => {
    const s = formatCurrency(Math.abs(usd * home.usdRate), home.currency, roundNumbers ? { round: true } : undefined);
    return signed ? `${usd > 0 ? '+' : usd < 0 ? '−' : ''}${s}` : s;
  };
  const pct = (p: number) => `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p).toFixed(2)}%`;
  const tone = (v: number) =>
    Math.abs(v) < 0.005 ? 'text-muted-foreground' : v > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';

  const valueUSD = q.price * h.quantity;
  const holdingsUSD = home.holdings.reduce((sum, x) => {
    const xq = home.quotes?.[x.symbol];
    return xq && x.quantity ? sum + xq.price * x.quantity : sum;
  }, 0);
  const plUSD = h.avg_price ? (q.price - h.avg_price) * h.quantity : null;
  const plPct = h.avg_price ? ((q.price - h.avg_price) / h.avg_price) * 100 : null;
  const todayUSD = (q.change ?? 0) * h.quantity;
  const todayPct = q.changePercent ?? 0;
  const share = holdingsUSD > 0 ? (valueUSD / holdingsUSD) * 100 : null;
  const shares = h.quantity.toLocaleString(i18n.language, { maximumFractionDigits: 6 });

  return (
    <section aria-labelledby="position-heading" className="mb-8 rounded-2xl border border-border bg-card px-5 py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="position-heading" className="text-sm font-semibold text-foreground">{t('positionHeading')}</h2>
        <Link
          href="/holdings"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {t('positionHoldingsLink')}
          <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">{t('positionValue')}</dt>
          <dd className="mt-1 font-mono text-lg font-semibold tabular-nums text-foreground">{fmt(valueUSD)}</dd>
          <dd className="mt-0.5 text-xs text-muted-foreground">
            {share != null ? t('positionSharesOfPortfolio', { shares, share: share.toFixed(1) }) : t('positionShares', { shares })}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t('positionTotalReturn')}</dt>
          {plUSD != null && plPct != null ? (
            <>
              <dd className={cn('mt-1 font-mono text-lg font-semibold tabular-nums', tone(plPct))}>{fmt(plUSD, true)}</dd>
              <dd className={cn('mt-0.5 font-mono text-xs tabular-nums', tone(plPct))}>{pct(plPct)}</dd>
            </>
          ) : (
            <dd className="mt-1 text-sm text-muted-foreground">{t('positionNoCost')}</dd>
          )}
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{home.session === 'closed' ? t('positionLastSession') : t('positionToday')}</dt>
          <dd className={cn('mt-1 font-mono text-lg font-semibold tabular-nums', tone(todayPct))}>{fmt(todayUSD, true)}</dd>
          <dd className={cn('mt-0.5 font-mono text-xs tabular-nums', tone(todayPct))}>{pct(todayPct)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t('positionAvgCost')}</dt>
          <dd className="mt-1 font-mono text-lg font-semibold tabular-nums text-foreground">
            {h.avg_price ? fmt(h.avg_price) : '—'}
          </dd>
          <dd className="mt-0.5 text-xs text-muted-foreground">{t('positionPerShare')}</dd>
        </div>
      </dl>
    </section>
  );
}
