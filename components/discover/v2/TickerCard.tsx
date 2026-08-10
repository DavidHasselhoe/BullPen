'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { cn } from '@/lib/utils';
import { useLivePrice } from './LivePriceContext';
import type { TickerItem } from '@/lib/discover/discover-config';

interface Props {
  item: TickerItem;
  /** Optional href override — for non-stock symbols like crypto/commodities where slugToAssetPath needs the canonical symbol */
  href?: string;
  /**
   * Show the item's `reason` line instead of the company name. Curated
   * collections earn their place by carrying why the name is on the list —
   * "12.4× forward earnings vs 19.8× typical for Technology" is a reason to
   * click; a company name the reader already knows is not.
   */
  showReason?: boolean;
}

// Pinned to en-US: these are USD prices, and leaving the locale to the runtime
// means a non-US server/browser locale renders "2 957" (space-grouped) instead
// of "2,957" for anything over $1,000 — invisible while every listed price was
// under four digits, but real once a 52-week list surfaces something like AZO.
function formatPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (p >= 1) return p.toFixed(2);
  if (p >= 0.01) return p.toFixed(4);
  return p.toFixed(6);
}

function formatPct(p: number): string {
  const sign = p > 0 ? '+' : '';
  return `${sign}${p.toFixed(2)}%`;
}

/** Subtle shimmer placeholder used while live prices haven't streamed in yet. */
function PriceSkeleton({ wide = false }: { wide?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block h-3 rounded-full animate-shimmer',
        wide ? 'w-12' : 'w-8'
      )}
    />
  );
}

export function TickerCard({ item, href, showReason = false }: Props) {
  const live = useLivePrice(item.symbol);
  const queryClient = useQueryClient();
  const prefetch = useCallback(() => {
    queryClient.prefetchQuery({
      queryKey: ['stock-snapshot', item.ticker],
      queryFn: () => fetch(`/api/stock/${item.ticker}/snapshot`).then(r => r.json()),
      staleTime: 30_000,
    });
  }, [queryClient, item.ticker]);

  // Live SSE tick wins; fall back to server-hydrated seeds so the card never
  // renders empty (markets closed → no WS ticks; SSE seed not yet delivered).
  const rawPrice = live?.price ?? item.previousClose ?? null;
  const rawChange = live?.changePercent ?? item.changePercent ?? null;
  const price: number | null = rawPrice != null && isFinite(rawPrice) ? rawPrice : null;
  const changePct: number | null = rawChange != null && isFinite(rawChange) ? rawChange : null;

  const direction: 'up' | 'down' | 'flat' =
    changePct == null ? 'flat' : changePct > 0.01 ? 'up' : changePct < -0.01 ? 'down' : 'flat';

  const dirClass =
    direction === 'up'
      ? 'text-emerald-400'
      : direction === 'down'
      ? 'text-red-400'
      : 'text-muted-foreground/80';

  const DirIcon = direction === 'up' ? ArrowUp : direction === 'down' ? ArrowDown : Minus;

  const computedHref = href ?? slugToAssetPath(item.ticker);
  const label = `${item.ticker}, ${item.name}${changePct != null ? `, ${formatPct(changePct)}` : ''}`;

  return (
    <Link
      href={computedHref}
      aria-label={label}
      onMouseEnter={prefetch}
      className={cn(
        // Fluid width: every surface that renders this is now a grid, so the
        // grid owns the sizing. (It used to be pinned to a 168px rail slot.)
        'group flex h-full w-full min-w-0 flex-col justify-between',
        'min-h-[100px] rounded-xl border border-border/50 bg-card/50',
        'p-3 transition-all duration-200',
        'hover:border-border hover:bg-card hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20',
        'active:scale-[0.97] active:shadow-none active:translate-y-0',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <CompanyLogo
          name={item.name}
          ticker={item.ticker}
          logoUrl={item.logoUrl ?? null}
          size={24}
          className="shrink-0"
        />
        <span className="font-mono text-[13px] font-bold text-foreground truncate">
          {item.ticker}
        </span>
      </div>

      {showReason && item.reason ? (
        <div className="text-[11px] leading-tight text-muted-foreground/80 line-clamp-2" title={item.reason}>
          {item.reason}
        </div>
      ) : (
        <div className="text-[11px] text-muted-foreground/85 truncate" title={item.name}>
          {item.name}
        </div>
      )}

      <div className="flex items-baseline justify-between gap-1.5">
        {price != null ? (
          <span className="text-sm font-semibold tabular-nums text-foreground/90">
            {formatPrice(price)}
          </span>
        ) : (
          <PriceSkeleton wide />
        )}

        {changePct != null ? (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums',
              dirClass,
            )}
          >
            <DirIcon className="h-3 w-3" strokeWidth={2.5} aria-hidden />
            {formatPct(changePct)}
          </span>
        ) : (
          <PriceSkeleton />
        )}
      </div>
    </Link>
  );
}
