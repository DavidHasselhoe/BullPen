import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { getStripe } from '@/lib/billing/stripe';

/**
 * POST /api/billing/portal
 *
 * Returns `{ url }` for the Stripe customer portal so Pro users can update their
 * card, view invoices, or cancel. Requires a stored stripe_customer_id.
 *
 * Auth via `withAuth` (cookie session) — the service-role client can't read the
 * caller's session.
 */
async function portalHandler(
  request: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: 'stripe_not_configured' }, { status: 500 });
  }

  const supabase = createServerClient();
  const { data: row } = await supabase
    .from('users')
    .select('stripe_customer_id')
    .eq('id', session.userId)
    .single();

  const customerId = (row?.stripe_customer_id as string | null) ?? null;
  if (!customerId) {
    return NextResponse.json({ error: 'no_customer' }, { status: 400 });
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${base}/upgrade`,
  });

  return NextResponse.json({ url: portalSession.url });
}

export const POST = withAuth(portalHandler, {
  rateLimit: { windowMs: 60_000, maxRequests: 20 },
});
