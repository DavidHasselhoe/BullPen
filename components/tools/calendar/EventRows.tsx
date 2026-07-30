'use client';

import Link from 'next/link';
import type { ElementType } from 'react';
import { TrendingUp, DollarSign, Scissors, Rocket } from 'lucide-react';
import { cn } from '@/lib/utils';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { fmtEPS, fmtRevenue, fmtShortDate } from './format';
import type { UnifiedEvent, EventType, EarningsItem, DividendItem, SplitItem, IPOItem } from './types';

const TYPE_ICONS: Record<EventType, ElementType> = {
  earnings: TrendingUp,
  dividends: DollarSign,
  splits: Scissors,
  ipo: Rocket,
};

function TimeTag({ time }: { time?: string }) {
  if (time === 'BMO' || time === 'pre_market') {
    return (
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 uppercase tracking-wide leading-none">
        BMO
      </span>
    );
  }
  if (time === 'AMC' || time === 'after_close') {
    return (
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 uppercase tracking-wide leading-none">
        AMC
      </span>
    );
  }
  return null;
}

const IPO_STATUS_COLORS: Record<string, string> = {
  expected: 'bg-sky-500/10 text-sky-400',
  priced: 'bg-emerald-500/10 text-emerald-400',
  filed: 'bg-muted/60 text-muted-foreground',
  withdrawn: 'bg-red-500/10 text-red-400',
};

// ─── Compact (grid cell) ──────────────────────────────────────────────────────

function compactMetric(event: UnifiedEvent): string | null {
  if (event.type === 'earnings') {
    const e = event.raw as EarningsItem;
    return e.eps_estimate != null ? fmtEPS(e.eps_estimate) : null;
  }
  if (event.type === 'dividends') {
    const d = event.raw as DividendItem;
    return d.dividend_amount != null ? `$${d.dividend_amount.toFixed(2)}` : null;
  }
  if (event.type === 'splits') {
    const s = event.raw as SplitItem;
    return s.ratio ?? null;
  }
  const ipo = event.raw as IPOItem;
  if (ipo.price_from != null) return `$${ipo.price_from}${ipo.price_to != null ? `–${ipo.price_to}` : ''}`;
  return null;
}

