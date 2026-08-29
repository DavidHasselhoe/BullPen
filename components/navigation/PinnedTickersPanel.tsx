'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { X, TrendingUp, TrendingDown } from 'lucide-react';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { TickerSelector, type SearchResult } from '@/components/tools/buy-here/TickerSelector';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useLivePrices } from '@/hooks/use-live-prices';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { cn } from '@/lib/utils';

const MAX_PINNED = 5;

function fmtPrice(v: number): string {
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface Props {
  /** Gates the live-price subscription — pinned tickers only fetch while the
   * containing popover/sheet is actually open, not on every page load. */
  active: boolean;
  /** Called when a pinned row is clicked, so the containing popover/sheet can close before navigating. */
  onNavigate?: () => void;
}

export function PinnedTickersPanel({ active, onNavigate }: Props) {
  const { t } = useTranslation('navigation');
  const { pinnedTickers, updatePinnedTickers } = useUserSettings();
  const livePrices = useLivePrices(active ? pinnedTickers : []);
  const [pendingSelect, setPendingSelect] = useState<SearchResult | null>(null);

  function addTicker(result: SearchResult | null) {
    if (!result) {
      setPendingSelect(null);
      return;
    }
    const upper = result.ticker.toUpperCase();
    if (!pinnedTickers.includes(upper) && pinnedTickers.length < MAX_PINNED) {
      updatePinnedTickers([...pinnedTickers, upper]);
    }
    // Reset immediately so the input clears back to a search box instead of
    // sitting on the just-picked company (TickerSelector is built for forms,
    // where staying selected is correct — here we want quick repeated adds).
    setPendingSelect(null);
  }

  function removeTicker(symbol: string) {
    updatePinnedTickers(pinnedTickers.filter((s) => s !== symbol));
  }

  return (
    <div className="space-y-3">
      {pinnedTickers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('pinnedEmptyHint')}
        </p>
      ) : (
        <div className="space-y-0.5">
          {pinnedTickers.map((symbol) => {
            const live = livePrices.get(symbol);
            const isUp = (live?.changePercent ?? 0) >= 0;
            return (
              <div
                key={symbol}
                className="group flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-accent/50"
              >
                <Link
                  href={slugToAssetPath(symbol)}
                  onClick={onNavigate}
                  className="flex min-w-0 flex-1 items-center gap-2.5"
                >
                  <CompanyLogo ticker={symbol} name={symbol} size={24} />
                  <span className="truncate text-sm font-medium text-foreground">{symbol}</span>
                  <span className="ml-auto flex shrink-0 items-center gap-2 font-mono text-xs tabular-nums">
                    {live ? (
                      <>
                        <span className="text-foreground">{fmtPrice(live.price)}</span>
                        <span
                          className={cn(
                            'flex items-center gap-0.5',
                            isUp ? 'text-emerald-500' : 'text-red-500'
                          )}
                        >
                          {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {Math.abs(live.changePercent ?? 0).toFixed(2)}%
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => removeTicker(symbol)}
                  aria-label={t('pinnedUnpinLabel', { symbol })}
                  title={t('pinnedUnpinLabel', { symbol })}
                  className="shrink-0 rounded p-0.5 text-muted-foreground/80 opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <TickerSelector
        value={pendingSelect}
        onChange={addTicker}
        placeholder={pinnedTickers.length >= MAX_PINNED ? t('pinnedUpToLimit', { max: MAX_PINNED }) : t('pinnedAddPlaceholder')}
        disabled={pinnedTickers.length >= MAX_PINNED}
      />
    </div>
  );
}
