import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { tierFromUser, isPro } from '@/lib/billing/tier';
import {
  getStripe,
  priceIdForCycle,
  isStripeConfigured,
  PRO_TRIAL_DAYS,
} from '@/lib/billing/stripe';

/**
 * POST /api/billing/checkout  { plan: 'pro', cycle: 'monthly' | 'annual' }
 *
 * Creates a Stripe Checkout Session and returns `{ url }`; the client
 * (`startCheckout`) redirects there. Grants Pro via the webhook once payment
 * completes.
 *
 * If Stripe isn't configured yet (no keys / price IDs), it falls back to the
 * original stub: captures interest on the user's profile and returns
 * `{ waitlisted: true }`.
 *
 * Auth goes through `withAuth` (cookie session) — the service-role client can't
 * read the caller's session, so `getUser()` here would always 401.
 */
async function checkoutHandler(
  request: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const supabase = createServerClient();
  const userId = session.userId;

  const body = await request.json().catch(() => ({}));
  const cycle = body?.cycle === 'monthly' ? 'monthly' : 'annual';

  const { data: row } = await supabase
    .from('users')
    .select('account_tier, role, email, stripe_customer_id, settings')
    .eq('id', userId)
    .single();

  // Already Pro? Nothing to sell — surface it so the UI can send them to the portal.
  if (isPro(tierFromUser(row?.account_tier as number | null, row?.role as string | null))) {
    return NextResponse.json({ url: null, alreadyPro: true });
  }

  const stripe = getStripe();
  const priceId = priceIdForCycle(cycle);

  // ── Fallback: Stripe not wired yet → waitlist stub (no charge) ───────────────
  if (!stripe || !isStripeConfigured() || !priceId) {
    try {
      const settings = (row?.settings as Record<string, unknown>) ?? {};
      const merged = {
        ...settings,
        upgrade_interest: { plan: 'pro', cycle, at: new Date().toISOString() },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('users').update({ settings: merged }).eq('id', userId);
    } catch {
      // non-critical — still return waitlisted so the UX doesn't error
    }
    return NextResponse.json({ waitlisted: true, url: null });
  }

  // ── Real Stripe Checkout ─────────────────────────────────────────────────────
  const email = (row?.email as string | null) ?? undefined;

  // Reuse the customer if we've created one before, else create + persist it.
  let customerId = (row?.stripe_customer_id as string | null) ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email,
      metadata: { supabase_user_id: userId },
    });
    customerId = customer.id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('users')
      .update({ stripe_customer_id: customerId })
      .eq('id', userId);
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;

  // Stripe Tax adds VAT/sales tax on top of the price at checkout ("tax-exclusive").
  // Requires Stripe Tax to be active on the account, so it's opt-in via env to
  // avoid failing session creation before tax is configured.
  const automaticTax = process.env.STRIPE_AUTOMATIC_TAX === 'true';

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: PRO_TRIAL_DAYS,
      metadata: { supabase_user_id: userId },
    },
    client_reference_id: userId,
    metadata: { supabase_user_id: userId, cycle },
    allow_promotion_codes: true,
    ...(automaticTax
      ? {
          automatic_tax: { enabled: true },
          billing_address_collection: 'auto' as const,
          customer_update: { address: 'auto' as const },
        }
      : {}),
    success_url: `${base}/upgrade?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/upgrade?checkout=cancelled`,
  });

  return NextResponse.json({ url: checkoutSession.url });
}

export const POST = withAuth(checkoutHandler, {
  rateLimit: { windowMs: 60_000, maxRequests: 20 },
});
