/**
 * Static configuration for the /discover page. Defines display order for
 * sectors, ETF groupings, and the small fixed lists of commodities + crypto
 * that the page surfaces. All actual stock data is queried from screener_stats.
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
  /** Exact GICS label as stored in `screener_stats.sector` and `SP500_SECTORS` */
  key: string;
  /** Short display label for the rail header */
  label: string;
  /** Optional one-line tagline (kept short — UI is dense) */
  tagline: string;
  icon: LucideIcon;
  /** Tailwind class for the accent dot/line on the rail header */
  accent: string;
}

export const SECTOR_DISPLAY_ORDER: SectorEntry[] = [
  { key: 'Information Technology',  label: 'Technology',             tagline: 'Chips, software, platforms',           icon: Cpu,        accent: 'bg-sky-500' },
  { key: 'Communication Services',  label: 'Communications',         tagline: 'Media, telecom, internet',             icon: Radio,      accent: 'bg-indigo-500' },
  { key: 'Consumer Discretionary',  label: 'Consumer Discretionary', tagline: 'Retail, travel, luxury',               icon: ShoppingBag, accent: 'bg-pink-500' },
  { key: 'Financials',              label: 'Financials',             tagline: 'Banks, insurance, payments',           icon: Landmark,   accent: 'bg-emerald-500' },
  { key: 'Health Care',             label: 'Healthcare',             tagline: 'Pharma, devices, providers',           icon: HeartPulse, accent: 'bg-rose-500' },
  { key: 'Industrials',             label: 'Industrials',            tagline: 'Aerospace, machinery, logistics',      icon: Factory,    accent: 'bg-amber-500' },
  { key: 'Consumer Staples',        label: 'Consumer Staples',       tagline: 'Food, beverages, household',           icon: Apple,      accent: 'bg-lime-500' },
  { key: 'Energy',                  label: 'Energy',                 tagline: 'Oil, gas, exploration',                icon: Flame,      accent: 'bg-orange-500' },
  { key: 'Utilities',               label: 'Utilities',              tagline: 'Power, water, renewables',             icon: Lightbulb,  accent: 'bg-yellow-500' },
  { key: 'Real Estate',             label: 'Real Estate',            tagline: 'REITs and property',                   icon: Building2,  accent: 'bg-teal-500' },
  { key: 'Materials',               label: 'Materials',              tagline: 'Chemicals, metals, mining',            icon: Mountain,   accent: 'bg-stone-500' },
];

export const STOCKS_PER_SECTOR_RAIL = 12;

// ── ETF themes — curated subset of KNOWN_ETF_TICKERS, grouped for discovery ──
export interface ETFTheme {
  key: string;
  label: string;
  tagline: string;
  tickers: string[];
}

export const ETF_THEMES: ETFTheme[] = [
  {
    key: 'broad-market',
    label: 'Broad Market',
    tagline: 'Track the entire US (or world) market',
    tickers: ['SPY', 'VOO', 'IVV', 'VTI', 'QQQ', 'DIA', 'VT', 'ACWI'],
  },
  {
    key: 'sector-etfs',
    label: 'Sector ETFs',
    tagline: 'Bet on a single GICS sector',
    tickers: ['XLK', 'XLF', 'XLE', 'XLV', 'XLI', 'XLY', 'XLP', 'XLC', 'XLU', 'XLB', 'XLRE'],
  },
  {
    key: 'thematic',
    label: 'Thematic',
    tagline: 'AI, clean energy, semiconductors, biotech',
    tickers: ['SMH', 'SOXX', 'ARKK', 'ARKG', 'ICLN', 'TAN', 'BOTZ', 'AIQ', 'IBB', 'XBI', 'LIT'],
  },
  {
    key: 'dividend-income',
    label: 'Dividend & Income',
    tagline: 'Yield-focused funds',
    tickers: ['SCHD', 'JEPI', 'JEPQ', 'VIG', 'VYM', 'DGRO', 'DVY', 'HDV', 'SDY'],
  },
  {
    key: 'bonds',
    label: 'Bonds & Fixed Income',
    tagline: 'Treasuries, corporate, high yield',
    tickers: ['AGG', 'BND', 'TLT', 'IEF', 'SHY', 'LQD', 'HYG', 'TIP', 'SGOV'],
  },
];

// ── Commodities (TwelveData canonical symbols) ──
export const COMMODITY_SYMBOLS = [
  { symbol: 'XAU/USD', name: 'Gold' },
  { symbol: 'XAG/USD', name: 'Silver' },
  { symbol: 'XPT/USD', name: 'Platinum' },
  { symbol: 'XPD/USD', name: 'Palladium' },
  { symbol: 'WTI/USD', name: 'Crude Oil (WTI)' },
  { symbol: 'XBR/USD', name: 'Brent Crude' },
];

// ── Crypto majors (TwelveData canonical symbols) ──
export const CRYPTO_SYMBOLS = [
  { symbol: 'BTC/USD', name: 'Bitcoin' },
  { symbol: 'ETH/USD', name: 'Ethereum' },
  { symbol: 'SOL/USD', name: 'Solana' },
  { symbol: 'BNB/USD', name: 'BNB' },
  { symbol: 'XRP/USD', name: 'XRP' },
  { symbol: 'DOGE/USD', name: 'Dogecoin' },
];

// ── Shared shape for any card in a rail ──
export interface DiscoverFeed {
  forYou: {
    mode: 'personalized' | 'trending' | 'empty';
    items: TickerItem[];
    explanation?: string;
  };
  sectors: Record<string, TickerItem[]>;
  etfs: Record<string, TickerItem[]>;
  commodities: TickerItem[];
  crypto: TickerItem[];
}

export interface TickerItem {
  /** Canonical TwelveData symbol — used for live price subscription */
  symbol: string;
  /** Display ticker (for stocks usually equals symbol; for crypto e.g. BTC) */
  ticker: string;
  name: string;
  logoUrl: string | null;
  sector?: string | null;
  /** Last known close (seed for the card before SSE ticks arrive) */
  previousClose?: number | null;
  marketCap?: number | null;
  dividendYield?: number | null;
}
