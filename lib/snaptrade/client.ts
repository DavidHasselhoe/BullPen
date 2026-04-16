// SnapTrade SDK wrapper
// Initializes the SnapTrade client using server-side env vars.
// Never import this from client components — it requires secret credentials.

import { Snaptrade } from 'snaptrade-typescript-sdk';

let _client: Snaptrade | null = null;

export function getSnapTradeClient(): Snaptrade {
  if (_client) return _client;

  const clientId    = process.env.SNAPTRADE_CLIENT_ID;
  const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY;

  if (!clientId || !consumerKey) {
    throw new Error(
      'SnapTrade not configured. Add SNAPTRADE_CLIENT_ID and SNAPTRADE_CONSUMER_KEY to your environment.'
    );
  }

  _client = new Snaptrade({ clientId, consumerKey });
  return _client;
}

export function isSnapTradeConfigured(): boolean {
  return !!(process.env.SNAPTRADE_CLIENT_ID && process.env.SNAPTRADE_CONSUMER_KEY);
}
