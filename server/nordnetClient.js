// Nordnet client: provides mock data and can proxy to Nordnet public API when a session id is available.
const axios = require('axios');

async function getHoldingsMock() {
  // sample holdings
  const positions = [
    { symbol: 'NOD', name: 'Nordnet AB', quantity: 10, avgPrice: 50.0, currentPrice: 62.5 },
    { symbol: 'AAPL', name: 'Apple Inc.', quantity: 5, avgPrice: 120.0, currentPrice: 170.0 },
    { symbol: 'ERIC', name: 'Ericsson', quantity: 20, avgPrice: 60.0, currentPrice: 45.0 }
  ];

  // compute derived fields
  const enriched = positions.map(p => ({
    ...p,
    marketValue: +(p.quantity * p.currentPrice).toFixed(2),
    unrealizedPL: +((p.currentPrice - p.avgPrice) * p.quantity).toFixed(2)
  }));

  const totalValue = +enriched.reduce((s, p) => s + p.marketValue, 0).toFixed(2);

  return { positions: enriched, totalValue };
}

/**
 * Get accounts from Nordnet public API.
 * If `sessionId` is provided (or process.env.NORDNET_SESSION_ID), this will call the real Nordnet endpoint.
 * Otherwise it returns mock account data.
 *
 * Parameters:
 *  - sessionId: string | null
 *  - includeCreditAccounts: boolean
 *  - acceptLanguage: optional language header
 */
async function getAccounts(sessionId = null, includeCreditAccounts = false, acceptLanguage) {
  const effectiveSession = sessionId || process.env.NORDNET_SESSION_ID || null;
  if (!effectiveSession) {
    // return mock accounts that match real API structure
    return {
      accounts: [
        { accno: 11111111, accid: 1, type: 'ISIN', name: 'Main Brokerage', currency: 'SEK' },
        { accno: 22222222, accid: 2, type: 'ISA', name: 'Savings', currency: 'SEK' }
      ]
    };
  }

  // call real Nordnet API
  const url = 'https://public.nordnet.se/api/2/accounts';
  const basic = Buffer.from(`${effectiveSession}:${effectiveSession}`).toString('base64');

  try {
    const headers = {
      Authorization: `Basic ${basic}`
    };
    if (acceptLanguage) headers['Accept-Language'] = acceptLanguage;

    const resp = await axios.get(url, {
      headers,
      params: { include_credit_accounts: includeCreditAccounts }
    });

    // Nordnet returns array of account objects on 200. Pass it through.
    return { accounts: resp.data };
  } catch (err) {
    // normalize error for caller
    const status = err.response ? err.response.status : 500;
    const message = err.response && err.response.data ? err.response.data : err.message;
    const error = { status, message };
    throw error;
  }
}

module.exports = {
  getHoldingsMock,
  getAccounts
};
