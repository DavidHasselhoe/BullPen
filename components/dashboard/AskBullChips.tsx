'use client';

import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { useAIPanel } from '@/components/ai/AIPanelProvider';
import { trackEvent } from '@/lib/analytics/track';
import type { HomeMover } from '@/hooks/use-home-portfolio';

interface Chip {
  id: string;
  label: string;
  query: string;
}

/**
 * Three questions worth asking Bull right now, written from what is on the
 * screen: the biggest mover, what you hold, the market today.
 *
 * Holdings reach Bull only as the tickers written into the question the
 * person chooses to send, never as quantities or values. Bull's own portfolio
 * access stays behind its opt-in in Settings.
 */
export function AskBullChips({ movers, heldSymbols }: { movers: HomeMover[]; heldSymbols: string[] }) {
  const { t } = useTranslation('discover');
  const { open } = useAIPanel();

  const chips: Chip[] = [];
  const top = movers[0];
  if (top && Math.abs(top.changePercent) >= 1) {
    const q = t(top.changePercent > 0 ? 'bullChipWhyUp' : 'bullChipWhyDown', { ticker: top.symbol });
    chips.push({ id: 'why_mover', label: q, query: q });
  }
  if (heldSymbols.length >= 2) {
    chips.push({
      id: 'diversified',
      label: t('bullChipDiversified'),
      query: t('bullChipDiversifiedQuery', { tickers: heldSymbols.slice(0, 12).join(', ') }),
    });
  } else {
    chips.push({ id: 'index_fund', label: t('bullChipIndexFund'), query: t('bullChipIndexFund') });
  }
  chips.push({ id: 'market_today', label: t('bullChipMarket'), query: t('bullChipMarketQuery') });

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        {t('bullChipsLabel')}
      </span>
      {chips.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => {
            trackEvent('home_bull_chip', { chip: c.id });
            open({ query: c.query });
          }}
          className="h-9 rounded-md border border-border/60 bg-card px-3 text-xs font-medium text-foreground transition-colors hover:border-border hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8"
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
