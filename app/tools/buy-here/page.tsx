export const dynamic = 'force-dynamic';

import BuyHereClientPage from './BuyHereClientPage';

/** ?ticker=AAPL&name=Apple pre-selects a stock: the stock page's "What if you had bought" link. */
export default async function BuyHerePage({ searchParams }: { searchParams: Promise<{ ticker?: string; name?: string }> }) {
  const { ticker, name } = await searchParams;
  const valid = typeof ticker === 'string' && /^[A-Za-z0-9.\-/]{1,15}$/.test(ticker);
  const initialStock = valid
    ? { ticker: ticker.toUpperCase(), name: typeof name === 'string' && name.length <= 120 ? name : ticker.toUpperCase() }
    : undefined;
  return <BuyHereClientPage initialStock={initialStock} />;
}
