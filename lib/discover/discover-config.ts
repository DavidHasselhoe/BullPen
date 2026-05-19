/**
 * Static configuration for the /discover page.
 *
 * The page is intentionally hardcoded rather than DB-driven so it works
 * regardless of how much data has been ingested into `companies` /
 * `screener_stats`. The feed API hydrates `name` and `logoUrl` from the
 * `companies` table where available, falling back to ticker + initials.
 *
 * To rebalance any rail, edit the ticker list here. Each list is ordered
 * from "most prominent" first.
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
  /** Stable key used in the feed payload + as the React list key */
  key: string;
  /** Short display label for the rail header */
  label: string;
  /** Optional one-line tagline (kept short — UI is dense) */
  tagline: string;
  icon: LucideIcon;
  /** Tailwind class for the accent bar on the rail header */
  accent: string;
  /** Curated tickers shown in this sector rail (already ordered by prominence) */
  tickers: string[];
}

export const SECTOR_DISPLAY_ORDER: SectorEntry[] = [
  {
    key: 'technology',
    label: 'Technology',
    tagline: 'Chips, software, platforms',
    icon: Cpu,
    accent: 'bg-sky-500',
    tickers: ['NVDA', 'MSFT', 'AAPL', 'AVGO', 'ORCL', 'CSCO', 'AMD', 'ADBE', 'CRM', 'INTC', 'IBM', 'PLTR'],
  },
  {
    key: 'communications',
    label: 'Communications',
    tagline: 'Media, telecom, internet',
    icon: Radio,
    accent: 'bg-indigo-500',
    tickers: ['GOOGL', 'META', 'NFLX', 'DIS', 'TMUS', 'VZ', 'T', 'CMCSA', 'EA', 'TTWO', 'WBD', 'SPOT'],
  },
  {
    key: 'consumer-discretionary',
    label: 'Consumer Discretionary',
    tagline: 'Retail, travel, luxury',
    icon: ShoppingBag,
    accent: 'bg-pink-500',
    tickers: ['AMZN', 'TSLA', 'HD', 'MCD', 'NKE', 'SBUX', 'LOW', 'BKNG', 'TJX', 'CMG', 'ABNB', 'GM'],
  },
  {
    key: 'financials',
    label: 'Financials',
    tagline: 'Banks, insurance, payments',
    icon: Landmark,
    accent: 'bg-emerald-500',
    tickers: ['JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'AXP', 'BLK', 'SPGI', 'C', 'SCHW'],
  },
  {
    key: 'healthcare',
    label: 'Healthcare',
    tagline: 'Pharma, devices, providers',
    icon: HeartPulse,
    accent: 'bg-rose-500',
    tickers: ['LLY', 'UNH', 'JNJ', 'MRK', 'ABBV', 'PFE', 'TMO', 'ABT', 'DHR', 'BMY', 'AMGN', 'GILD'],
  },
  {
    key: 'industrials',
    label: 'Industrials',
    tagline: 'Aerospace, machinery, logistics',
    icon: Factory,
    accent: 'bg-amber-500',
    tickers: ['CAT', 'GE', 'HON', 'RTX', 'UNP', 'BA', 'LMT', 'UPS', 'DE', 'ETN', 'NOC', 'EMR'],
  },
  {
    key: 'consumer-staples',
    label: 'Consumer Staples',
    tagline: 'Food, beverages, household',
    icon: Apple,
    accent: 'bg-lime-500',
    tickers: ['WMT', 'COST', 'PG', 'KO', 'PEP', 'PM', 'MO', 'MDLZ', 'CL', 'KMB', 'TGT', 'GIS'],
  },
  {
    key: 'energy',
    label: 'Energy',
    tagline: 'Oil, gas, exploration',
    icon: Flame,
    accent: 'bg-orange-500',
    tickers: ['XOM', 'CVX', 'COP', 'SLB', 'EOG', 'PSX', 'MPC', 'VLO', 'OXY', 'KMI', 'WMB', 'FANG'],
  },
  {
    key: 'utilities',
    label: 'Utilities',
    tagline: 'Power, water, renewables',
    icon: Lightbulb,
    accent: 'bg-yellow-500',
    tickers: ['NEE', 'DUK', 'SO', 'SRE', 'AEP', 'EXC', 'D', 'PCG', 'XEL', 'ED', 'PEG', 'WEC'],
  },
  {
    key: 'real-estate',
    label: 'Real Estate',
    tagline: 'REITs and property',
    icon: Building2,
    accent: 'bg-teal-500',
    tickers: ['PLD', 'AMT', 'EQIX', 'WELL', 'SPG', 'PSA', 'O', 'CCI', 'DLR', 'EXR', 'AVB', 'VTR'],
  },
  {
    key: 'materials',
    label: 'Materials',
    tagline: 'Chemicals, metals, mining',
    icon: Mountain,
    accent: 'bg-stone-500',
    tickers: ['LIN', 'SHW', 'APD', 'ECL', 'FCX', 'NEM', 'DOW', 'DD', 'NUE', 'CTVA', 'PPG', 'IFF'],
  },
];

export const STOCKS_PER_SECTOR_RAIL = 12;

/**
 * Fallback list for the "Trending Today" rail when get_hot_picks(24h) returns
 * empty (low traffic, fresh deploy, etc.). Hand-picked names users would
 * recognise.
 */
export const TRENDING_FALLBACK = [
  'NVDA', 'TSLA', 'AAPL', 'AMZN', 'META', 'GOOGL', 'MSFT', 'AMD', 'AVGO', 'PLTR', 'COIN', 'NFLX',
] as const;

// ── ETF themes — grouped for discovery ────────────────────────────────────────
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

/**
 * Map of ETF ticker → issuer brand domain, used to fetch a logo via logo.dev.
 * If the ticker isn't in this map, the ETF will fall back to coloured initials.
 */
export const ETF_ISSUER_DOMAINS: Record<string, string> = {
  // State Street SPDR family
  SPY: 'ssga.com', DIA: 'ssga.com',
  XLK: 'ssga.com', XLF: 'ssga.com', XLE: 'ssga.com', XLV: 'ssga.com',
  XLI: 'ssga.com', XLY: 'ssga.com', XLP: 'ssga.com', XLC: 'ssga.com',
  XLU: 'ssga.com', XLB: 'ssga.com', XLRE: 'ssga.com',
  XBI: 'ssga.com', SDY: 'ssga.com',
  // Vanguard
  VOO: 'vanguard.com', VTI: 'vanguard.com', VT: 'vanguard.com',
  VIG: 'vanguard.com', VYM: 'vanguard.com', BND: 'vanguard.com',
  // iShares (BlackRock)
  IVV: 'ishares.com', ITOT: 'ishares.com', ACWI: 'ishares.com',
  IBB: 'ishares.com', SOXX: 'ishares.com', ICLN: 'ishares.com',
  AGG: 'ishares.com', TLT: 'ishares.com', IEF: 'ishares.com',
  SHY: 'ishares.com', LQD: 'ishares.com', HYG: 'ishares.com',
  TIP: 'ishares.com', SGOV: 'ishares.com', DVY: 'ishares.com',
  HDV: 'ishares.com', DGRO: 'ishares.com',
  // Invesco
  QQQ: 'invesco.com', TAN: 'invesco.com',
  // ARK Invest
  ARKK: 'ark-funds.com', ARKG: 'ark-funds.com',
  // Schwab
  SCHD: 'schwabassetmanagement.com',
  // VanEck
  SMH: 'vaneck.com',
  // Global X
  BOTZ: 'globalxetfs.com', AIQ: 'globalxetfs.com', LIT: 'globalxetfs.com',
  // JPMorgan
  JEPI: 'jpmorgan.com', JEPQ: 'jpmorgan.com',
};

// ── Commodities (TwelveData canonical symbols) ───────────────────────────────
export const COMMODITY_SYMBOLS = [
  { symbol: 'XAU/USD', name: 'Gold' },
  { symbol: 'XAG/USD', name: 'Silver' },
  { symbol: 'XPT/USD', name: 'Platinum' },
  { symbol: 'XPD/USD', name: 'Palladium' },
  { symbol: 'WTI/USD', name: 'Crude Oil (WTI)' },
  { symbol: 'XBR/USD', name: 'Brent Crude' },
];

// ── Crypto majors (TwelveData canonical symbols) ─────────────────────────────
export const CRYPTO_SYMBOLS = [
  { symbol: 'BTC/USD', name: 'Bitcoin' },
  { symbol: 'ETH/USD', name: 'Ethereum' },
  { symbol: 'SOL/USD', name: 'Solana' },
  { symbol: 'BNB/USD', name: 'BNB' },
  { symbol: 'XRP/USD', name: 'XRP' },
  { symbol: 'DOGE/USD', name: 'Dogecoin' },
];

/**
 * Public Coingecko CDN URLs for the crypto majors we surface. These are stable
 * and don't require auth.
 */
export const CRYPTO_LOGO_URLS: Record<string, string> = {
  'BTC/USD':  'https://assets.coingecko.com/coins/images/1/small/bitcoin.png',
  'ETH/USD':  'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
  'SOL/USD':  'https://assets.coingecko.com/coins/images/4128/small/solana.png',
  'BNB/USD':  'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png',
  'XRP/USD':  'https://assets.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png',
  'DOGE/USD': 'https://assets.coingecko.com/coins/images/5/small/dogecoin.png',
};

/**
 * Build a logo.dev URL for an issuer domain. Returns null if LOGO_DEV_KEY
 * is not configured (we'd rather show initials than a broken image).
 */
export function logoDevUrl(domain: string): string | null {
  const token = process.env.LOGO_DEV_KEY;
  if (!token) return null;
  return `https://img.logo.dev/${domain}?token=${token}&size=128&format=png`;
}

// ── Shared shape for any card in a rail ───────────────────────────────────────
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
