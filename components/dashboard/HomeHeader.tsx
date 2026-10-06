'use client';

import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { WelcomeMessage } from '@/components/ui/WelcomeMessage';
import { useMarketStatus } from '@/hooks/use-market-status';
import { useHomePortfolio } from '@/hooks/use-home-portfolio';
import { useTradingSession } from '@/hooks/use-trading-session';
import { useAuth } from '@/hooks/use-auth';
import { formatTimeUntilShort } from '@/lib/market/market-status';
import { cn } from '@/lib/utils';
import type { InitialWelcome } from '@/lib/dashboard/greeting';
import type { IndexQuote } from '@/lib/discover/discover-config';

/** The three a beginner has heard of. Russell 2000 stays on Discover. */
const HOME_INDICES = ['SPY', 'QQQ', 'DIA'];

const pct = (n: number) => `${Math.abs(n).toFixed(2)}%`;

/**
 * "Am I okay?" answered in one sentence before anything else on the page:
 * how the portfolio did and how that compares to the market, built from the
 * same numbers as the card below it. No model writes this; it is a template
 * over real quotes, so it can never say something the numbers don't.
 */
function useStatusSentence(spyPct: number | null): string | null {
  const { t } = useTranslation('discover');
  const { portfolio, movers, hasHoldings, session } = useHomePortfolio();

  if (hasHoldings && portfolio) {
    const p = portfolio.todayPct;
    const last = session === 'closed';
    const dir = Math.abs(p) < 0.01 ? 'Flat' : p > 0 ? 'Up' : 'Down';
    const first = t(`homeStatus${last ? 'Last' : 'Today'}${dir}`, { pct: pct(p) });
    // Only compare like with like: outside the regular session the portfolio
    // is priced with extended hours, while the index quotes are regular-session.
    if (spyPct == null || session !== 'regular') return first;
    const gap = p - spyPct;
    const vs = Math.abs(gap) < 0.25 ? 'Same' : gap > 0 ? 'Ahead' : 'Behind';
    return `${first} ${t(`homeStatusVs${vs}`, { pct: `${spyPct >= 0 ? '+' : '−'}${pct(spyPct)}` })}`;
  }

  const top = movers[0];
  if (top && Math.abs(top.changePercent) >= 0.01) {
    return t(top.changePercent > 0 ? 'homeStatusWatchUp' : 'homeStatusWatchDown', {
      ticker: top.symbol,
      pct: pct(top.changePercent),
    });
  }
  return null;
}

export function HomeHeader({
  initialWelcome,
  showWelcome,
  indices,
}: {
  initialWelcome?: InitialWelcome | null;
  showWelcome: boolean;
  indices: IndexQuote[];
}) {
  const { t } = useTranslation('discover');
  const { data: nyse } = useMarketStatus('NYSE');
  const shown = HOME_INDICES.map((s) => indices.find((i) => i.symbol === s)).filter(
    (i): i is IndexQuote => !!i && i.changePct != null,
  );
  const spy = indices.find((i) => i.symbol === 'SPY')?.changePct ?? null;
  const sentence = useStatusSentence(spy);
  const { isLoading: homeLoading } = useHomePortfolio();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  // Index quotes are regular-session numbers. Outside it they are the last
  // session's move, and sat unlabelled under "up 0.72% today" before the open.
  const lastClose = useTradingSession() !== 'regular';

  const marketOpen = !!nyse && !nyse.isHoliday && nyse.isOpen;
  const marketLine = nyse
    ? marketOpen
      ? t('homeMarketClosesIn', { time: formatTimeUntilShort(nyse.timeUntilClose ?? 0) })
      : t('homeMarketOpensIn', { time: formatTimeUntilShort(nyse.timeUntilOpen ?? 0) })
    : null;

  return (
    <header className="space-y-3">
      {showWelcome && <WelcomeMessage initial={initialWelcome} />}
      {!authLoading && !isAuthenticated && (
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('homeSignedOutTitle')}</h1>
      )}
      {sentence ? (
        <p className="max-w-[65ch] text-sm leading-relaxed text-foreground/80">{sentence}</p>
      ) : (
        // Hold the sentence's line while prices load, so the market line
        // below doesn't jump when it arrives.
        homeLoading && <div className="flex h-[1.4rem] items-center" aria-hidden><div className="h-3.5 w-72 max-w-full animate-shimmer rounded" /></div>
      )}

      {(shown.length > 0 || marketLine) && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 text-sm">
          {lastClose && shown.length > 0 && (
            <span className="-mr-2 text-xs text-muted-foreground">{t('homeIndicesLastClose')}</span>
          )}
          {shown.map((i) => {
            const up = i.changePct! > 0.005;
            const down = i.changePct! < -0.005;
            const Icon = up ? ArrowUp : down ? ArrowDown : Minus;
            return (
              <span key={i.symbol} className="inline-flex items-center gap-1.5">
                <span className="text-muted-foreground">{i.label}</span>
                <span
                  className={cn(
                    'inline-flex items-center gap-0.5 font-mono tabular-nums font-medium',
                    up ? 'text-emerald-700 dark:text-emerald-400' : down ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground',
                  )}
                >
                  <Icon className="h-3 w-3" aria-hidden />
                  {up ? '+' : down ? '−' : ''}
                  {pct(i.changePct!)}
                </span>
              </span>
            );
          })}
          {marketLine && (
            <span className="inline-flex items-center gap-2 text-muted-foreground sm:ml-auto">
              <span
                aria-hidden
                className={cn('h-1.5 w-1.5 shrink-0 rounded-full', marketOpen ? 'bg-emerald-500' : 'bg-muted-foreground/60')}
              />
              {marketLine}
            </span>
          )}
        </div>
      )}
    </header>
  );
}
