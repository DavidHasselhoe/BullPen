'use client';

import type { ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { cn } from '@/lib/utils';
import type { ScreenerRow } from '@/app/api/screener/route';
import type { HeatmapPriceEntry } from '@/hooks/use-heatmap-stream';
import { HealthRing } from '@/components/finance/HealthRing';

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

/**
 * screener_stats mixes two conventions for percent-like fields depending on
 * how TwelveData itself returns them: revenue/earnings growth are stored
 * already-multiplied-by-100 (see screener-stats.ts's parseStats), while
 * dividend_yield, payout_ratio and profit_margin are stored as TwelveData's
 * raw 0..1 fraction. A column reading a fraction-stored field MUST route
 * both getValue and render through this helper — hand-writing `* 100` per
 * column is exactly how the dividend-yield bug (625cc70) and the identical
 * payout-ratio bug happened. Columns whose field is already percent-scale
 * (revenue_growth_yoy, earnings_growth_yoy) should call fmtPct directly.
 */
function fmtFractionAsPct(v: number | null, decimals = 1): string {
  return fmtPct(v != null ? v * 100 : null, decimals);
}
function fractionToPct(v: number | null): number | null {
  return v != null ? v * 100 : null;
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

// ─── Column registry ──────────────────────────────────────────────────────────

export type ColumnGroup = 'health' | 'price' | 'volume' | 'valuation' | 'profitability' | 'risk';

export function getGroupLabels(t: TFunction): Record<ColumnGroup, string> {
  return {
    health: t('screenerGroupHealthScore'),
    price: t('screenerGroupPrice'),
    volume: t('screenerVolumeHeading'),
    valuation: t('screenerValuationHeading'),
    profitability: t('screenerProfitabilityHeading'),
    risk: t('screenerRiskIncomeHeading'),
  };
}

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


export function getScreenerColumns(t: TFunction): ScreenerColumn[] {
  return [
  // ── Health Score ──
  {
    key: 'health_score',
    label: t('screenerColHealthLabel'),
    tip: t('screenerColHealthTip'),
    group: 'health',
    defaultVisible: true,
    width: 88,
    getValue: (row) => row.health_score,
    render: (row) => {
      const score = row.health_score;
      const grade = row.health_score_grade;
      if (score == null || !grade) return <span className="text-muted-foreground/80">—</span>;
      return (
        <span className="inline-flex items-center" title={t('screenerColHealthTitle', { score, grade })}>
          <HealthRing score={score} grade={grade as 'A' | 'B' | 'C' | 'D' | 'F'} size={34} className="text-foreground" />
        </span>
      );
    },
  },

  // ── Price ──
  // Falls back to the last quoted price/change (`row.last_price`/`last_change_pct`,
  // hydrated server-side in /api/screener) whenever the live SSE stream has no
  // tick yet — market closed, or between sessions before pre-market data arrives.
  // Rendered dimmed with a tooltip so it reads as "last close", not live.
  {
    key: 'price',
    label: t('screenerColPriceLabel'),
    tip: t('screenerColPriceTip'),
    group: 'price',
    defaultVisible: true,
    width: 92,
    getValue: (row, live) => live?.price ?? row.last_price ?? null,
    render: (row, live) => {
      if (live) return fmtPrice(live.price);
      if (row.last_price != null) {
        return (
          <span className="text-muted-foreground/85" title={t('screenerColLastCloseTitle')}>
            {fmtPrice(row.last_price)}
          </span>
        );
      }
      return '—';
    },
  },
  {
    key: 'change_pct',
    label: t('screenerColChangePctLabel'),
    tip: t('screenerColChangePctTip'),
    group: 'price',
    defaultVisible: true,
    width: 84,
    getValue: (row, live) => live?.changePercent ?? row.last_change_pct ?? null,
    render: (row, live) => {
      const pct = live?.changePercent ?? row.last_change_pct;
      if (pct == null) return '—';
      const isLive = !!live;
      return (
        <span
          className={cn(
            'tabular-nums',
            pct > 0 && (isLive ? 'text-emerald-500' : 'text-emerald-500/60'),
            pct < 0 && (isLive ? 'text-red-500' : 'text-red-500/60'),
          )}
          title={isLive ? undefined : t('screenerColLastCloseChangeTitle')}
        >
          {pct > 0 ? '+' : ''}{pct.toFixed(2)}%
        </span>
      );
    },
  },

  // ── Volume ──
  {
    key: 'volume',
    label: t('screenerColVolumeLabel'),
    tip: t('screenerColVolumeTip'),
    group: 'volume',
    defaultVisible: false,
    width: 80,
    getValue: (_r, live) => live?.volume ?? null,
    render: (_r, live) => fmtVolume(live?.volume ?? null),
  },
  {
    key: 'avg_volume',
    label: t('screenerColAvgVolumeLabel'),
    tip: t('screenerColAvgVolumeTip'),
    group: 'volume',
    defaultVisible: false,
    width: 80,
    getValue: (row) => row.avg_volume,
    render: (row) => fmtVolume(row.avg_volume),
  },

  // ── Valuation ──
  {
    key: 'market_cap',
    label: t('screenerColMarketCapLabel'),
    tip: t('screenerColMarketCapTip'),
    group: 'valuation',
    defaultVisible: true,
    width: 84,
    getValue: (row) => row.market_cap,
    render: (row) => fmtCap(row.market_cap),
  },
  {
    key: 'pe_ratio',
    label: t('screenerColPeRatioLabel'),
    tip: t('screenerColPeRatioTip'),
    group: 'valuation',
    defaultVisible: true,
    width: 72,
    getValue: (row) => row.pe_ratio,
    render: (row) => (row.pe_ratio != null && row.pe_ratio > 0 ? fmtNum(row.pe_ratio, 1) : '—'),
  },
  {
    key: 'forward_pe',
    label: t('screenerColForwardPeLabel'),
    tip: t('screenerColForwardPeTip'),
    group: 'valuation',
    defaultVisible: true,
    width: 80,
    getValue: (row) => row.forward_pe,
    render: (row) => (row.forward_pe != null && row.forward_pe > 0 ? fmtNum(row.forward_pe, 1) : '—'),
  },
  {
    key: 'pb_ratio',
    label: t('screenerColPbRatioLabel'),
    tip: t('screenerColPbRatioTip'),
    group: 'valuation',
    defaultVisible: true,
    width: 72,
    getValue: (row) => row.pb_ratio,
    render: (row) => (row.pb_ratio != null && row.pb_ratio > 0 ? fmtNum(row.pb_ratio, 2) : '—'),
  },
  {
    key: 'ps_ratio',
    label: t('screenerColPsRatioLabel'),
    tip: t('screenerColPsRatioTip'),
    group: 'valuation',
    defaultVisible: false,
    width: 68,
    getValue: (row) => row.ps_ratio,
    render: (row) => (row.ps_ratio != null && row.ps_ratio > 0 ? fmtNum(row.ps_ratio, 2) : '—'),
  },
  {
    key: 'ev_to_ebitda',
    label: t('screenerColEvEbitdaLabel'),
    tip: t('screenerColEvEbitdaTip'),
    group: 'valuation',
    defaultVisible: true,
    width: 72,
    getValue: (row) => row.ev_to_ebitda,
    render: (row) => (row.ev_to_ebitda != null && row.ev_to_ebitda > 0 ? fmtNum(row.ev_to_ebitda, 1) : '—'),
  },
  {
    key: 'eps_ttm',
    label: t('screenerColEpsLabel'),
    tip: t('screenerColEpsTip'),
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
  {
    key: 'revenue_ttm',
    label: t('screenerColRevenueTtmLabel'),
    tip: t('screenerColRevenueTtmTip'),
    group: 'valuation',
    defaultVisible: false,
    width: 84,
    getValue: (row) => row.revenue_ttm,
    render: (row) => fmtCap(row.revenue_ttm),
  },

  // ── Profitability ──
  {
    key: 'profit_margin',
    label: t('screenerColMarginLabel'),
    tip: t('screenerColMarginTip'),
    group: 'profitability',
    defaultVisible: true,
    width: 76,
    getValue: (row) => fractionToPct(row.profit_margin),
    render: (row) => (
      <span className={cn(
        row.profit_margin != null && row.profit_margin < 0 && 'text-red-500',
        row.profit_margin != null && row.profit_margin > 0.2 && 'text-emerald-600 dark:text-emerald-400',
      )}>
        {row.profit_margin != null ? fmtFractionAsPct(row.profit_margin, 1) : '—'}
      </span>
    ),
  },
  {
    key: 'revenue_growth_yoy',
    label: t('screenerColRevGthLabel'),
    tip: t('screenerColRevGthTip'),
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
    label: t('screenerColEarnGthLabel'),
    tip: t('screenerColEarnGthTip'),
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
    label: t('screenerColBetaLabel'),
    tip: t('screenerColBetaTip'),
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
    label: t('screenerColDivYldLabel'),
    tip: t('screenerColDivYldTip'),
    group: 'risk',
    defaultVisible: true,
    width: 76,
    // Stored as 0..1 (TwelveData's forward_annual_dividend_yield), same as
    // profit_margin above — convert to percent here, not at write time.
    getValue: (row) => fractionToPct(row.dividend_yield),
    render: (row) => (row.dividend_yield != null && row.dividend_yield > 0 ? fmtFractionAsPct(row.dividend_yield, 2) : '—'),
  },
  {
    key: 'payout_ratio',
    label: t('screenerColPayoutLabel'),
    tip: t('screenerColPayoutTip'),
    group: 'risk',
    defaultVisible: false,
    width: 72,
    // Stored as 0..1 (TwelveData's payout_ratio), same convention as
    // dividend_yield above — convert to percent here, not at write time.
    getValue: (row) => fractionToPct(row.payout_ratio),
    render: (row) => (row.payout_ratio != null && row.payout_ratio > 0 ? fmtFractionAsPct(row.payout_ratio, 0) : '—'),
  },

  // ── Price levels ──
  {
    key: 'week52_high',
    label: t('screenerColWeek52HiLabel'),
    tip: t('screenerColWeek52HiTip'),
    group: 'price',
    defaultVisible: true,
    width: 92,
    getValue: (row) => row.week52_high,
    render: (row) => <span className="text-muted-foreground">{fmtPrice(row.week52_high)}</span>,
  },
  {
    key: 'week52_low',
    label: t('screenerColWeek52LoLabel'),
    tip: t('screenerColWeek52LoTip'),
    group: 'price',
    defaultVisible: false,
    width: 92,
    getValue: (row) => row.week52_low,
    render: (row) => <span className="text-muted-foreground">{fmtPrice(row.week52_low)}</span>,
  },
  ];
}

/** Structural registry (key/group/defaultVisible/width) — used where only
 *  language-independent shape is needed (persisted column-prefs bookkeeping).
 *  Label/tip text there is meaningless since it's never rendered. */
export const SCREENER_COLUMNS: ScreenerColumn[] = getScreenerColumns(((k: string) => k) as TFunction);

export const COLUMN_BY_KEY: Record<string, ScreenerColumn> = Object.fromEntries(
  SCREENER_COLUMNS.map((c) => [c.key, c]),
);
