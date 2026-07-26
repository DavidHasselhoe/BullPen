/**
 * Configuration for the /discover page.
 *
 * Discover's job is: read the market in ten seconds, then find one thing worth
 * researching. The sector list below drives both halves of that — each entry is
 * a row in the sector performance chart (priced via its SPDR sector ETF) and,
 * when expanded, the curated constituent list shown underneath it.
 *
 * The tickers are hardcoded rather than DB-driven so the page works regardless
 * of how much has been ingested into `companies` / `screener_stats`; the feed
 * API hydrates name and logo from `companies` where available and falls back to
 * the ticker plus coloured initials.
 */

import type { LucideIcon } from 'lucide-react';
import {
  Cpu,
  Radio,
  ShoppingBag,
  Landmark,
  HeartPulse,
  Factory,
  Apple,
  Flame,
  Lightbulb,
  Building2,
  Mountain,
} from 'lucide-react';

export interface SectorEntry {
  /** Stable key used in the feed payload, the drill-down route, and as the React key */
  key: string;
  /** Short display label for the chart row */
  label: string;
  /** Optional one-line tagline, shown in the expanded panel */
  tagline: string;
  icon: LucideIcon;
  /**
   * The SPDR sector ETF used to price this sector's performance. One quote per
   * sector gives a real, tradeable read on the sector rather than an unweighted
   * average of whichever constituents we happen to list.
   */
  etf: string;
  /** Curated constituents shown when the row is expanded (ordered by prominence) */
  tickers: string[];
}