/** One-line row for a compact grid cell (DayCell). */
export function CompactEventRow({ event, isMine }: { event: UnifiedEvent; isMine: boolean }) {
  const Icon = TYPE_ICONS[event.type];
  const metric = compactMetric(event);
  return (
    <div className="flex items-center gap-1.5 text-[11px] min-w-0">
      {isMine && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" aria-hidden />}
      <Icon className="h-3 w-3 text-muted-foreground/70 shrink-0" aria-hidden />
      <span className="font-bold font-mono text-foreground truncate">{event.symbol}</span>
      {metric && <span className="ml-auto text-muted-foreground/85 tabular-nums shrink-0">{metric}</span>}
    </div>
  );
}

// ─── Detail (day dialog) ──────────────────────────────────────────────────────

/** Full-detail row — same visual language as the pre-redesign per-type list rows. Used inside DayDetailDialog. */
export function DetailEventRow({ event }: { event: UnifiedEvent }) {
  if (event.type === 'earnings') {
    const e = event.raw as EarningsItem;
    return (
      <div className="flex items-center justify-between gap-2 sm:gap-4 py-2.5 px-2 -mx-2 rounded-lg hover:bg-muted/20 transition-colors group">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={slugToAssetPath(e.symbol)}
            className="font-bold text-sm font-mono text-foreground hover:text-primary transition-colors shrink-0 w-14 focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            {e.symbol}
          </Link>
          <div className="min-w-0 flex-1">
            {e.name && <p className="text-xs text-muted-foreground truncate leading-tight">{e.name}</p>}
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <TimeTag time={e.time} />
              {e.fiscal_quarter && (
                <span className="text-[9px] text-muted-foreground/80 font-mono leading-none">{e.fiscal_quarter}</span>
              )}
            </div>
          </div>
        </div>
        <div className="text-right text-xs shrink-0 space-y-0.5">
          {e.eps_estimate != null ? (
            <div>
              <span className="text-muted-foreground/80">EPS est. </span>
              <span className={cn('font-semibold tabular-nums', e.eps_estimate < 0 ? 'text-red-400' : 'text-foreground')}>
                {fmtEPS(e.eps_estimate)}
              </span>
            </div>
          ) : (
            <span className="text-muted-foreground/80">—</span>
          )}
          {e.revenue_estimate != null && (
            <div className="text-[10px] text-muted-foreground/80">Rev {fmtRevenue(e.revenue_estimate)}</div>
          )}
        </div>
      </div>
    );
  }

  if (event.type === 'dividends') {
    const d = event.raw as DividendItem;
    return (
      <div className="flex items-center justify-between gap-2 sm:gap-4 py-2.5 px-2 -mx-2 rounded-lg hover:bg-muted/20 transition-colors group">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={slugToAssetPath(d.symbol)}
            className="font-bold text-sm font-mono text-foreground hover:text-primary transition-colors shrink-0 w-14 focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            {d.symbol}
          </Link>
          <div className="min-w-0">
            {d.name && <p className="text-xs text-muted-foreground truncate">{d.name}</p>}
            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground/85 flex-wrap">
              {d.payment_date && <span>Pay {fmtShortDate(d.payment_date)}</span>}
              {d.frequency && <span className="capitalize px-1 bg-muted/60 rounded">{d.frequency}</span>}
            </div>
          </div>
        </div>
        {d.dividend_amount != null && (
          <span className="text-sm font-semibold tabular-nums text-emerald-500 shrink-0">
            ${d.dividend_amount.toFixed(4)}
          </span>
        )}
      </div>
    );
  }

  if (event.type === 'splits') {
    const s = event.raw as SplitItem;
    return (
      <div className="flex items-center justify-between gap-2 sm:gap-4 py-2.5 px-2 -mx-2 rounded-lg hover:bg-muted/20 transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={slugToAssetPath(s.symbol)}
            className="font-bold text-sm font-mono text-foreground hover:text-primary transition-colors shrink-0 w-14 focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            {s.symbol}
          </Link>
          {s.name && <p className="text-xs text-muted-foreground truncate">{s.name}</p>}
        </div>
        {s.ratio && (
          <span className="text-xs font-bold font-mono text-foreground shrink-0 bg-muted px-2 py-0.5 rounded">
            {s.ratio}
          </span>
        )}
      </div>
    );
  }

  // ipo
  const ipo = event.raw as IPOItem;
  return (
    <div className="flex items-center justify-between gap-2 sm:gap-4 py-2.5 px-2 -mx-2 rounded-lg hover:bg-muted/20 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        {ipo.symbol ? (
          <Link
            href={slugToAssetPath(ipo.symbol)}
            className="font-bold text-sm font-mono text-foreground hover:text-primary transition-colors shrink-0 w-14 focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            {ipo.symbol}
          </Link>
        ) : (
          <span className="font-bold text-sm font-mono text-muted-foreground shrink-0 w-14">—</span>
        )}
        <div className="min-w-0">
          {ipo.name && <p className="text-xs text-muted-foreground truncate">{ipo.name}</p>}
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {ipo.exchange && <span className="text-[10px] text-muted-foreground/80">{ipo.exchange}</span>}
            {ipo.status && (
              <span className={cn(
                'text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide leading-none capitalize',
                IPO_STATUS_COLORS[ipo.status.toLowerCase()] ?? 'bg-muted/60 text-muted-foreground',
              )}>
                {ipo.status}
              </span>
            )}
          </div>
        </div>
      </div>
      {(ipo.price_from != null || ipo.price_to != null) && (
        <div className="text-right text-xs shrink-0">
          <span className="font-semibold tabular-nums text-foreground">
            {ipo.price_from != null ? `$${ipo.price_from}` : ''}
            {ipo.price_from != null && ipo.price_to != null ? ' – ' : ''}
            {ipo.price_to != null ? `$${ipo.price_to}` : ''}
          </span>
        </div>
      )}
    </div>
  );
}
