import type { LucideIcon } from 'lucide-react';
import {
  Calculator,
  Wallet,
  Gauge,
  Grid3X3,
  Filter,
  Scale,
  CalendarDays,
  Sparkles,
  Bell,
  Telescope,
} from 'lucide-react';
import { BullHornsIcon } from '@/components/icons/BullHornsIcon';

export interface ToolConfig {
  id: string;
  name: string;
  description: string;
  href: string;
  icon: LucideIcon;
  status?: 'available' | 'coming-soon';
}

export const TOOLS: ToolConfig[] = [
  {
    id: 'ai-chat',
    name: 'Ask Bull',
    description: 'Investment research assistant. Ask about SEC filings, financial metrics, and concepts.',
    href: '/tools/ai-chat',
    icon: BullHornsIcon,
    status: 'available',
  },
  {
    id: 'deep-dive',
    name: 'AI Deep Dive',
    description: 'Analyst-grade report on any stock: latest results, guidance, valuation, bull vs bear, catalysts, and risks. Powered by Claude.',
    href: '/tools/deep-dive',
    icon: Telescope,
    status: 'available',
  },
  {
    id: 'portfolio-builder',
    name: 'Portfolio Builder',
    description: 'Type an investment thesis. Get a high-conviction thematic portfolio with allocations, rationale, and risk analysis.',
    href: '/tools/portfolio-builder',
    icon: Sparkles,
    status: 'available',
  },
  {
    id: 'screener',
    name: 'Stock Screener',
    description: 'Filter companies by revenue, margins, EPS, cash flow, debt-to-equity, and more.',
    href: '/tools/screener',
    icon: Filter,
    status: 'available',
  },
  {
    id: 'compare',
    name: 'Company Compare',
    description: 'Side-by-side comparison of business profile, key metrics, and financial history for 2–5 companies.',
    href: '/tools/compare',
    icon: Scale,
    status: 'available',
  },
  {
    id: 'calendar',
    name: 'Market Events Calendar',
    description: 'Upcoming earnings announcements, ex-dividend dates, stock splits, and IPOs in one view.',
    href: '/tools/calendar',
    icon: CalendarDays,
    status: 'available',
  },
  {
    id: 'buy-here',
    name: 'If You Bought Here',
    description: 'Input an amount and years to see how the investment would perform based on historical data. Compare with S&P 500 or sector ETF.',
    href: '/tools/buy-here',
    icon: Calculator,
    status: 'available',
  },
  {
    id: 'dividend',
    name: 'Dividend Calculator',
    description: 'Annual income growth, reinvestment impact, and break-even year for dividend-paying stocks.',
    href: '/tools/dividend',
    icon: Wallet,
    status: 'available',
  },
  {
    id: 'market-mood',
    name: 'Market Mood',
    description: 'Bullish vs bearish sentiment, volatility trend, macro pulse. A fear vs greed index.',
    href: '/tools/market-mood',
    icon: Gauge,
    status: 'available',
  },
  {
    id: 'heatmap',
    name: 'S&P 500 Heatmap',
    description: 'Interactive heatmap by sector and stock. Size by market cap, color by performance.',
    href: '/tools/heatmap',
    icon: Grid3X3,
    status: 'available',
  },
  {
    id: 'alerts',
    name: 'Price Alerts',
    description: 'Get notified when a stock hits a target price, daily move, 52-week extreme, or all-time high.',
    href: '/tools/alerts',
    icon: Bell,
    status: 'available',
  },
];

/**
 * Page metadata for a tool's route, sourced from this same canonical
 * name/description every other surface (nav dropdown, tools grid, homepage
 * picker) already uses — one source instead of hand-duplicated copy in each
 * tool's layout.tsx. Every /tools/* page (except portfolio-builder, which
 * isn't a client component and exports its own directly) is 'use client',
 * so a sibling server layout.tsx is the only way to give it real metadata;
 * without this, all ten fell back to the parent /tools layout's generic
 * "Tools" title — confirmed live, /tools/compare, /tools/screener, etc. all
 * rendered the identical title regardless of which tool it was.
 */
export function getToolMetadata(id: string): { title: string; description: string } | undefined {
  const tool = TOOLS.find((t) => t.id === id);
  return tool ? { title: tool.name, description: tool.description } : undefined;
}
