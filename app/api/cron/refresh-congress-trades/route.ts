/**
 * Washington Trading refresh
 * GET /api/cron/refresh-congress-trades
 *
 * Tuesday and Friday 14:00 UTC (vercel.json). Before this existed nothing
 * refreshed congress_trades at all: every update was a manual
 * `npm run ingest-congress`, so the section froze at whenever someone last ran it.
 *
 * Runs the --refresh sweep (20 newest trades per member, ~35 credits each,
 * ~665 per run for 19 members, ~5,700 a month; see migration 154) and tells followers about
 * any trade this run stored for the first time. Twice a week because PTRs are
 * filed 30-46 days after the trade: polling daily would pay 2.5x for news that
 * is already weeks old. Positions are NOT refreshed here; their cost is
 * per-row and unbounded, see MAX_POSITIONS_PER_MEMBER.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logSecurityEvent } from '@/lib/security/security-events';
import { createServerClient } from '@/lib/supabase/client';
import { ingestAllPoliticians } from '@/lib/congress/ingest-trades';
import { notifyPoliticianTrades } from '@/lib/notifications/notification-creators';
import { invalidateCachedPrefix } from '@/lib/cache/market-data-cache';

export const maxDuration = 300;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    logSecurityEvent('cron_secret_mismatch', { path: '/api/cron/refresh-congress-trades' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createServerClient();
    const { results, totalCredits } = await ingestAllPoliticians(supabase, { refresh: true });

    const { data: members } = await supabase
      .from('congress_politicians')
      .select('id, slug, display_name');
    const bySlug = new Map(((members ?? []) as Array<{ id: string; slug: string; display_name: string }>).map((m) => [m.slug, m]));

    let notified = 0;
    for (const r of results) {
      const m = bySlug.get(r.slug);
      if (!m || !r.newTrades?.length) continue;
      // One member's notification failure must not stop the rest.
      try {
        notified += await notifyPoliticianTrades({
          politicianId: m.id,
          slug: m.slug,
          displayName: m.display_name,
          trades: r.newTrades,
        });
      } catch (err) {
        console.error(`[refresh-congress-trades] notify failed for ${r.slug}`, err);
      }
    }

    const inserted = results.reduce((s, r) => s + r.inserted, 0);
    // Cards show trade counts and last-trade dates; don't make them wait out the 1h cache.
    if (inserted > 0) await invalidateCachedPrefix('congress:');

    const failed = results.filter((r) => r.error).map((r) => ({ slug: r.slug, error: r.error }));
    return NextResponse.json({ inserted, notified, totalCredits, failed });
  } catch (error) {
    console.error('[refresh-congress-trades] failed', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
