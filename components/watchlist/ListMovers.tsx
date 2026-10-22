'use client';

import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { MoverRow, useInlineWhy } from '@/components/dashboard/MoverRow';
import { AiPaywallDialog } from '@/components/billing/AiPaywallDialog';
import { useAIPanel } from '@/components/ai/AIPanelProvider';
import { useWhyTodayGate } from '@/hooks/use-why-today-gate';
import { useEntitlements } from '@/hooks/use-entitlements';
import { useTradingSession } from '@/hooks/use-trading-session';
import { trackEvent } from '@/lib/analytics/track';
import { WHY_TODAY_MIN_MOVE } from '@/lib/ai/why-today-shared';
import { displayCompanyName } from '@/lib/market-data/company-name';
import type { HomeMover } from '@/hooks/use-home-portfolio';

/** Movers shown with Bull's explanation. Pro explains all of them, free the first. */
const MAX_MOVERS = 3;

interface ListMoversProps {
  listName: string;
  items: { symbol: string; company_name: string; display_name?: string | null; logo_url?: string | null }[];
  /** Live quotes, for what the rows show. */
  quotes: Record<string, { price: number; change: number; changePercent: number } | null | undefined>;
  /** The page's one batch of quotes, for which stocks get explained. Undefined until it has loaded. */
  seed: Record<string, { price: number; change: number; changePercent: number }> | undefined;
}

/**
 * "What moved your list": the list's biggest moves today with Bull's
 * explanation underneath, then a couple of questions for Bull about the list.
 *
 * No new AI call. The explanations come from the shared Why Today cache
 * behind Home's "Biggest moves" (/api/ai/why-today/inline): one per stock per
 * trading day per language for everyone, so the cost grows with the stocks
 * that moved, not with people or lists. Pro gets all three, free the biggest,
 * and the per-account daily caps there apply here too.
 */
export function ListMovers({ listName, items, quotes, seed }: ListMoversProps) {
  const { t } = useTranslation('watchlist');
  const { t: tHome } = useTranslation('discover');
  const { open } = useAIPanel();
  const session = useTradingSession();
  const canWhy = useEntitlements().can('why_today');
  const { requestWhyToday, paywallOpen, setPaywallOpen, paywallQuota } = useWhyTodayGate();

  // Picked from the page's one batch of seed quotes, never the live ticks.
  // Picking from live prices let a partly loaded page call the second-biggest
  // mover the biggest (a free account's one explanation went to the wrong
  // stock, and was paid for), and every tick could reshuffle the set and ask
  // again. The rows still show the live move.
  const picked: HomeMover[] = !seed ? [] : items
    .flatMap((i) => {
      const q = seed[i.symbol];
      return q && Math.abs(q.changePercent) >= WHY_TODAY_MIN_MOVE
        ? [{
            symbol: i.symbol,
            name: i.display_name || displayCompanyName(i.company_name || i.symbol, i.symbol),
            logoUrl: i.logo_url ?? null,
            held: false,
            price: q.price,
            change: q.change,
            changePercent: q.changePercent,
          }]
        : [];
    })
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
    .slice(0, MAX_MOVERS);
  const whyFor = useInlineWhy(picked);
  const movers = picked.map((m) => {
    const q = quotes[m.symbol];
    return q ? { ...m, price: q.price, change: q.change, changePercent: q.changePercent } : m;
  });

  // Tickers go into the question the person chooses to send, nothing more.
  const tickers = items.map((i) => i.symbol).slice(0, 15).join(', ');
  const chips = [
    { id: 'list_read', label: t('moversAskList'), query: t('moversAskListQuery', { name: listName, tickers }) },
    ...(movers[0]
      ? [{ id: 'list_top_mover', label: tHome(movers[0].changePercent > 0 ? 'bullChipWhyUp' : 'bullChipWhyDown', { ticker: movers[0].symbol }), query: tHome(movers[0].changePercent > 0 ? 'bullChipWhyUp' : 'bullChipWhyDown', { ticker: movers[0].symbol }) }]
      : []),
  ];

  return (
    <section aria-label={t('moversAriaLabel')} className="flex flex-col gap-2">
      {/* Nothing moved enough to explain: just the questions for Bull. */}
      {movers.length > 0 && (
        <h2 className="text-sm font-semibold text-foreground">
          {session === 'closed' ? tHome('homeMoversTitleLast') : tHome('homeMoversTitle')}
        </h2>
      )}
      {movers.length > 0 && (
        <ul className="rounded-xl bg-muted/40 py-1">
          {movers.map((m) => (
            <MoverRow
              key={m.symbol}
              mover={m}
              source="watchlist"
              why={whyFor(m.symbol)}
              onWhy={() => {
                trackEvent('watchlist_why_clicked', { ticker: m.symbol, pro: canWhy });
                requestWhyToday({ ticker: m.symbol, price: m.price, change: m.change, changePct: m.changePercent });
              }}
            />
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          {tHome('bullChipsLabel')}
        </span>
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              trackEvent('watchlist_bull_chip', { chip: c.id });
              open({ query: c.query });
            }}
            className="h-9 rounded-md border border-border/60 bg-card px-3 text-xs font-medium text-foreground transition-colors hover:border-border hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8"
          >
            {c.label}
          </button>
        ))}
      </div>
      <AiPaywallDialog
        open={paywallOpen}
        onOpenChange={setPaywallOpen}
        featureName={tHome('whyTodayWidgetFeatureName')}
        quota={paywallQuota}
      />
    </section>
  );
}
