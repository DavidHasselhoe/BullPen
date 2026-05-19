'use client';

import Link from 'next/link';
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
}

function formatPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
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
        'inline-block h-3 rounded-full bg-muted/40 animate-pulse',
        wide ? 'w-12' : 'w-8'
      )}
    />
  );
}

export function TickerCard({ item, href }: Props) {
  const live = useLivePrice(item.symbol);

  // Live SSE tick wins; fall back to the optional `previousClose` seed.
  const rawPrice = live?.price ?? item.previousClose ?? null;
  const rawChange = live?.changePercent ?? null;
  const price: number | null = rawPrice != null && isFinite(rawPrice) ? rawPrice : null;
  const changePct: number | null = rawChange != null && isFinite(rawChange) ? rawChange : null;

  const direction: 'up' | 'down' | 'flat' =
    changePct == null ? 'flat' : changePct > 0.01 ? 'up' : changePct < -0.01 ? 'down' : 'flat';

  const dirClass =
    direction === 'up'
      ? 'text-emerald-400'
      : direction === 'down'
      ? 'text-red-400'
      : 'text-muted-foreground/60';

  const DirIcon = direction === 'up' ? ArrowUp : direction === 'down' ? ArrowDown : Minus;

  const computedHref = href ?? slugToAssetPath(item.ticker);
  const label = `${item.ticker} — ${item.name}${changePct != null ? `, ${formatPct(changePct)}` : ''}`;

  return (
    <Link
      href={computedHref}
      aria-label={label}
      className={cn(
        'group flex flex-col justify-between shrink-0',
        'w-[168px] h-[100px] rounded-xl border border-border/50 bg-card/50',
        'p-3 transition-all duration-200',
        'hover:border-border hover:bg-card hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20',
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

      <div className="text-[11px] text-muted-foreground/70 truncate" title={item.name}>
        {item.name}
      </div>

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
