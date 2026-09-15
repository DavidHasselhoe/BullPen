/**
 * Well-known starting points for someone who hasn't named a stock yet. One
 * list for both the onboarding picker and the dashboard fallback popup, so
 * they can't drift apart.
 */
export const STARTER_STOCKS: { ticker: string; name: string }[] = [
  { ticker: 'NVDA', name: 'NVIDIA' },
  { ticker: 'MSFT', name: 'Microsoft' },
  { ticker: 'META', name: 'Meta' },
  { ticker: 'AAPL', name: 'Apple' },
  { ticker: 'AMZN', name: 'Amazon' },
  { ticker: 'TSLA', name: 'Tesla' },
  { ticker: 'NBIS', name: 'Nebius' },
  { ticker: 'MU', name: 'Micron' },
  { ticker: 'JNJ', name: 'Johnson & Johnson' },
  { ticker: 'SPY', name: 'SPDR S&P 500 ETF' },
  { ticker: 'QQQ', name: 'Invesco QQQ Trust' },
];
