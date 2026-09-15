/**
 * Well-known starting points for someone who hasn't named a stock yet. One
 * list for both the onboarding picker and the dashboard fallback popup, so
 * they can't drift apart. Individual companies only, mixed across sectors so
 * the list doesn't read as tech-only.
 */
export const STARTER_STOCKS: { ticker: string; name: string }[] = [
  { ticker: 'NVDA', name: 'NVIDIA' },
  { ticker: 'AAPL', name: 'Apple' },
  { ticker: 'KO', name: 'Coca-Cola' },
  { ticker: 'MSFT', name: 'Microsoft' },
  { ticker: 'JPM', name: 'JPMorgan Chase' },
  { ticker: 'AMZN', name: 'Amazon' },
  { ticker: 'JNJ', name: 'Johnson & Johnson' },
  { ticker: 'META', name: 'Meta' },
  { ticker: 'TSLA', name: 'Tesla' },
  { ticker: 'MU', name: 'Micron' },
  { ticker: 'NBIS', name: 'Nebius' },
];
