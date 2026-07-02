/**
 * Checkout seam. Today this captures upgrade interest (no charge); when Stripe
 * is wired, `/api/billing/checkout` returns a `{ url }` and this helper redirects
 * there — no UI changes required.
 */

export type BillingCycle = 'monthly' | 'annual';

export interface CheckoutResult {
  /** A Stripe Checkout URL (once payments are live). */
  url?: string | null;
  /** True when interest was captured but payments aren't live yet. */
  waitlisted?: boolean;
  /** True when the user is already Pro (no checkout needed). */
  alreadyPro?: boolean;
  error?: boolean;
}

/** Client helper: start (or waitlist) a Pro upgrade for the given billing cycle. */
export async function startCheckout(cycle: BillingCycle): Promise<CheckoutResult> {
  try {
    const res = await fetch('/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'pro', cycle }),
    });
    if (!res.ok) return { error: true };
    return await res.json();
  } catch {
    return { error: true };
  }
}

/**
 * Client helper: open the Stripe customer portal (manage card, invoices,
 * cancel). Returns `{ url }` when a portal session was created, or `{ error }`
 * (e.g. a comped/admin account with no Stripe customer).
 */
export async function startPortal(): Promise<CheckoutResult> {
  try {
    const res = await fetch('/api/billing/portal', { method: 'POST' });
    if (!res.ok) return { error: true };
    return await res.json();
  } catch {
    return { error: true };
  }
}
