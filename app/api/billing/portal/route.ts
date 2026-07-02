import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { getStripe } from '@/lib/billing/stripe';

/**
 * POST /api/billing/portal
 *
 * Returns `{ url }` for the Stripe customer portal so Pro users can update their
 * card, view invoices, or cancel. Requires a stored stripe_customer_id.
 */
export async function POST(request: NextRequest) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: 'stripe_not_configured' }, { status: 500 });
  }

  const { data: row } = await supabase
    .from('users')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single();

  const customerId = (row?.stripe_customer_id as string | null) ?? null;
  if (!customerId) {
    return NextResponse.json({ error: 'no_customer' }, { status: 400 });
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${base}/upgrade`,
  });

  return NextResponse.json({ url: session.url });
}
