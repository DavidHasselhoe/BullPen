import type { Metadata } from 'next';

// Not in the Tools list: Market Mood is a readout, reached from its Discover tile.
export const metadata: Metadata = {
  title: 'Market Mood',
  description: 'How fearful or greedy the market is right now, from four signals: volatility, S&P 500 momentum, junk bond demand and safe-haven demand.',
  alternates: { canonical: '/tools/market-mood' },
};

export default function MarketMoodLayout({ children }: { children: React.ReactNode }) {
  return children;
}
