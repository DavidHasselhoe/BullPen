import type { LucideIcon } from 'lucide-react';
import {
  Calculator,
  Wallet,
  PieChart,
  Gauge,
  Grid3X3,
  MessageSquare,
  Filter,
  Scale,
  FileText,
} from 'lucide-react';

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
    name: 'BullPen AI',
    description: 'Investment research assistant. Ask about SEC filings, financial metrics, and concepts.',
    href: '/tools/ai-chat',
    icon: MessageSquare,
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
    id: 'filings',
    name: 'Filing Explorer',
    description: 'Browse recently filed SEC reports (10-K, 10-Q, 20-F) across companies.',
    href: '/tools/filings',
    icon: FileText,
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
    status: 'coming-soon',
  },
  {
    id: 'portfolio',
    name: 'Portfolio Analyzer',
    description: 'Analyze diversification from your holdings. Sector concentration, correlation score, and diversification rating.',
    href: '/tools/portfolio',
    icon: PieChart,
    status: 'coming-soon',
  },
  {
    id: 'market-mood',
    name: 'Market Mood',
    description: 'Bullish vs bearish sentiment, volatility trend, macro pulse. A fear vs greed index.',
    href: '/tools/market-mood',
    icon: Gauge,
    status: 'coming-soon',
  },
  {
    id: 'heatmap',
    name: 'S&P 500 Heatmap',
    description: 'Interactive heatmap by sector and stock. Size by market cap, color by performance.',
    href: '/tools/heatmap',
    icon: Grid3X3,
    status: 'coming-soon',
  },
];
