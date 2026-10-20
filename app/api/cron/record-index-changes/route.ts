/**
 * Index membership changes + fund weights
 * POST /api/cron/record-index-changes
 *
 * Called by .github/workflows/cron-sync-index-constituents.yml (Monday 05:00
 * UTC) with the JSON scripts/sync-index-constituents.ts writes: every ticker
 * that joined or left the S&P 500, Nasdaq-100 or Dow 30 since the last sync,
 * and SPY/DIA holding weights. Stores both and notifies watchers and holders
 * of the stocks that changed. A rerun of the same payload stores and sends
 * nothing new.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logSecurityEvent } from '@/lib/security/security-events';
import { INDEX_IDS, recordIndexChanges, type IndexChangesPayload } from '@/lib/market-data/index-events';
import { notifyIndexMembershipChanges } from '@/lib/notifications/notification-creators';

export const maxDuration = 60;

const TICKER = /^[A-Z]{1,5}(\.[A-Z]{1,2})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isPayload(p: unknown): p is IndexChangesPayload {
  const b = p as IndexChangesPayload;
  return (
    !!b && typeof b.detectedOn === 'string' && DATE.test(b.detectedOn) &&
    Array.isArray(b.events) && b.events.every((e) =>
      TICKER.test(e?.ticker) && INDEX_IDS.includes(e.indexId) && (e.change === 'added' || e.change === 'removed')) &&
    Array.isArray(b.weights) && b.weights.every((w) =>
      INDEX_IDS.includes(w?.indexId) && DATE.test(w.asOf) && !!w.pct && typeof w.pct === 'object' &&
      Object.entries(w.pct).every(([t, v]) => TICKER.test(t) && typeof v === 'number' && v > 0 && v <= 100))
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    logSecurityEvent('cron_secret_mismatch', { path: '/api/cron/record-index-changes' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  if (!isPayload(payload)) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  try {
    const stored = await recordIndexChanges(payload);
    const notified = await notifyIndexMembershipChanges(stored);
    return NextResponse.json({ stored: stored.length, weights: payload.weights.map((w) => `${w.indexId}@${w.asOf}`), notified });
  } catch (error) {
    console.error('[record-index-changes] failed', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
