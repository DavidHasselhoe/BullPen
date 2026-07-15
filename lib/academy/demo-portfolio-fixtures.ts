import type { HoldingWithPrice } from '@/components/holdings/types';

/**
 * Static example portfolios for Academy demo lessons. These are entirely
 * fabricated illustrative numbers — NOT the user's real holdings, and never
 * persisted or fetched. They exist so a beginner can see sector diversification
 * and position sizing on a realistic-looking portfolio without needing one.
 *
 * All price fields are hand-set so the demo needs zero market-data API calls.
 */

function demoHolding(h: {
  symbol: string;
  company_name: string;
  sector: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  dayChangePercent: number;
}): HoldingWithPrice {
  const marketValue = h.quantity * h.currentPrice;
  const costBasis = h.quantity * h.avgPrice;
  const unrealizedPL = marketValue - costBasis;
  const dayChange = h.currentPrice * (h.dayChangePercent / 100);
  return {
    id: `demo-${h.symbol}`,
    user_id: 'demo',
    symbol: h.symbol,
    company_name: h.company_name,
    quantity: h.quantity,
    avg_price: h.avgPrice,
    date_purchased: null,
    source: 'manual',
    brokerage_account_id: null,
    alerts_enabled: false,
    asset_type: 'stock',
    purchase_currency: null,
    purchase_fx_rate: null,
    trading_currency: 'USD',
    created_at: '',
    updated_at: '',
    // Derived/live fields the holdings viz reads:
    currentPrice: h.currentPrice,
    dayChange,
    dayChangePercent: h.dayChangePercent,
    marketValue,
    unrealizedPL,
    unrealizedPLPercent: costBasis > 0 ? (unrealizedPL / costBasis) * 100 : 0,
    sector: h.sector,
  };
}

/**
 * A deliberately uneven three-stock starter portfolio spanning three sectors —
 * a large tech position, a mid-size healthcare position, and a small energy
 * position — so the diversification and position-sizing lessons have something
 * concrete to point at.
 */
const STARTER_THREE_STOCK: HoldingWithPrice[] = [
  demoHolding({ symbol: 'NVDA', company_name: 'NVIDIA Corporation', sector: 'Technology', quantity: 30, avgPrice: 140, currentPrice: 210, dayChangePercent: 1.4 }),
  demoHolding({ symbol: 'JNJ', company_name: 'Johnson & Johnson', sector: 'Healthcare', quantity: 15, avgPrice: 150, currentPrice: 162, dayChangePercent: -0.3 }),
  demoHolding({ symbol: 'XOM', company_name: 'Exxon Mobil Corporation', sector: 'Energy', quantity: 10, avgPrice: 105, currentPrice: 118, dayChangePercent: 0.6 }),
];

const FIXTURES: Record<string, HoldingWithPrice[]> = {
  'starter-three-stock': STARTER_THREE_STOCK,
};

export function getDemoPortfolio(fixtureId: string): HoldingWithPrice[] {
  return FIXTURES[fixtureId] ?? STARTER_THREE_STOCK;
}
