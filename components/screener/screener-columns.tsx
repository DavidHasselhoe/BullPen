'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { ScreenerRow } from '@/app/api/screener/route';
import type { HeatmapPriceEntry } from '@/hooks/use-heatmap-stream';

// ─── Formatters ───────────────────────────────────────────────────────────────

export function fmtCap(v: number | null): string {
  if (v == null) return '—';
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toFixed(0)}`;
}

function fmtNum(v: number | null, decimals = 2): string {
  if (v == null) return '—';
  return v.toFixed(decimals);
}

function fmtPct(v: number | null, decimals = 1): string {
  if (v == null) return '—';
  return `${v.toFixed(decimals)}%`;
}

function fmtPrice(v: number | null): string {
  if (v == null) return '—';
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtVolume(v: number | null): string {
  if (v == null) return '—';
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(Math.round(v));
}

// ─── RVOL ─────────────────────────────────────────────────────────────────────
// Relative volume = live cumulative day volume / 90-day average volume.
// Null unless we have both a live volume tick and a stored avg baseline
// (i.e. only meaningful during market hours).

export function computeRvol(row: ScreenerRow, live?: HeatmapPriceEntry): number | null {
  if (!live?.volume || !row.avg_volume || row.avg_volume <= 0) return null;
  return live.volume / row.avg_volume;
}

const RVOL_SURGE = 2; // ≥2× average = unusual activity

// ─── Column registry ──────────────────────────────────────────────────────────

export type ColumnGroup = 'health' | 'price' | 'volume' | 'valuation' | 'profitability' | 'risk';

export const GROUP_LABELS: Record<ColumnGroup, string> = {
  health: 'Health Score',
  price: 'Price',
  volume: 'Volume',
  valuation: 'Valuation',
  profitability: 'Profitability',
  risk: 'Risk & Income',
};

export interface ScreenerColumn {
  key: string;
  label: string;
  tip: string;
  group: ColumnGroup;
  defaultVisible: boolean;
  /** Fixed column width in px — keeps layout stable regardless of cell content. */
  width: number;
  /** Numeric value used for sorting (reads live or static data). null sorts last. */
  getValue: (row: ScreenerRow, live?: HeatmapPriceEntry) => number | null;
  /** Display cell content. */
  render: (row: ScreenerRow, live?: HeatmapPriceEntry) => ReactNode;
}

const GRADE_STYLES: Record<string, string> = {
  A: 'bg-emerald-500/15 text-emerald-500',
  B: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  C: 'bg-amber-400/15 text-amber-500',
  D: 'bg-orange-500/15 text-orange-500',
  F: 'bg-red-500/15 text-red-500',
};

export const SCREENER_COLUMNS: ScreenerColumn[] = [
  // ── Health Score ──
  {
    key: 'health_score',
    label: 'Health',
    tip: 'BullPen financial health score (0–100) — rates profitability, balance sheet strength, valuation, growth, and market risk.',
    group: 'health',
    defaultVisible: true,
    width: 88,
    getValue: (row) => row.health_score,
    render: (row) => {
      const score = row.health_score;
      const grade = row.health_score_grade;
      if (score == null || !grade) return <span className="text-muted-foreground/40">—</span>;
      return (
        <span className="inline-flex items-center gap-1.5">
          <span className="tabular-nums font-semibold text-xs">{score}</span>
          <span className={cn('rounded px-1 py-px text-[10px] font-bold leading-tight', GRADE_STYLES[grade] ?? 'bg-muted text-muted-foreground')}>
            {grade}
          </span>
        </span>
      );
    },
  },

  // ── Price ──
  {
    key: 'price',
    label: 'Price',
    tip: 'Live price',
    group: 'price',
    defaultVisible: true,
    width: 92,
    getValue: (_r, live) => live?.price ?? null,
    render: (_r, live) => (live ? fmtPrice(live.price) : '—'),
  },
  {
    key: 'change_pct',
    label: '% Chg',
    tip: 'Day change %',
    group: 'price',
    defaultVisible: true,
    width: 84,
    getValue: (_r, live) => live?.changePercent ?? null,
    render: (_r, live) => {
      if (!live) return '—';
      const pct = live.changePercent ?? 0;
      return (
        <span className={cn(pct > 0 && 'text-emerald-500', pct < 0 && 'text-red-500')}>
          {pct > 0 ? '+' : ''}{pct.toFixed(2)}%
        </span>
      );
    },
  },

  // ── Volume ──
  {
    key: 'rvol',
    label: 'RVOL',
    tip: "Relative volume — today's volume vs 90-day average. ≥2× = unusual activity. Green = bought on the move, red = sold. Needs live market data.",
    group: 'volume',
    defaultVisible: true,
    width: 72,
    getValue: (row, live) => computeRvol(row, live),
    render: (row, live) => {
      const rvol = computeRvol(row, live);
      if (rvol == null) return '—';
      const surge = rvol >= RVOL_SURGE;
      const up = (live?.changePercent ?? 0) >= 0;
      return (
        <span
          className={cn(
            'inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
            surge && up && 'bg-emerald-500/15 text-emerald-500',
            surge && !up && 'bg-red-500/15 text-red-500',
            !surge && 'text-muted-foreground',
          )}
        >
          {rvol.toFixed(1)}×
        </span>
      );
    },
  },
  {
    key: 'volume',
    label: 'Volume',
    tip: "Today's cumulative trading volume (live)",
    group: 'volume',
    defaultVisible: false,
    width: 80,
    getValue: (_r, live) => live?.volume ?? null,
    render: (_r, live) => fmtVolume(live?.volume ?? null),
  },
  {
    key: 'avg_volume',
    label: 'Avg Vol',
    tip: '90-day average daily volume',
    group: 'volume',
    defaultVisible: false,
    width: 80,
    getValue: (row) => row.avg_volume,
    render: (row) => fmtVolume(row.avg_volume),
  },

  // ── Valuation ──
  {
    key: 'market_cap',
    label: 'Mkt Cap',
    tip: 'Market capitalisation',
    group: 'valuation',
    defaultVisible: true,
    width: 84,
    getValue: (row) => row.market_cap,
    render: (row) => fmtCap(row.market_cap),
  },
  {
    key: 'pe_ratio',
    label: 'P/E',
    tip: 'Trailing P/E ratio',
    group: 'valuation',
    defaultVisible: true,
    width: 72,
    getValue: (row) => row.pe_ratio,
    render: (row) => (row.pe_ratio != null && row.pe_ratio > 0 ? fmtNum(row.pe_ratio, 1) : '—'),
  },
  {
    key: 'forward_pe',
    label: 'Fwd P/E',
    tip: 'Forward P/E (next 12 months estimate)',
    group: 'valuation',
    defaultVisible: true,
    width: 80,
    getValue: (row) => row.forward_pe,
    render: (row) => (row.forward_pe != null && row.forward_pe > 0 ? fmtNum(row.forward_pe, 1) : '—'),
  },
  {
    key: 'pb_ratio',
    label: 'P/B',
    tip: 'Price-to-book ratio',
    group: 'valuation',
    defaultVisible: true,
    width: 72,
    getValue: (row) => row.pb_ratio,
    render: (row) => (row.pb_ratio != null && row.pb_ratio > 0 ? fmtNum(row.pb_ratio, 2) : '—'),
  },
  {
    key: 'ps_ratio',
    label: 'P/S',
    tip: 'Price-to-sales ratio (TTM)',
    group: 'valuation',
    defaultVisible: false,
    width: 68,
    getValue: (row) => row.ps_ratio,
    render: (row) => (row.ps_ratio != null && row.ps_ratio > 0 ? fmtNum(row.ps_ratio, 2) : '—'),
  },
  {
    key: 'ev_to_ebitda',
    label: 'EV/EB',
    tip: 'Enterprise value to EBITDA (EV/EBITDA)',
    group: 'valuation',
    defaultVisible: true,
    width: 72,
    getValue: (row) => row.ev_to_ebitda,
    render: (row) => (row.ev_to_ebitda != null && row.ev_to_ebitda > 0 ? fmtNum(row.ev_to_ebitda, 1) : '—'),
  },
  {
    key: 'eps_ttm',
    label: 'EPS',
    tip: 'Earnings per share, trailing 12 months',
    group: 'valuation',
    defaultVisible: true,
    width: 76,
    getValue: (row) => row.eps_ttm,
    render: (row) => (
      <span className={cn(row.eps_ttm != null && row.eps_ttm < 0 && 'text-red-500')}>
        {row.eps_ttm != null ? `$${row.eps_ttm.toFixed(2)}` : '—'}
      </span>
    ),
  },

  // ── Profitability ──
  {
    key: 'profit_margin',
    label: 'Margin',
    tip: 'Net profit margin',
    group: 'profitability',
    defaultVisible: true,
    width: 76,
    getValue: (row) => (row.profit_margin != null ? row.profit_margin * 100 : null),
    render: (row) => (
      <span className={cn(
        row.profit_margin != null && row.profit_margin < 0 && 'text-red-500',
        row.profit_margin != null && row.profit_margin > 0.2 && 'text-emerald-600 dark:text-emerald-400',
      )}>
        {row.profit_margin != null ? fmtPct(row.profit_margin * 100, 1) : '—'}
      </span>
    ),
  },
  {
    key: 'revenue_growth_yoy',
    label: 'Rev Gth',
    tip: 'Quarterly revenue growth YoY',
    group: 'profitability',
    defaultVisible: true,
    width: 80,
    getValue: (row) => row.revenue_growth_yoy,
    render: (row) => (
      <span className={cn(
        row.revenue_growth_yoy != null && row.revenue_growth_yoy < 0 && 'text-red-500',
        row.revenue_growth_yoy != null && row.revenue_growth_yoy > 10 && 'text-emerald-600 dark:text-emerald-400',
      )}>
        {row.revenue_growth_yoy != null ? fmtPct(row.revenue_growth_yoy, 1) : '—'}
      </span>
    ),
  },
  {
    key: 'earnings_growth_yoy',
    label: 'Earn Gth',
    tip: 'Quarterly earnings growth YoY',
    group: 'profitability',
    defaultVisible: false,
    width: 84,
    getValue: (row) => row.earnings_growth_yoy,
    render: (row) => (
      <span className={cn(
        row.earnings_growth_yoy != null && row.earnings_growth_yoy < 0 && 'text-red-500',
        row.earnings_growth_yoy != null && row.earnings_growth_yoy > 10 && 'text-emerald-600 dark:text-emerald-400',
      )}>
        {row.earnings_growth_yoy != null ? fmtPct(row.earnings_growth_yoy, 1) : '—'}
      </span>
    ),
  },

  // ── Risk & Income ──
  {
    key: 'beta',
    label: 'Beta',
    tip: '5Y monthly beta',
    group: 'risk',
    defaultVisible: true,
    width: 68,
    getValue: (row) => row.beta,
    render: (row) => (
      <span className={cn(
        row.beta != null && row.beta > 1.5 && 'text-orange-500',
        row.beta != null && row.beta < 0.5 && 'text-blue-500',
      )}>
        {fmtNum(row.beta, 2)}
      </span>
    ),
  },
  {
    key: 'dividend_yield',
    label: 'Div Yld',
    tip: 'Forward annual dividend yield',
    group: 'risk',
    defaultVisible: true,
    width: 76,
    getValue: (row) => row.dividend_yield,
    render: (row) => (row.dividend_yield != null && row.dividend_yield > 0 ? fmtPct(row.dividend_yield, 2) : '—'),
  },
  {
    key: 'payout_ratio',
    label: 'Payout',
    tip: 'Dividend payout ratio',
    group: 'risk',
    defaultVisible: false,
    width: 72,
    getValue: (row) => row.payout_ratio,
    render: (row) => (row.payout_ratio != null && row.payout_ratio > 0 ? fmtPct(row.payout_ratio, 0) : '—'),
  },

  // ── Price levels ──
  {
    key: 'week52_high',
    label: '52W Hi',
    tip: '52-week high price',
    group: 'price',
    defaultVisible: true,
    width: 92,
    getValue: (row) => row.week52_high,
    render: (row) => <span className="text-muted-foreground">{fmtPrice(row.week52_high)}</span>,
  },
  {
    key: 'week52_low',
    label: '52W Lo',
    tip: '52-week low price',
    group: 'price',
    defaultVisible: false,
    width: 92,
    getValue: (row) => row.week52_low,
    render: (row) => <span className="text-muted-foreground">{fmtPrice(row.week52_low)}</span>,
  },
  {
    key: 'day50_ma',
    label: '50D MA',
    tip: '50-day moving average',
    group: 'price',
    defaultVisible: false,
    width: 92,
    getValue: (row) => row.day50_ma,
    render: (row) => <span className="text-muted-foreground">{fmtPrice(row.day50_ma)}</span>,
  },
  {
    key: 'day200_ma',
    label: '200D MA',
    tip: '200-day moving average',
    group: 'price',
    defaultVisible: false,
    width: 96,
    getValue: (row) => row.day200_ma,
    render: (row) => <span className="text-muted-foreground">{fmtPrice(row.day200_ma)}</span>,
  },
];

export const COLUMN_BY_KEY: Record<string, ScreenerColumn> = Object.fromEntries(
  SCREENER_COLUMNS.map((c) => [c.key, c]),
);
