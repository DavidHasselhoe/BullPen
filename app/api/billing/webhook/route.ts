import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { createServerClient } from '@/lib/supabase/client';
import { getStripe, statusGrantsPro, TIER_PRO, TIER_FREE } from '@/lib/billing/stripe';
import { sendRenewalReminderEmail } from '@/lib/email/billing-reminder';
import { logSecurityEvent } from '@/lib/security/security-events';

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
 * Also sends a renewal reminder email on `invoice.upcoming` (see
 * lib/email/billing-reminder.ts). How many days ahead that event fires is a
 * Stripe Dashboard setting (Settings > Billing > Automatic > "Upcoming
 * renewal events"), not something this route controls.
 *
 * Register this endpoint in the Stripe dashboard (or `stripe listen`), enable
 * the events this switch handles (including `invoice.upcoming`), and put the
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

  // Stripe's own event timestamp — guards against applying a redelivered or
  // out-of-order event over state a more recent event already established
  // (e.g. a late-redelivered checkout.session.completed re-granting Pro after
  // a real, more recent cancellation already processed).
  const eventCreatedAt = new Date(event.created * 1000);

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
        if (await isStaleEvent(customerId, userId, eventCreatedAt)) break;

        // Stripe doesn't guarantee this fires before/after
        // customer.subscription.created, so re-check here too — otherwise a
        // blocked trial could still get granted Pro via this event alone.
        if (subscriptionId) {
          const stripe = getStripe();
          const sub = stripe ? await stripe.subscriptions.retrieve(subscriptionId) : null;
          if (sub?.status === 'trialing' && (await enforceTrialFingerprint(sub, customerId, userId))) {
            break;
          }
        }

        await grantPro(customerId, userId, subscriptionId, 'active', eventCreatedAt);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = asId(sub.customer);
        const userId = (sub.metadata?.supabase_user_id as string | undefined) || null;
        if (await isStaleEvent(customerId, userId, eventCreatedAt)) break;

        if (event.type === 'customer.subscription.created' && sub.status === 'trialing') {
          // Card already claimed a trial on a different account — collapse
          // this one to $0 days instead of granting another 14. The
          // trial_end update below fires its own subscription.updated event
          // with the real post-charge status, so skip granting Pro here.
          const revoked = await enforceTrialFingerprint(sub, customerId, userId);
          if (revoked) break;
        }

        const grantsPro = event.type !== 'customer.subscription.deleted' && statusGrantsPro(sub.status);
        await setTier(customerId, userId, grantsPro ? TIER_PRO : TIER_FREE, {
          subscriptionId: sub.id,
          status: sub.status,
          lastEventAt: eventCreatedAt,
        });
        break;
      }

      case 'invoice.upcoming': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = asId(invoice.customer);
        // Only subscription renewals — one-off invoices (e.g. a manual
        // correction) don't need a "your subscription renews" email.
        const subscriptionId = invoice.parent?.subscription_details?.subscription;
        if (customerId && subscriptionId && invoice.next_payment_attempt) {
          try {
            await sendRenewalReminderEmail(
              customerId,
              invoice.amount_due,
              invoice.currency,
              invoice.next_payment_attempt
            );
          } catch (err) {
            // Best-effort — a failed reminder email must never fail the webhook.
            console.error('[stripe webhook] renewal reminder email failed', err);
          }
        }
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
  status: string,
  lastEventAt: Date
) {
  await setTier(customerId, userId, TIER_PRO, { subscriptionId, status, lastEventAt });
}

/**
 * True if the row this event would update already reflects a MORE RECENT
 * Stripe event than this one — i.e. this event is a redelivered or
 * out-of-order webhook and must not be applied over newer state. Ties (two
 * events sharing the same second) are treated as not-stale so both apply,
 * since `event.created` is only second-granularity.
 *
 * Accepted tradeoff: this is a plain read-then-write, not a single atomic
 * operation — a small TOCTOU race exists if two deliveries for the same user
 * are processed concurrently. Low-probability and low-severity (can only
 * affect ordering between two already-current events, never a revert to
 * stale data); closing it properly belongs to the later event-ledger work.
 */
async function isStaleEvent(
  customerId: string | null,
  userId: string | null,
  eventCreatedAt: Date
): Promise<boolean> {
  const supabase = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  let row: { stripe_last_event_at: string | null } | null = null;
  if (customerId) {
    const { data } = await db
      .from('users')
      .select('stripe_last_event_at')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();
    row = data;
  }
  if (!row && userId) {
    const { data } = await db
      .from('users')
      .select('stripe_last_event_at')
      .eq('id', userId)
      .maybeSingle();
    row = data;
  }

  if (!row?.stripe_last_event_at) return false;
  return new Date(row.stripe_last_event_at) > eventCreatedAt;
}

/** Update the owning user row, matching by stripe_customer_id then by user id. */
async function setTier(
  customerId: string | null,
  userId: string | null,
  tier: number,
  extra: { subscriptionId?: string | null; status?: string | null; lastEventAt?: Date }
) {
  const supabase = createServerClient();
  const patch: Record<string, unknown> = { account_tier: tier };
  if (extra.subscriptionId !== undefined) patch.stripe_subscription_id = extra.subscriptionId;
  if (extra.status !== undefined) patch.stripe_status = extra.status;
  if (extra.lastEventAt !== undefined) patch.stripe_last_event_at = extra.lastEventAt.toISOString();

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

/**
 * Free-trial abuse guard: emails/IPs are trivially spoofed by making a new
 * account, but the card is not. Looks up the trialing subscription's payment
 * method fingerprint against every fingerprint that's ever started a trial;
 * if it belongs to a different Stripe customer, ends this trial immediately
 * (`trial_end: 'now'`, which triggers an immediate charge attempt) instead
 * of letting a second account ride the same card for another 14 days.
 * Returns true if the trial was revoked.
 */
async function enforceTrialFingerprint(
  sub: Stripe.Subscription,
  customerId: string | null,
  userId: string | null
): Promise<boolean> {
  const stripe = getStripe();
  if (!stripe || !customerId) return false;

  let pmId = asId(sub.default_payment_method);
  if (!pmId) {
    // Not always attached by the time this event is sent — refetch once.
    const fresh = await stripe.subscriptions.retrieve(sub.id);
    pmId = asId(fresh.default_payment_method);
  }
  if (!pmId) return false;

  const pm = await stripe.paymentMethods.retrieve(pmId);
  const fingerprint = pm.card?.fingerprint;
  if (!fingerprint) return false;

  const supabase = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: existing } = await db
    .from('stripe_trial_fingerprints')
    .select('customer_id')
    .eq('fingerprint', fingerprint)
    .maybeSingle();

  if (!existing) {
    await db
      .from('stripe_trial_fingerprints')
      .insert({ fingerprint, user_id: userId, customer_id: customerId, subscription_id: sub.id });
    return false;
  }

  // Same account re-subscribing (e.g. after a cancel) — not abuse.
  if (existing.customer_id === customerId) return false;

  await stripe.subscriptions.update(sub.id, { trial_end: 'now' });
  logSecurityEvent('trial_abuse_blocked', {
    userId,
    identifier: fingerprint,
    metadata: { customerId, previousCustomerId: existing.customer_id, subscriptionId: sub.id },
  });
  return true;
}

/** Stripe fields are `string | { id } | null` depending on expansion. */
function asId(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}
