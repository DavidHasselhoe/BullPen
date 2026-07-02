import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { createServerClient } from '@/lib/supabase/client';
import { getStripe, statusGrantsPro, TIER_PRO, TIER_FREE } from '@/lib/billing/stripe';

// Stripe needs the raw request body to verify the signature — never cache/parse.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/billing/webhook
 *
 * Stripe → BullPen. Verifies the signature, then flips users.account_tier:
 *   active | trialing  → 3 (Pro)
 *   anything else      → 1 (Free)
 *
 * Register this endpoint in the Stripe dashboard (or `stripe listen`) and put the
 * signing secret in STRIPE_WEBHOOK_SECRET.
 */
export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: 'stripe_not_configured' }, { status: 500 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'missing_signature' }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid signature';
    return NextResponse.json({ error: `webhook_error: ${message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = asId(session.customer);
        const subscriptionId = asId(session.subscription);
        const userId =
          session.client_reference_id ||
          (session.metadata?.supabase_user_id as string | undefined) ||
          null;
        await grantPro(customerId, userId, subscriptionId, 'active');
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = asId(sub.customer);
        const userId = (sub.metadata?.supabase_user_id as string | undefined) || null;
        const grantsPro = event.type !== 'customer.subscription.deleted' && statusGrantsPro(sub.status);
        await setTier(customerId, userId, grantsPro ? TIER_PRO : TIER_FREE, {
          subscriptionId: sub.id,
          status: sub.status,
        });
        break;
      }

      default:
        // Unhandled event types are fine — just acknowledge.
        break;
    }
  } catch (err) {
    // Log and 500 so Stripe retries — but never on a signature we already trusted.
    console.error('[stripe webhook] handler error', err);
    return NextResponse.json({ error: 'handler_error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

/** Grant Pro on a completed checkout (status is active/trialing at this point). */
async function grantPro(
  customerId: string | null,
  userId: string | null,
  subscriptionId: string | null,
  status: string
) {
  await setTier(customerId, userId, TIER_PRO, { subscriptionId, status });
}

/** Update the owning user row, matching by stripe_customer_id then by user id. */
async function setTier(
  customerId: string | null,
  userId: string | null,
  tier: number,
  extra: { subscriptionId?: string | null; status?: string | null }
) {
  const supabase = createServerClient();
  const patch: Record<string, unknown> = { account_tier: tier };
  if (extra.subscriptionId !== undefined) patch.stripe_subscription_id = extra.subscriptionId;
  if (extra.status !== undefined) patch.stripe_status = extra.status;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  if (customerId) {
    const { data } = await db
      .from('users')
      .update(patch)
      .eq('stripe_customer_id', customerId)
      .select('id');
    if (data && data.length > 0) return;
  }

  // Fallback: match by user id (also backfills stripe_customer_id if we have it).
  if (userId) {
    if (customerId) patch.stripe_customer_id = customerId;
    await db.from('users').update(patch).eq('id', userId);
  }
}

/** Stripe fields are `string | { id } | null` depending on expansion. */
function asId(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}
