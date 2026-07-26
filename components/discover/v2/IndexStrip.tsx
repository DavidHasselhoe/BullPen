'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { Sparkline } from '@/components/viz/Sparkline';
import { cn } from '@/lib/utils';
import type { IndexQuote } from '@/lib/discover/discover-config';

/**
 * The four numbers that answer "what is the market doing right now".
 *
 * Each tile carries a plain-language hint in visible copy rather than a hover
 * tooltip — "Russell 2000" means nothing to the beginner-to-intermediate reader
 * this product is for, and a hint they have to discover by hovering isn't a
 * hint at all (and doesn't exist on touch).
 */
export function IndexStrip({ indices }: { indices: IndexQuote[] }) {
  const symbols = indices.map((i) => i.symbol);
  const sparkKey = [...symbols].sort().join(',');

  const { data: sparklines } = useQuery<Record<string, number[]>>({
    queryKey: ['discover-index-sparklines', sparkKey],
    queryFn: async () => {
      if (!sparkKey) return {};
      const res = await fetch(`/api/market/movers-sparklines?symbols=${encodeURIComponent(sparkKey)}`);
      if (!res.ok) return {};
      const json = await res.json();
      return (json.sparklines as Record<string, number[]>) ?? {};
    },
    enabled: symbols.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  if (indices.length === 0) return null;

  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {indices.map((index) => (
        <li key={index.symbol}>
          <IndexTile index={index} series={sparklines?.[index.symbol]} />
        </li>
      ))}
    </ul>
  );
}

/**
 * US markets quote in dollars with a decimal point, so the locale is pinned to
 * en-US rather than the viewer's. Left to the browser, a Norwegian or German
 * reader gets "738,93" for a USD price while every ticker card beside it shows
 * "738.93" — same number, two notations, on one screen.
 */
function fmtPrice(price: number): string {
  return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function IndexTile({ index, series }: { index: IndexQuote; series?: number[] }) {
  const pct = index.changePct;
  const up = pct != null && pct > 0.005;
  const down = pct != null && pct < -0.005;
  const DirIcon = up ? ArrowUp : down ? ArrowDown : Minus;

  const tone = up ? 'text-emerald-400' : down ? 'text-red-400' : 'text-muted-foreground/70';

  return (
    <div className="rounded-xl border border-border/50 bg-card/40 px-3.5 py-3 transition-colors duration-200 hover:border-border">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-muted-foreground">{index.label}</span>
        {series && series.length > 1 && (
          <Sparkline
            data={series}
            direction={up ? 'up' : down ? 'down' : 'neutral'}
            width={44}
            height={14}
            className="h-3.5 w-11 shrink-0"
            ariaLabel={`${index.label} trend today`}
          />
        )}
      </div>

      <div className="mt-1.5 flex items-baseline justify-between gap-2">
        <span className="font-mono text-base font-semibold tabular-nums text-foreground">
          {index.price != null ? fmtPrice(index.price) : '—'}
        </span>
        <span className={cn('flex items-center gap-0.5 font-mono text-xs font-semibold tabular-nums', tone)}>
          {pct != null && <DirIcon className="h-3 w-3" strokeWidth={2.5} aria-hidden />}
          {pct != null ? `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct).toFixed(2)}%` : '—'}
        </span>
      </div>

      <p className="mt-1 text-[10px] leading-tight text-muted-foreground/55">{index.hint}</p>
    </div>
  );
}
