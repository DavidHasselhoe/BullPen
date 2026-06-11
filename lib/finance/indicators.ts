/**
 * Technical-indicator catalog + client-side compute for the advanced chart.
 *
 * Indicators are computed locally from the candle OHLCV we already fetch — the
 * same approach TradingView uses. This is free (no API credits), perfectly
 * time-aligned with the candles, and recomputes instantly when a user changes a
 * length, instead of firing a paid TwelveData request per tweak. The TwelveData
 * indicator catalog informed which indicators we expose here.
 */

export interface OHLCV {
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  v: number[];
}

export type IndicatorGroup = 'overlay' | 'oscillator';

export interface IndicatorParamSpec {
  key: string;
  label: string;
  default: number;
  min: number;
  max: number;
  step?: number;
}

export interface IndicatorLineSpec {
  key: string;          // key in the compute() output map
  label: string;
  color: string;        // default color (ignored for the primary line)
  width?: number;
  dashed?: boolean;
  histogram?: boolean;  // render as a histogram series (e.g. MACD hist)
  /** The primary line uses the instance's assigned color so multiple instances differ. */
  primary?: boolean;
}

export interface IndicatorDef {
  type: string;         // unique id + TwelveData endpoint name, e.g. 'sma'
  label: string;        // short, e.g. 'SMA'
  name: string;         // full, e.g. 'Simple Moving Average'
  group: IndicatorGroup;
  params: IndicatorParamSpec[];
  lines: IndicatorLineSpec[];
  /** Oscillator reference levels (e.g. RSI 30/70). */
  refLines?: { value: number; color: string }[];
  compute: (c: OHLCV, params: Record<string, number>) => Record<string, (number | null)[]>;
}

/** A user-added indicator on the chart. */
export interface IndicatorInstance {
  id: string;
  type: string;
  params: Record<string, number>;
  color?: string; // assigned per instance for the primary line
}

/** Palette for per-instance primary line colors (so two SMAs don't collide). */
export const INDICATOR_PALETTE = [
  '#f59e0b', '#a78bfa', '#60a5fa', '#22d3ee', '#f472b6', '#34d399', '#fb923c', '#e879f9',
];

// ── compute helpers ──────────────────────────────────────────────────────────

const N = (len: number): (number | null)[] => new Array(len).fill(null);

