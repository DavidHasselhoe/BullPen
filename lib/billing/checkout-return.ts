/**
 * Where Stripe Checkout sends the user back to. A fixed set of named targets,
 * never a caller-supplied URL, so the checkout API can't be used as an open
 * redirect.
 */

export type CheckoutReturnTarget = 'upgrade' | 'onboarding';

export function parseReturnTarget(value: unknown): CheckoutReturnTarget {
  return value === 'onboarding' ? 'onboarding' : 'upgrade';
}

export function checkoutReturnUrls(base: string, target: CheckoutReturnTarget): { success: string; cancel: string } {
  if (target === 'onboarding') {
    return { success: `${base}/dashboard?trial=started`, cancel: `${base}/get-started/trial` };
  }
  return {
    success: `${base}/upgrade?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel: `${base}/upgrade?checkout=cancelled`,
  };
}
