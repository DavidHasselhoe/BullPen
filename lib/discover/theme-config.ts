/**
 * Curated "Investing Ideas" theme baskets shown on /discover and drilled into
 * at /discover/ideas/[slug].
 *
 * Same trust model as SECTOR_DISPLAY_ORDER in discover-config.ts: a hardcoded,
 * hand-edited list reviewed via normal PR, not an auto-refreshing screen. A
 * theme's "reason to exist" is narrative/thematic (e.g. "the physical layer
 * behind the AI boom"), which isn't expressible as a clean SQL filter the way
 * the sector or quality-discount screens are — so curation is manual here by
 * design, not as a placeholder for something more automated.
 */

import type { LucideIcon } from 'lucide-react';
import { Server, Gem, Rocket, Sparkles, Stethoscope, TrendingUp, Fuel, Brain, Bot } from 'lucide-react';

export interface ThemeEntry {
  /** Stable key used in the route and as the React key. */
  slug: string;
  title: string;
  /** Short line shown on the theme card. */
  tagline: string;
  /** Longer prose shown on the drill-down page. */
  description: string;
  icon: LucideIcon;
  /** Curated constituents, ordered by prominence. */
  tickers: string[];
}

export const THEME_DISPLAY_ORDER: ThemeEntry[] = [
  {
    slug: 'ai-infrastructure',
    title: 'AI Infrastructure Stocks',
    tagline: 'Chips, data centers, and the power behind AI',
    description:
      'AI doesn’t run on software alone. These companies build the physical layer it depends on: GPUs, data centers, cooling, memory, and the networking gear tying it together.',
    icon: Server,
    tickers: ['NVDA', 'AVGO', 'VRT', 'EQIX', 'DLR', 'AMD', 'MU', 'ANET', 'SMCI', 'DELL'],
  },
  {
    slug: 'undiscovered-gems',
    title: 'Undiscovered Gems With Strong Fundamentals',
    tagline: 'Solid businesses that fly under the radar',
    description:
      'Not every strong balance sheet belongs to a household name. These companies post the kind of profitability and financial health metrics larger names get credit for, without the same attention.',
    icon: Gem,
    tickers: ['CPRT', 'FICO', 'MPWR', 'POOL', 'ROL', 'WST', 'TDY', 'SAIA'],
  },
  {
    slug: 'recent-global-ipos',
    title: 'Recent Global IPOs',
    tagline: 'Newly public companies still finding their footing',
    description:
      'Companies that have listed in the last few years, still building their public track record. Higher uncertainty, but a chance to research a business before the market has fully made up its mind.',
    icon: Rocket,
    tickers: ['RDDT', 'ARM', 'CART', 'BIRK', 'KVYO', 'CAVA', 'ALAB', 'RBRK'],
  },
  {
    slug: 'best-potential-tech-ai',
    title: 'Best Potential Tech and AI Stocks',
    tagline: 'Software and platforms betting big on AI',
    description:
      'Cloud, data, and security platforms weaving AI directly into their products — the layer above the infrastructure, where AI turns into something businesses actually buy.',
    icon: Sparkles,
    tickers: ['PLTR', 'CRWD', 'NET', 'DDOG', 'SNOW', 'MDB', 'PANW', 'NOW'],
  },
  {
    slug: 'undervalued-healthcare',
    title: 'Undervalued Healthcare Stocks',
    tagline: 'Pharma and health names priced below their history',
    description:
      'Healthcare companies trading at valuations that look cheap next to their own recent history — worth a look for a sector that doesn’t move in lockstep with the rest of the market.',
    icon: Stethoscope,
    tickers: ['PFE', 'BMY', 'GILD', 'CVS', 'VTRS', 'CI', 'HUM', 'MOH'],
  },
  {
    slug: 'high-insider-ownership',
    title: 'Fast Growing Stocks With High Insider Ownership',
    tagline: 'Growth companies where founders still hold real stakes',
    description:
      'When the people running the company still own a meaningful chunk of it, their incentives line up with shareholders’ in a way a typical management team’s don’t.',
    icon: TrendingUp,
    tickers: ['PLTR', 'TTD', 'MELI', 'AXON', 'CELH', 'DUOL'],
  },
  {
    slug: 'us-midstream-oil-gas',
    title: 'US Midstream Oil and Gas Pipeline Operators',
    tagline: 'The pipelines and terminals that move US energy',
    description:
      'Midstream companies earn fees moving oil and gas rather than betting on commodity prices directly — a different risk profile than the drillers and refiners that dominate most energy portfolios.',
    icon: Fuel,
    tickers: ['KMI', 'WMB', 'OKE', 'ET', 'EPD', 'MPLX', 'TRGP', 'PAA'],
  },
  {
    slug: 'transformative-ai',
    title: 'Transformative Artificial Intelligence',
    tagline: 'The platforms putting AI in front of billions of users',
    description:
      'The largest technology platforms are reshaping their core products around AI — these are the companies with the scale and distribution to put it in front of the most people.',
    icon: Brain,
    tickers: ['MSFT', 'GOOGL', 'META', 'AMZN', 'NVDA', 'AAPL'],
  },
  {
    slug: 'robotics',
    title: 'Robotics Stocks',
    tagline: 'Automation, machine vision, and robotic arms',
    description:
      'From surgical robots to warehouse automation, these companies build the arms, vision systems, and control software turning physical work over to machines.',
    icon: Bot,
    tickers: ['ISRG', 'ROK', 'TER', 'CGNX', 'ZBRA', 'SYM', 'AVAV', 'PATH'],
  },
];

/** Fast slug → entry lookup for the drill-down route. */
export const THEME_BY_SLUG = new Map(THEME_DISPLAY_ORDER.map((t) => [t.slug, t]));
