/**
 * Subscription renewal reminder email — sent from the Stripe `invoice.upcoming`
 * webhook event so Pro users know a charge is coming before it happens.
 *
 * How many days in advance this fires is a Stripe Dashboard setting (Settings >
 * Billing > Automatic > "Upcoming renewal events"), not something this code
 * controls — Stripe only emits the event that many days before the invoice.
 */

import { createServerClient } from '@/lib/supabase/client';
import { getStripe } from '@/lib/billing/stripe';
import { sendEmail } from './resend';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://bullpen.no';

function formatAmount(amountInCents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amountInCents / 100);
}

function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function buildEmailHtml(amount: string, renewalDate: string, manageUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; padding: 24px;">
  <div style="max-width: 480px; margin: 0 auto;">
    <h1 style="font-size: 20px; margin: 0 0 8px;">Your BullPen Pro subscription renews soon</h1>
    <p style="margin: 0; font-size: 16px; color: #94a3b8;">
      Your subscription will automatically renew on <strong>${renewalDate}</strong> for <strong>${amount}</strong>.
    </p>
    <p style="margin: 16px 0 0; font-size: 14px; color: #64748b;">
      No action is needed to keep your Pro access. If you'd like to update your payment method or cancel before then, you can manage your subscription anytime.
    </p>
    <p style="margin: 20px 0 0;">
      <a href="${manageUrl}" style="display: inline-block; background: #22c55e; color: white; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: 600;">
        Manage subscription
      </a>
    </p>
    <p style="margin: 24px 0 0; font-size: 12px; color: #64748b;">
      This is a billing notice sent ahead of every renewal and isn't optional in Settings.
    </p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Send a renewal reminder for the given Stripe customer. Looks up the owning
 * user by `stripe_customer_id`, generates a fresh Customer Portal link, and
 * emails them. Silently no-ops if the user or their email can't be found —
 * this must never throw and break the webhook's 200 response.
 */
export async function sendRenewalReminderEmail(
  customerId: string,
  amountInCents: number,
  currency: string,
  renewsAtUnixSeconds: number
): Promise<void> {
  const supabase = createServerClient();
  const { data: user } = await supabase
    .from('users')
    .select('email')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  const email = (user as { email?: string | null } | null)?.email;
  if (!email) return;

  const stripe = getStripe();
  if (!stripe) return;

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${APP_URL}/upgrade`,
  });

  const amount = formatAmount(amountInCents, currency);
  const renewalDate = formatDate(renewsAtUnixSeconds);
  const html = buildEmailHtml(amount, renewalDate, portalSession.url);

  await sendEmail({
    to: email,
    subject: `Your BullPen Pro subscription renews on ${renewalDate}`,
    html,
  });
}
