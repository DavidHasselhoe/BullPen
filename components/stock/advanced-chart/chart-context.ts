/**
 * Chart snapshot + action types shared by the in-chart AI assistant.
 *
 * `buildChartSnapshot()` produces a compact, numeric summary of what the user
 * is currently looking at (timeframe, chart type, active indicators, and real
 * price-action stats computed locally from the candles we already have). This
 * is what the AI "reads" to analyse the chart — no extra API credits.
 *
 * `ChartAction` is the union the AI emits (server tools return them as
 * `__clientAction`) and the modal dispatches to the real chart handlers.
 */

import type { ChartRange, AdvancedChartType } from '@/hooks/use-chart-prefs';
import type { OHLCV } from '@/lib/finance/indicators';

// ── Actions the AI can perform on the chart ─────────────────────────────────
export type ChartAction =
  | { type: 'chart_set_timeframe'; range: ChartRange }
  | { type: 'chart_set_type'; chartType: AdvancedChartType }
  | { type: 'chart_add_indicator'; indicator: string; length?: number }
  | { type: 'chart_remove_indicator'; indicator: string }
  | { type: 'chart_clear_indicators' }
  | { type: 'chart_apply_preset'; preset: string }
  | { type: 'chart_toggle_volume'; show: boolean }
  | { type: 'chart_toggle_events'; show: boolean }
  | { type: 'chart_set_alert'; price: number; direction?: 'above' | 'below' };

// ── The snapshot the AI reads ───────────────────────────────────────────────
export interface ChartSnapshot {
  symbol: string;
  timeframe: ChartRange;
  chartType: AdvancedChartType;
  indicators: string[];        // human labels, e.g. ["SMA 50", "RSI 14"]
  showVolume: boolean;
  showEvents: boolean;
  currentPrice: number | null;
  changePctToday: number | null;
  /** Stats over the *visible* window (from the loaded candles). */
  window: {
    bars: number;
    open: number;
    close: number;
    high: number;
    low: number;
    changePct: number;         // first → last close over the window
  } | null;
  /** Last values of common moving averages (null when not enough bars). */
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  /** Coarse trend read used as a hint (model still reasons from the numbers). */
  trendHint: 'up' | 'down' | 'mixed' | null;
  /** Down-sampled recent closes so the model can see the shape of the move. */
  recentCloses: number[];
}

function smaLast(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  let sum = 0;
  for (let i = closes.length - period; i < closes.length; i++) sum += closes[i];
  return sum / period;
}

function rsiLast(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= period;
  loss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    gain = (gain * (period - 1) + g) / period;
    loss = (loss * (period - 1) + l) / period;
  }
  if (loss === 0) return 100;
  const rs = gain / loss;
  return 100 - 100 / (1 + rs);
}

function downsample(arr: number[], max = 24): number[] {
  if (arr.length <= max) return arr.map((n) => round(n));
  const step = Math.ceil(arr.length / max);
  const out: number[] = [];
  for (let i = 0; i < arr.length; i += step) out.push(round(arr[i]));
  if (out[out.length - 1] !== round(arr[arr.length - 1])) out.push(round(arr[arr.length - 1]));
  return out;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildChartSnapshot(args: {
  symbol: string;
  timeframe: ChartRange;
  chartType: AdvancedChartType;
  indicatorLabels: string[];
  showVolume: boolean;
  showEvents: boolean;
  currentPrice: number | null;
  changePctToday: number | null;
  candles: OHLCV | null;
}): ChartSnapshot {
  const { candles } = args;
  const closes = candles?.c ?? [];
  const n = closes.length;
  const current = args.currentPrice ?? (n ? closes[n - 1] : null);

  let window: ChartSnapshot['window'] = null;
  if (candles && n > 0) {
    let hi = candles.h[0];
    let lo = candles.l[0];
    for (let i = 0; i < n; i++) {
      if (candles.h[i] > hi) hi = candles.h[i];
      if (candles.l[i] < lo) lo = candles.l[i];
    }
    const first = closes[0];
    const last = closes[n - 1];
    window = {
      bars: n,
      open: round(candles.o[0]),
      close: round(last),
      high: round(hi),
      low: round(lo),
      changePct: first ? round(((last - first) / first) * 100) : 0,
    };
  }

  const sma20 = smaLast(closes, 20);
  const sma50 = smaLast(closes, 50);
  const sma200 = smaLast(closes, 200);

  let trendHint: ChartSnapshot['trendHint'] = null;
  if (current != null && sma50 != null && sma200 != null) {
    if (current > sma50 && sma50 > sma200) trendHint = 'up';
    else if (current < sma50 && sma50 < sma200) trendHint = 'down';
    else trendHint = 'mixed';
  }

  return {
    symbol: args.symbol.toUpperCase(),
    timeframe: args.timeframe,
    chartType: args.chartType,
    indicators: args.indicatorLabels,
    showVolume: args.showVolume,
    showEvents: args.showEvents,
    currentPrice: current != null ? round(current) : null,
    changePctToday: args.changePctToday != null ? round(args.changePctToday) : null,
    window,
    sma20: sma20 != null ? round(sma20) : null,
    sma50: sma50 != null ? round(sma50) : null,
    sma200: sma200 != null ? round(sma200) : null,
    rsi14: (() => { const r = rsiLast(closes); return r != null ? round(r) : null; })(),
    trendHint,
    recentCloses: downsample(closes),
  };
}
