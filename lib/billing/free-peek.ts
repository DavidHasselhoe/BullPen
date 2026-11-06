/**
 * The free monthly look at Pro's cross-reference panels on Discover ("Your
 * stocks in Washington" and "Your stocks in funds"). A free account may open
 * both in full once per calendar month, for PEEK_HOURS. The point is a felt
 * loss: a locked count of trades in your stocks converts worse than having
 * seen who traded them yesterday.
 *
 * Same machinery as the Weekly Pick's free thesis (lib/picks/thesis-access.ts):
 * a $0 ai_usage row records the redemption, so /admin/costs sees it and the
 * window needs no new column. A read never redeems; only redeemPeek does.
 */

import { createServerClient } from '@/lib/supabase/client';
import { currentPeriodStart } from './quotas';
import { logAiCall } from './log-ai-call';

export const PEEK_FEATURE = 'overlap_peek';
export const PEEK_HOURS = 24;

export type PeekState =
  | { state: 'open'; until: string }
  | { state: 'available' }
  | { state: 'used' };

/**
 * Pure rule: the newest redemption decides the state. Still inside its window
 * = open, even across the 1st; otherwise used only if it was this month's.
 */
export function peekFrom(redeemedAt: string | null, now = new Date(), monthStart = currentPeriodStart('month')): PeekState {
  if (!redeemedAt) return { state: 'available' };
  const until = new Date(Date.parse(redeemedAt) + PEEK_HOURS * 3_600_000);
  if (until > now) return { state: 'open', until: until.toISOString() };
  return Date.parse(redeemedAt) >= monthStart.getTime() ? { state: 'used' } : { state: 'available' };
}

/** Free accounts only: callers check isPro first. */
export async function getPeek(userId: string): Promise<PeekState> {
  const { data } = await createServerClient()
    .from('ai_usage')
    .select('created_at')
    .eq('user_id', userId)
    .eq('feature', PEEK_FEATURE)
    .eq('status', 'success')
    // A look redeemed late last month may still be open.
    .gte('created_at', new Date(currentPeriodStart('month').getTime() - PEEK_HOURS * 3_600_000).toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ created_at: string }>();
  return peekFrom(data?.created_at ?? null);
}

/** Spends this month's look. Returns the resulting state; 'used' means it was already spent. */
export async function redeemPeek(userId: string): Promise<PeekState> {
  const current = await getPeek(userId);
  if (current.state !== 'available') return current;
  // ponytail: two simultaneous redeems can both insert; the second row only
  // restarts the same 24h window, so a unique index isn't worth it.
  const id = await logAiCall({ userId, feature: PEEK_FEATURE, model: 'none' });
  if (!id) throw new Error('could not record the free look');
  return peekFrom(new Date().toISOString());
}

// Self-check: npx tsx lib/billing/free-peek.ts
if (process.argv[1]?.endsWith('free-peek.ts')) {
  const now = new Date('2026-11-06T12:00:00Z');
  const assert = (ok: boolean, msg: string) => { if (!ok) throw new Error(msg); };
  const nov = new Date('2026-11-01T00:00:00Z');
  assert(peekFrom(null, now, nov).state === 'available', 'no redemption is available');
  const open = peekFrom('2026-11-06T01:00:00Z', now, nov);
  assert(open.state === 'open' && open.until === '2026-11-07T01:00:00.000Z', 'redeemed 11h ago is open until +24h');
  assert(peekFrom('2026-11-05T11:59:00Z', now, nov).state === 'used', 'redeemed 24h+ ago is used');
  const dec = new Date('2026-12-01T00:00:00Z');
  assert(peekFrom('2026-11-30T20:00:00Z', new Date('2026-12-01T01:00:00Z'), dec).state === 'open', 'last month\'s look stays open past the 1st');
  assert(peekFrom('2026-11-30T20:00:00Z', new Date('2026-12-02T00:00:00Z'), dec).state === 'available', 'then December\'s look is still unspent');
  console.log('free-peek ok');
}