function sma(src: number[], period: number): (number | null)[] {
  const out = N(src.length);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < src.length; i++) {
    sum += src[i];
    if (i >= period) sum -= src[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function ema(src: number[], period: number): (number | null)[] {
  const out = N(src.length);
  if (period <= 0) return out;
  const k = 2 / (period + 1);
  let sum = 0;
  let prev: number | null = null;
  for (let i = 0; i < src.length; i++) {
    if (prev === null) {
      sum += src[i];
      if (i === period - 1) {
        prev = sum / period;
        out[i] = prev;
      }
      continue;
    }
    prev = src[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** EMA over a series that may have leading nulls (used for the MACD signal line). */
function emaNullable(src: (number | null)[], period: number): (number | null)[] {
  const out = N(src.length);
  const k = 2 / (period + 1);
  let prev: number | null = null;
  let seen = 0;
  let sum = 0;
  for (let i = 0; i < src.length; i++) {
    const val = src[i];
    if (val === null) continue;
    if (prev === null) {
      sum += val;
      seen++;
      if (seen === period) {
        prev = sum / period;
        out[i] = prev;
      }
      continue;
    }
    prev = val * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function wma(src: number[], period: number): (number | null)[] {
  const out = N(src.length);
  if (period <= 0) return out;
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < src.length; i++) {
    let acc = 0;
    for (let j = 0; j < period; j++) acc += src[i - j] * (period - j);
    out[i] = acc / denom;
  }
  return out;
}

function rsi(closes: number[], period: number): (number | null)[] {
  const out = N(closes.length);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    const g = Math.max(ch, 0);
    const l = Math.max(-ch, 0);
    if (i <= period) {
      gain += g;
      loss += l;
      if (i === period) {
        gain /= period;
        loss /= period;
        out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
      }
      continue;
    }
    gain = (gain * (period - 1) + g) / period;
    loss = (loss * (period - 1) + l) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

function rollingStdDev(src: number[], period: number): (number | null)[] {
  const out = N(src.length);
  for (let i = period - 1; i < src.length; i++) {
    let mean = 0;
    for (let j = 0; j < period; j++) mean += src[i - j];
    mean /= period;
    let variance = 0;
    for (let j = 0; j < period; j++) variance += (src[i - j] - mean) ** 2;
    out[i] = Math.sqrt(variance / period);
  }
  return out;
}

function atr(c: OHLCV, period: number): (number | null)[] {
  const len = c.c.length;
  const tr = new Array(len).fill(0);
  for (let i = 0; i < len; i++) {
    tr[i] = i === 0
      ? c.h[i] - c.l[i]
      : Math.max(c.h[i] - c.l[i], Math.abs(c.h[i] - c.c[i - 1]), Math.abs(c.l[i] - c.c[i - 1]));
  }
  const out = N(len);
  let prev = 0;
  for (let i = 0; i < len; i++) {
    if (i < period) {
      prev += tr[i];
      if (i === period - 1) { prev /= period; out[i] = prev; }
      continue;
    }
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

// ── catalog ──────────────────────────────────────────────────────────────────

export const INDICATORS: IndicatorDef[] = [
  {
    type: 'sma', label: 'SMA', name: 'Simple Moving Average', group: 'overlay',
    params: [{ key: 'length', label: 'Length', default: 50, min: 1, max: 400 }],
    lines: [{ key: 'sma', label: 'SMA', color: '#f59e0b', primary: true, width: 2 }],
    compute: (c, p) => ({ sma: sma(c.c, p.length) }),
  },
  {
    type: 'ema', label: 'EMA', name: 'Exponential Moving Average', group: 'overlay',
    params: [{ key: 'length', label: 'Length', default: 20, min: 1, max: 400 }],
    lines: [{ key: 'ema', label: 'EMA', color: '#a78bfa', primary: true, width: 2 }],
    compute: (c, p) => ({ ema: ema(c.c, p.length) }),
  },
  {
    type: 'wma', label: 'WMA', name: 'Weighted Moving Average', group: 'overlay',
    params: [{ key: 'length', label: 'Length', default: 20, min: 1, max: 400 }],
    lines: [{ key: 'wma', label: 'WMA', color: '#22d3ee', primary: true, width: 2 }],
    compute: (c, p) => ({ wma: wma(c.c, p.length) }),
  },
  {
    type: 'vwap', label: 'VWAP', name: 'Volume Weighted Average Price', group: 'overlay',
    params: [],
    lines: [{ key: 'vwap', label: 'VWAP', color: '#60a5fa', primary: true, width: 2 }],
    compute: (c) => {
      const out = N(c.c.length);
      let cumPV = 0;
      let cumV = 0;
      for (let i = 0; i < c.c.length; i++) {
        const tp = (c.h[i] + c.l[i] + c.c[i]) / 3;
        const vol = c.v[i] || 0;
        cumPV += tp * vol;
        cumV += vol;
        out[i] = cumV > 0 ? cumPV / cumV : null;
      }
      return { vwap: out };
    },
  },
  {
    type: 'bbands', label: 'BB', name: 'Bollinger Bands', group: 'overlay',
    params: [
      { key: 'length', label: 'Length', default: 20, min: 2, max: 200 },
      { key: 'stdDev', label: 'StdDev', default: 2, min: 1, max: 5, step: 0.5 },
    ],
    lines: [
      { key: 'upper', label: 'Upper', color: '#60a5fa', width: 1, dashed: true },
      { key: 'middle', label: 'Basis', color: '#60a5fa', width: 1, primary: true },
      { key: 'lower', label: 'Lower', color: '#60a5fa', width: 1, dashed: true },
    ],
    compute: (c, p) => {
      const mid = sma(c.c, p.length);
      const sd = rollingStdDev(c.c, p.length);
      const upper = N(c.c.length);
      const lower = N(c.c.length);
      for (let i = 0; i < c.c.length; i++) {
        if (mid[i] != null && sd[i] != null) {
          upper[i] = (mid[i] as number) + p.stdDev * (sd[i] as number);
          lower[i] = (mid[i] as number) - p.stdDev * (sd[i] as number);
        }
      }
      return { upper, middle: mid, lower };
    },
  },
  {
    type: 'rsi', label: 'RSI', name: 'Relative Strength Index', group: 'oscillator',
    params: [{ key: 'length', label: 'Length', default: 14, min: 2, max: 100 }],
    lines: [{ key: 'rsi', label: 'RSI', color: '#f59e0b', primary: true, width: 2 }],
    refLines: [{ value: 70, color: '#ef4444' }, { value: 30, color: '#22c55e' }],
    compute: (c, p) => ({ rsi: rsi(c.c, p.length) }),
  },
  {
    type: 'macd', label: 'MACD', name: 'Moving Average Convergence Divergence', group: 'oscillator',
    params: [
      { key: 'fast', label: 'Fast', default: 12, min: 1, max: 100 },
      { key: 'slow', label: 'Slow', default: 26, min: 1, max: 200 },
      { key: 'signal', label: 'Signal', default: 9, min: 1, max: 100 },
    ],
    lines: [
      { key: 'hist', label: 'Hist', color: '#6b7280', histogram: true },
      { key: 'macd', label: 'MACD', color: '#60a5fa', width: 2 },
      { key: 'signal', label: 'Signal', color: '#f59e0b', width: 2 },
    ],
    refLines: [{ value: 0, color: '#6b7280' }],
    compute: (c, p) => {
      const fast = ema(c.c, p.fast);
      const slow = ema(c.c, p.slow);
      const macd = N(c.c.length);
      for (let i = 0; i < c.c.length; i++) {
        if (fast[i] != null && slow[i] != null) macd[i] = (fast[i] as number) - (slow[i] as number);
      }
      const signal = emaNullable(macd, p.signal);
      const hist = N(c.c.length);
      for (let i = 0; i < c.c.length; i++) {
        if (macd[i] != null && signal[i] != null) hist[i] = (macd[i] as number) - (signal[i] as number);
      }
      return { macd, signal, hist };
    },
  },
  {
    type: 'stoch', label: 'Stoch', name: 'Stochastic Oscillator', group: 'oscillator',
    params: [
      { key: 'k', label: '%K', default: 14, min: 1, max: 100 },
      { key: 'd', label: '%D', default: 3, min: 1, max: 50 },
    ],
    lines: [
      { key: 'k', label: '%K', color: '#60a5fa', primary: true, width: 2 },
      { key: 'd', label: '%D', color: '#f59e0b', width: 1 },
    ],
    refLines: [{ value: 80, color: '#ef4444' }, { value: 20, color: '#22c55e' }],
    compute: (c, p) => {
      const len = c.c.length;
      const rawK = N(len);
      for (let i = p.k - 1; i < len; i++) {
        let hh = -Infinity;
        let ll = Infinity;
        for (let j = 0; j < p.k; j++) {
          hh = Math.max(hh, c.h[i - j]);
          ll = Math.min(ll, c.l[i - j]);
        }
        rawK[i] = hh === ll ? 50 : (100 * (c.c[i] - ll)) / (hh - ll);
      }
      // %K smoothed by 3 (slow stochastic), %D = SMA(%K, d)
      const kVals = rawK.map((x) => (x == null ? NaN : x));
      const smoothK = N(len);
      for (let i = 0; i < len; i++) {
        if (i < p.k - 1 + 2) continue;
        const a = kVals[i];
        const b = kVals[i - 1];
        const c2 = kVals[i - 2];
        if (!Number.isNaN(a) && !Number.isNaN(b) && !Number.isNaN(c2)) smoothK[i] = (a + b + c2) / 3;
      }
      const dArr = N(len);
      for (let i = 0; i < len; i++) {
        let acc = 0;
        let cnt = 0;
        for (let j = 0; j < p.d; j++) {
          const val = smoothK[i - j];
          if (val != null) { acc += val; cnt++; }
        }
        if (cnt === p.d) dArr[i] = acc / p.d;
      }
      return { k: smoothK, d: dArr };
    },
  },
  {
    type: 'atr', label: 'ATR', name: 'Average True Range', group: 'oscillator',
    params: [{ key: 'length', label: 'Length', default: 14, min: 1, max: 100 }],
    lines: [{ key: 'atr', label: 'ATR', color: '#f59e0b', primary: true, width: 2 }],
    compute: (c, p) => ({ atr: atr(c, p.length) }),
  },
  {
    type: 'obv', label: 'OBV', name: 'On-Balance Volume', group: 'oscillator',
    params: [],
    lines: [{ key: 'obv', label: 'OBV', color: '#34d399', primary: true, width: 2 }],
    compute: (c) => {
      const out = N(c.c.length);
      let obv = 0;
      for (let i = 0; i < c.c.length; i++) {
        if (i > 0) {
          if (c.c[i] > c.c[i - 1]) obv += c.v[i] || 0;
          else if (c.c[i] < c.c[i - 1]) obv -= c.v[i] || 0;
        }
        out[i] = obv;
      }
      return { obv: out };
    },
  },
];

export const INDICATORS_BY_TYPE = new Map(INDICATORS.map((d) => [d.type, d]));

export function getIndicatorDef(type: string): IndicatorDef | undefined {
  return INDICATORS_BY_TYPE.get(type);
}

/** Default params for a type, from its spec. */
export function defaultParamsFor(def: IndicatorDef): Record<string, number> {
  const p: Record<string, number> = {};
  for (const spec of def.params) p[spec.key] = spec.default;
  return p;
}

/** One-click starter sets so newcomers don't face a blank canvas. */
export interface IndicatorPreset {
  id: string;
  label: string;
  description: string;
  items: { type: string; params?: Record<string, number> }[];
}

export const INDICATOR_PRESETS: IndicatorPreset[] = [
  {
    id: 'trend', label: 'Trend', description: 'SMA 50 & 200 with cross markers',
    items: [{ type: 'sma', params: { length: 50 } }, { type: 'sma', params: { length: 200 } }],
  },
  {
    id: 'momentum', label: 'Momentum', description: 'RSI + MACD',
    items: [{ type: 'rsi' }, { type: 'macd' }],
  },
  {
    id: 'volatility', label: 'Volatility', description: 'Bollinger Bands + ATR',
    items: [{ type: 'bbands' }, { type: 'atr' }],
  },
];

/** Short human label, e.g. "SMA 50" or "MACD 12 26 9". */
export function indicatorLabel(inst: IndicatorInstance): string {
  const def = getIndicatorDef(inst.type);
  if (!def) return inst.type.toUpperCase();
  const vals = def.params.map((s) => inst.params[s.key]).filter((v) => v != null);
  return vals.length ? `${def.label} ${vals.join(' ')}` : def.label;
}