export const SECTOR_DISPLAY_ORDER: SectorEntry[] = [
  {
    key: 'technology',
    label: 'Technology',
    tagline: 'Chips, software, platforms',
    icon: Cpu,
    etf: 'XLK',
    tickers: ['NVDA', 'MSFT', 'AAPL', 'AVGO', 'ORCL', 'CSCO', 'AMD', 'ADBE', 'CRM', 'INTC', 'IBM', 'PLTR'],
  },
  {
    key: 'communications',
    label: 'Communications',
    tagline: 'Media, telecom, internet',
    icon: Radio,
    etf: 'XLC',
    tickers: ['GOOGL', 'META', 'NFLX', 'DIS', 'TMUS', 'VZ', 'T', 'CMCSA', 'EA', 'TTWO', 'WBD', 'SPOT'],
  },
  {
    key: 'consumer-discretionary',
    label: 'Consumer Discretionary',
    tagline: 'Retail, travel, luxury',
    icon: ShoppingBag,
    etf: 'XLY',
    tickers: ['AMZN', 'TSLA', 'HD', 'MCD', 'NKE', 'SBUX', 'LOW', 'BKNG', 'TJX', 'CMG', 'ABNB', 'GM'],
  },
  {
    key: 'financials',
    label: 'Financials',
    tagline: 'Banks, insurance, payments',
    icon: Landmark,
    etf: 'XLF',
    tickers: ['JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'AXP', 'BLK', 'SPGI', 'C', 'SCHW'],
  },
  {
    key: 'healthcare',
    label: 'Healthcare',
    tagline: 'Pharma, devices, providers',
    icon: HeartPulse,
    etf: 'XLV',
    tickers: ['LLY', 'UNH', 'JNJ', 'MRK', 'ABBV', 'PFE', 'TMO', 'ABT', 'DHR', 'BMY', 'AMGN', 'GILD'],
  },
  {
    key: 'industrials',
    label: 'Industrials',
    tagline: 'Aerospace, machinery, logistics',
    icon: Factory,
    etf: 'XLI',
    tickers: ['CAT', 'GE', 'HON', 'RTX', 'UNP', 'BA', 'LMT', 'UPS', 'DE', 'ETN', 'NOC', 'EMR'],
  },
  {
    key: 'consumer-staples',
    label: 'Consumer Staples',
    tagline: 'Food, beverages, household',
    icon: Apple,
    etf: 'XLP',
    tickers: ['WMT', 'COST', 'PG', 'KO', 'PEP', 'PM', 'MO', 'MDLZ', 'CL', 'KMB', 'TGT', 'GIS'],
  },
  {
    key: 'energy',
    label: 'Energy',
    tagline: 'Oil, gas, exploration',
    icon: Flame,
    etf: 'XLE',
    tickers: ['XOM', 'CVX', 'COP', 'SLB', 'EOG', 'PSX', 'MPC', 'VLO', 'OXY', 'KMI', 'WMB', 'FANG'],
  },
  {
    key: 'utilities',
    label: 'Utilities',
    tagline: 'Power, water, renewables',
    icon: Lightbulb,
    etf: 'XLU',
    tickers: ['NEE', 'DUK', 'SO', 'SRE', 'AEP', 'EXC', 'D', 'PCG', 'XEL', 'ED', 'PEG', 'WEC'],
  },
  {
    key: 'real-estate',
    label: 'Real Estate',
    tagline: 'REITs and property',
    icon: Building2,
    etf: 'XLRE',
    tickers: ['PLD', 'AMT', 'EQIX', 'WELL', 'SPG', 'PSA', 'O', 'CCI', 'DLR', 'EXR', 'AVB', 'VTR'],
  },
  {
    key: 'materials',
    label: 'Materials',
    tagline: 'Chemicals, metals, mining',
    icon: Mountain,
    etf: 'XLB',
    tickers: ['LIN', 'SHW', 'APD', 'ECL', 'FCX', 'NEM', 'DOW', 'DD', 'NUE', 'CTVA', 'PPG', 'IFF'],
  },
];

export const STOCKS_PER_SECTOR = 12;

/** Fast key → entry lookup for the drill-down route. */
export const SECTOR_BY_KEY = new Map(SECTOR_DISPLAY_ORDER.map((s) => [s.key, s]));

/** Every SPDR sector ETF, in display order — one batched quote covers the chart. */
export const SECTOR_ETFS = SECTOR_DISPLAY_ORDER.map((s) => s.etf);

// ── Market pulse ─────────────────────────────────────────────────────────────

export interface IndexEntry {
  /** Tradeable proxy we actually quote */
  symbol: string;
  /** What a reader calls it */
  label: string;
  /** One-line explanation, shown as visible micro-copy */
  hint: string;
}

// Four different slices of the same market — mega-cap, tech, blue-chip
// industrial, and small-cap — so the strip reads as a shape rather than four
// numbers that all move together. Small caps in particular diverge from the
// S&P often enough to be worth the tile.
//
// Deliberately NOT the VIX: plain `VIX` does not resolve on our TwelveData
// plan (only the VIXY/UVXY futures ETFs do), and an ETF's price is not the
// VIX level — "21.44" under a "Volatility" label would be actively misleading,
// since the whole point of the VIX is that the *level* means something.
//
// Hints are visible micro-copy rather than hover tooltips: a beginner
// shouldn't have to discover that a label is hoverable to learn what it means,
// and hover hints don't exist on touch at all.
export const MARKET_INDICES: IndexEntry[] = [
  { symbol: 'SPY', label: 'S&P 500', hint: '500 largest US companies' },
  { symbol: 'QQQ', label: 'Nasdaq 100', hint: '100 biggest Nasdaq names' },
  { symbol: 'DIA', label: 'Dow Jones', hint: '30 established US giants' },
  { symbol: 'IWM', label: 'Russell 2000', hint: 'Smaller US companies' },
];

/**
 * Fallback for the "Trending" collection when get_hot_picks(24h) returns empty
 * (low traffic, fresh deploy). Hand-picked names users would recognise.
 */
export const TRENDING_FALLBACK = [
  'NVDA', 'TSLA', 'AAPL', 'AMZN', 'META', 'GOOGL', 'MSFT', 'AMD',
] as const;

// ── Shared payload shapes ────────────────────────────────────────────────────

export interface TickerItem {
  /** Canonical TwelveData symbol — used for live price subscription */
  symbol: string;
  /** Display ticker */
  ticker: string;
  name: string;
  logoUrl: string | null;
  sector?: string | null;
  /** Last known close (seed for the card before SSE ticks arrive) */
  previousClose?: number | null;
  /** Last known day change percent (seed for the card before SSE ticks arrive) */
  changePercent?: number | null;
  marketCap?: number | null;
  /**
   * Optional one-line reason this name is in the list it's in — e.g.
   * "12.4x forward earnings vs 19.8x sector median". The whole point of a
   * curated collection is that it carries its reason with it.
   */
  reason?: string | null;
}

export interface SectorPerformance {
  key: string;
  label: string;
  etf: string;
  /** Percent change over the selected timeframe. Null when unavailable. */
  changePct: number | null;
}

export type Timeframe = '1D' | '1W' | '1M' | 'YTD';

export const TIMEFRAMES: Timeframe[] = ['1D', '1W', '1M', 'YTD'];

export interface IndexQuote {
  symbol: string;
  label: string;
  hint: string;
  price: number | null;
  changePct: number | null;
}

export interface DiscoverFeed {
  indices: IndexQuote[];
  /** Sector performance keyed by timeframe, each already sorted best → worst. */
  sectors: Record<Timeframe, SectorPerformance[]>;
  collections: {
    trending: { items: TickerItem[]; mode: 'personalized' | 'trending'; explanation: string };
    qualityDiscount: TickerItem[];
    near52High: TickerItem[];
    near52Low: TickerItem[];
  };
}
