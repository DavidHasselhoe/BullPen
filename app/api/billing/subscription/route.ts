import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { getStripe } from '@/lib/billing/stripe';

/**
 * GET /api/billing/subscription
 *
 * Whether the caller's subscription is set to cancel, read straight from
 * Stripe. The dashboard asks right after the customer portal returns, when the
 * cancellation webhook may not have landed yet, so the users row can't answer.
 *
 * `{ cancelAt: null }` when nothing is scheduled to end; otherwise the unix
 * seconds Pro ends, whether the cancel just happened, and whether it was a trial.
 */
async function handler(_request: NextRequest, _ctx: unknown, session: { userId: string }): Promise<NextResponse> {
  const stripe = getStripe();
  const { data: row } = await createServerClient()
    .from('users')
    .select('stripe_subscription_id')
    .eq('id', session.userId)
    .single();
  const subscriptionId = (row?.stripe_subscription_id as string | null) ?? null;
  if (!stripe || !subscriptionId) return NextResponse.json({ cancelAt: null });

  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const cancelAt = sub.cancel_at ?? (sub.cancel_at_period_end ? sub.items.data[0]?.current_period_end ?? null : null);
  if (!cancelAt || sub.status === 'canceled') return NextResponse.json({ cancelAt: null });

  // A 30-minute window, so Stripe's clock and ours needn't agree to the second.
  const justCancelled = !!sub.canceled_at && Date.now() / 1000 - sub.canceled_at < FRESH_CANCEL_SECONDS;
  return NextResponse.json({ cancelAt, justCancelled, trialing: sub.status === 'trialing' });
}

/** A cancel older than this was already confirmed: opening the portal later to update a card shouldn't replay it. */
const FRESH_CANCEL_SECONDS = 30 * 60;

export const GET = withAuth(handler, { rateLimit: { windowMs: 60_000, maxRequests: 20 } });
