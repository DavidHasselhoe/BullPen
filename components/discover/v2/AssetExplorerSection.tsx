'use client';

import { Layers, Coins, Bitcoin } from 'lucide-react';
import { StockCarouselRail } from './StockCarouselRail';
import { ETF_THEMES } from '@/lib/discover/discover-config';
import { symbolToSlug } from '@/lib/assets/asset-type';
import type { DiscoverFeed, TickerItem } from '@/lib/discover/discover-config';

interface Props {
  etfs: DiscoverFeed['etfs'];
  commodities: DiscoverFeed['commodities'];
  crypto: DiscoverFeed['crypto'];
}

/** Crypto / commodity items use slash-pair canonical symbols (BTC/USD). Route them via /asset/<slug>. */
function pairHref(item: TickerItem): string {
  return `/asset/${symbolToSlug(item.symbol)}`;
}

/** ETFs route to /etf/<TICKER> */
function etfHref(item: TickerItem): string {
  return `/etf/${item.ticker.toUpperCase()}`;
}

export function AssetExplorerSection({ etfs, commodities, crypto }: Props) {
  return (
    <section aria-labelledby="assets-heading" className="space-y-8">
      <div>
        <h2 id="assets-heading" className="text-sm font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1">
          Beyond Stocks
        </h2>
        <p className="text-xs text-muted-foreground/45">
          ETFs grouped by theme, commodities, and major cryptocurrencies.
        </p>
      </div>

      {/* ETFs — one rail per theme */}
      {ETF_THEMES.map((theme) => {
        const items = etfs[theme.key] ?? [];
        if (items.length === 0) return null;
        return (
          <StockCarouselRail
            key={theme.key}
            title={theme.label}
            subtitle={theme.tagline}
            accent="bg-violet-500"
            icon={<Layers className="h-4 w-4" />}
            items={items}
            meta="ETFs"
            hrefForItem={etfHref}
          />
        );
      })}

      {/* Commodities */}
      {commodities.length > 0 && (
        <StockCarouselRail
          title="Commodities"
          subtitle="Precious metals, energy, and softs"
          accent="bg-amber-500"
          icon={<Coins className="h-4 w-4" />}
          items={commodities}
          meta="Spot"
          hrefForItem={pairHref}
        />
      )}

      {/* Crypto */}
      {crypto.length > 0 && (
        <StockCarouselRail
          title="Crypto Majors"
          subtitle="Top-cap digital assets, 24/7 markets"
          accent="bg-orange-500"
          icon={<Bitcoin className="h-4 w-4" />}
          items={crypto}
          meta="Crypto"
          hrefForItem={pairHref}
        />
      )}
    </section>
  );
}
