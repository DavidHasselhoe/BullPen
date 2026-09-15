# Onboarding Redesign + Day-One 7-Day Trial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the survey-style `/get-started` quiz with setup steps (explanation style, pick stocks, alerts, real preview + signup) and end onboarding with a skippable 7-day free trial offer, with a reliable reminder email before the trial ends.

**Architecture:** Onboarding stays a client-side step machine in `GetStartedFlow`, staging choices in localStorage until signup, then `flushPendingOnboardingData` writes them (users row, watchlist, notification settings). A new authenticated page `/get-started/trial` starts Stripe Checkout with an onboarding-specific return. Billing reminders live in the existing Stripe webhook: a new `customer.subscription.trial_will_end` case, the renewal email skipped while trialing, and an email when the repeat-trial guard revokes a trial.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase, Stripe (Checkout + webhooks), Resend, TanStack Query, PostHog (`trackEvent`). Tests are assert-based `tsx` scripts (no test framework), same as `scripts/test-holdings-diff.ts`.

**Spec:** `docs/superpowers/specs/2026-09-15-onboarding-trial-paywall-design.md`

## Global Constraints

- Trial length is `PRICING.trialDays` = 7 everywhere. Never hardcode a day count in copy; every existing string already interpolates `trialDays`.
- User-facing copy: no em dash or en dash anywhere (toasts, labels, emails, onboarding). Use periods or commas.
- Gains/losses are never color alone: always a `+`/`−` sign and an arrow.
- Onboarding copy is English-only (the flow is not i18n'd today). Billing copy on `/upgrade` stays i18n'd.
- Anonymous (pre-signup) screens must not trigger TwelveData fundamentals: Health Score is read from `screener_stats` only, never computed.
- Picked stocks go to the watchlist (`POST /api/watchlist`), not holdings.
- The onboarding trial screen is skippable: primary "Start my free week", quiet "Continue with Free".
- Commit to `preview` only (`git push origin preview`). Never commit unrelated files; stage explicit paths.
- Run `npm run lint` before each commit. Warnings are acceptable, errors are not.
- The live Stripe webhook change (adding `customer.subscription.trial_will_end`) requires David's explicit approval in chat before it is applied.

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `lib/billing/entitlements.ts` | modify | `PRICING.trialDays` 14 → 7 |
| `lib/billing/trial-copy.ts` | create | Pure helpers: trial terms line, renewal-email gate |
| `lib/email/billing-reminder.ts` | modify | Add trial-ending and trial-revoked emails (pure HTML builders + senders) |
| `lib/notifications/notifications-db.ts` | modify | Add `'billing'` to the notification type union |
| `app/api/billing/webhook/route.ts` | modify | `trial_will_end` case, skip renewal email while trialing, email on revoked trial |
| `lib/billing/checkout-return.ts` | create | Pure helper building success/cancel URLs per return target |
| `app/api/billing/checkout/route.ts` | modify | Accept `returnTo: 'onboarding'` |
| `lib/billing/checkout.ts` | modify | `startCheckout(cycle, options?)` passes `returnTo` |
| `lib/onboarding/starter-stocks.ts` | create | Shared suggestion list (dashboard popup + onboarding) |
| `lib/onboarding/pending-onboarding.ts` | rewrite | v2 staging: explanation style, picks, alert choices, flow progress |
| `lib/onboarding/flush.ts` | rewrite | Write v2 payload: users row, watchlist, notification settings |
| `components/onboarding/PendingOnboardingFlush.tsx` | modify | Use shared list; hide when watchlist has items |
| `components/get-started/quiz-questions.ts` | delete | Replaced by setup steps |
| `lib/onboarding/reveal-copy.ts` | delete | Reveal paragraph removed |
| `components/get-started/QuizStep.tsx` | delete | Replaced |
| `components/get-started/RevealStep.tsx` | delete | Replaced by `PreviewStep` |
| `components/get-started/StepShell.tsx` | create | Shared motion wrapper + progress + back button |
| `components/get-started/ExplainStyleStep.tsx` | create | Screen 1 |
| `components/get-started/PickStocksStep.tsx` | create | Screen 2 |
| `components/get-started/AlertsStep.tsx` | create | Screen 3 |
| `components/get-started/PreviewStep.tsx` | create | Screen 4 (preview + signup) |
| `components/get-started/GetStartedFlow.tsx` | rewrite | Step machine for the 4 pre-signup screens |
| `components/get-started/GetStartedSignupForm.tsx` | modify | Relabel, route to trial screen, Google `next` |
| `app/get-started/page.tsx` | modify | Signed-in redirect goes to trial screen when onboarding just finished |
| `app/api/onboarding/health-scores/route.ts` | create | Cache-only Health Scores from `screener_stats` |
| `app/get-started/trial/page.tsx` | create | Screen 5: 7-day trial offer |
| `components/billing/TrialStartedModal.tsx` | create | Opens `UpgradeSuccessModal` on `/dashboard?trial=started` |
| `app/dashboard/DashboardClient.tsx` | modify | Mount `TrialStartedModal` |
| `scripts/test-onboarding-trial.ts` | create | Assert-based checks for all pure logic in this plan |
| `package.json` | modify | `"test-onboarding-trial"` script |

---

### Task 1: 7-day trial and trial copy helpers

**Files:**
- Modify: `lib/billing/entitlements.ts:23`
- Create: `lib/billing/trial-copy.ts`
- Create: `scripts/test-onboarding-trial.ts`
- Modify: `package.json` (scripts block, next to `"test-holdings-diff"`)

**Interfaces:**
- Produces: `trialTermsLine(cycle: BillingCycle): string`, `shouldSendRenewalReminder(status: string | null | undefined): boolean`, `hasDash(text: string): boolean` (test helper, local to the script)

- [ ] **Step 1: Write the failing test**

Create `scripts/test-onboarding-trial.ts`:

```ts
/**
 * Assert-based checks for the onboarding redesign and 7-day trial. No framework.
 *   npm run test-onboarding-trial
 */

import assert from 'node:assert/strict';
import { PRICING } from '../lib/billing/entitlements';
import { trialTermsLine, shouldSendRenewalReminder } from '../lib/billing/trial-copy';

/** CLAUDE.md: user-facing copy never uses an em dash or en dash. */
function hasDash(text: string): boolean {
  return /[–—]/.test(text);
}

// ── Task 1: trial length and terms ───────────────────────────────────────────
assert.equal(PRICING.trialDays, 7, 'trial is 7 days everywhere');
assert.equal(
  trialTermsLine('annual'),
  "Free for 7 days, then $108/year. We'll email you 3 days before your trial ends. Cancel anytime."
);
assert.equal(
  trialTermsLine('monthly'),
  "Free for 7 days, then $12/month. We'll email you 3 days before your trial ends. Cancel anytime."
);
assert.ok(!hasDash(trialTermsLine('annual')), 'terms line has no dash');
assert.equal(shouldSendRenewalReminder('trialing'), false, 'trialing gets the trial email, not the renewal one');
assert.equal(shouldSendRenewalReminder('active'), true);
assert.equal(shouldSendRenewalReminder(null), true);

console.log('test-onboarding-trial: all assertions passed');
```

Add to `package.json` scripts:

```json
"test-onboarding-trial": "tsx scripts/test-onboarding-trial.ts",
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test-onboarding-trial`
Expected: FAIL, `Cannot find module '../lib/billing/trial-copy'`.

- [ ] **Step 3: Write minimal implementation**

In `lib/billing/entitlements.ts` change line 23:

```ts
  trialDays: 7,
```

Create `lib/billing/trial-copy.ts`:

```ts
/**
 * Copy and decisions shared by every surface that offers or bills the Pro
 * trial. Pure functions so the wording and the email gate are testable
 * (scripts/test-onboarding-trial.ts) and can never drift between surfaces.
 */

import { PRICING } from './entitlements';
import type { BillingCycle } from './checkout';

/** The terms line shown directly under a trial button. States the price after
 *  the trial, the reminder, and cancellation, which an auto-renewing trial
 *  must disclose up front. */
export function trialTermsLine(cycle: BillingCycle): string {
  const after =
    cycle === 'annual' ? `$${PRICING.proAnnualPerMonth * 12}/year` : `$${PRICING.proMonthly}/month`;
  return `Free for ${PRICING.trialDays} days, then ${after}. We'll email you 3 days before your trial ends. Cancel anytime.`;
}

/**
 * Whether `invoice.upcoming` should send the generic renewal email. A
 * subscription still in its trial gets the dedicated trial-ending email from
 * `customer.subscription.trial_will_end` instead, so it is never sent two
 * reminders for the same charge.
 */
export function shouldSendRenewalReminder(subscriptionStatus: string | null | undefined): boolean {
  return subscriptionStatus !== 'trialing';
}
```

In `app/api/billing/webhook/route.ts` update the stale comment at the `enforceTrialFingerprint` call (around line 93): replace `instead of granting another 14.` with `instead of granting another trial.`

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test-onboarding-trial`
Expected: `test-onboarding-trial: all assertions passed`

- [ ] **Step 5: Commit**

```bash
npm run lint
git add lib/billing/entitlements.ts lib/billing/trial-copy.ts scripts/test-onboarding-trial.ts package.json app/api/billing/webhook/route.ts
git commit -m "feat(billing): 7-day Pro trial and shared trial terms copy"
git push origin preview
```

---

### Task 2: Trial-ending reminder, no double emails, repeat-trial email

**Files:**
- Modify: `lib/email/billing-reminder.ts`
- Modify: `lib/notifications/notifications-db.ts:27`
- Modify: `app/api/billing/webhook/route.ts` (switch cases + `enforceTrialFingerprint`)
- Test: `scripts/test-onboarding-trial.ts`

**Interfaces:**
- Consumes: `shouldSendRenewalReminder` (Task 1), `PRICING`
- Produces:
  - `buildTrialEndingEmailHtml(amount: string, endDate: string, manageUrl: string): string`
  - `buildTrialRevokedEmailHtml(amount: string, moneyBackDays: number): string`
  - `sendTrialEndingEmail(customerId: string, amountInCents: number, currency: string, trialEndUnixSeconds: number): Promise<void>`
  - `sendTrialRevokedEmail(customerId: string, amountInCents: number, currency: string): Promise<void>`

- [ ] **Step 1: Write the failing test**

Append to `scripts/test-onboarding-trial.ts` before the final `console.log`:

```ts
// ── Task 2: trial emails ─────────────────────────────────────────────────────
import { buildTrialEndingEmailHtml, buildTrialRevokedEmailHtml } from '../lib/email/billing-reminder';

const ending = buildTrialEndingEmailHtml('$108.00', 'September 22, 2026', 'https://billing.example/portal');
assert.ok(ending.includes('September 22, 2026'), 'trial-ending email states the end date');
assert.ok(ending.includes('$108.00'), 'trial-ending email states the amount');
assert.ok(ending.includes('https://billing.example/portal'), 'trial-ending email links to manage/cancel');
assert.ok(!hasDash(ending), 'trial-ending email has no dash');

const revoked = buildTrialRevokedEmailHtml('$12.00', 30);
assert.ok(revoked.includes('$12.00'), 'revoked email states what was charged');
assert.ok(revoked.includes('30 days'), 'revoked email states the refund window');
assert.ok(!hasDash(revoked), 'revoked email has no dash');
```

Move the new `import` line to the top of the file with the other imports (ES imports must be top-level).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test-onboarding-trial`
Expected: FAIL, `buildTrialEndingEmailHtml` is not exported.

- [ ] **Step 3: Implement the email builders and senders**

In `lib/email/billing-reminder.ts`, add this import next to the existing ones:

```ts
import { PRICING } from '@/lib/billing/entitlements';
```

Then add after `buildEmailHtml` (reuses the file's `formatAmount`, `formatDate`, `APP_URL`, `sendEmail`, `createServerClient`, `getStripe`):

```ts
/** Shared shell so all billing emails look the same. `body` is trusted HTML built here. */
function emailShell(title: string, body: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; padding: 24px;">
  <div style="max-width: 480px; margin: 0 auto;">
    <h1 style="font-size: 20px; margin: 0 0 8px;">${title}</h1>
    ${body}
  </div>
</body>
</html>
  `.trim();
}

export function buildTrialEndingEmailHtml(amount: string, endDate: string, manageUrl: string): string {
  return emailShell(
    'Your free week of BullPen Pro is almost over',
    `
    <p style="margin: 0; font-size: 16px; color: #94a3b8;">
      Your trial ends on <strong>${endDate}</strong>. After that you'll be charged <strong>${amount}</strong> and Pro continues automatically.
    </p>
    <p style="margin: 16px 0 0; font-size: 14px; color: #64748b;">
      Not for you? Cancel before ${endDate} and you won't be charged.
    </p>
    <p style="margin: 20px 0 0;">
      <a href="${manageUrl}" style="display: inline-block; background: #22c55e; color: white; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: 600;">
        Manage or cancel
      </a>
    </p>
    <p style="margin: 24px 0 0; font-size: 12px; color: #64748b;">
      This is a billing notice sent before every trial ends and isn't optional in Settings.
    </p>`
  );
}

export function buildTrialRevokedEmailHtml(amount: string, moneyBackDays: number): string {
  return emailShell(
    'Your BullPen Pro subscription has started',
    `
    <p style="margin: 0; font-size: 16px; color: #94a3b8;">
      The card you used has already had a free trial of BullPen Pro on another account, so this subscription started right away and you were charged <strong>${amount}</strong>.
    </p>
    <p style="margin: 16px 0 0; font-size: 14px; color: #64748b;">
      If that isn't what you wanted, reply to this email within ${moneyBackDays} days of the charge for a full refund.
    </p>`
  );
}

/** Looks up the user's email by Stripe customer id. Null when not found. */
async function emailForCustomer(customerId: string): Promise<string | null> {
  const { data } = await createServerClient()
    .from('users')
    .select('email')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  return (data as { email?: string | null } | null)?.email ?? null;
}

export async function sendTrialEndingEmail(
  customerId: string,
  amountInCents: number,
  currency: string,
  trialEndUnixSeconds: number
): Promise<void> {
  const email = await emailForCustomer(customerId);
  const stripe = getStripe();
  if (!email || !stripe) return;

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${APP_URL}/dashboard`,
  });
  const endDate = formatDate(trialEndUnixSeconds);
  await sendEmail({
    to: email,
    subject: `Your BullPen Pro trial ends on ${endDate}`,
    html: buildTrialEndingEmailHtml(formatAmount(amountInCents, currency), endDate, portalSession.url),
  });
}

export async function sendTrialRevokedEmail(customerId: string, amountInCents: number, currency: string): Promise<void> {
  const email = await emailForCustomer(customerId);
  if (!email) return;
  await sendEmail({
    to: email,
    subject: 'Your BullPen Pro subscription has started',
    html: buildTrialRevokedEmailHtml(formatAmount(amountInCents, currency), PRICING.moneyBackDays),
  });
}
```

Update the file's top doc comment to mention the two new emails (one line each).

In `lib/notifications/notifications-db.ts` line 27, add `'billing'` to the `type` union:

```ts
  type: 'price_move' | 'earnings' | 'ai_insight' | 'market' | 'dividend' | 'academy' | 'health_score' | 'weekly_pick' | 'daily_brief' | 'referral' | 'institution_filing' | 'billing';
```

(The `notifications.type` column has no CHECK constraint, verified 2026-09-15, so no migration.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test-onboarding-trial`
Expected: `test-onboarding-trial: all assertions passed`

- [ ] **Step 5: Wire the webhook**

In `app/api/billing/webhook/route.ts`:

Imports:

```ts
import { sendRenewalReminderEmail, sendTrialEndingEmail, sendTrialRevokedEmail } from '@/lib/email/billing-reminder';
import { shouldSendRenewalReminder } from '@/lib/billing/trial-copy';
import { createNotification } from '@/lib/notifications/notifications-db';
```

Add a helper near `asId`:

```ts
/** What the first charge after the trial will be: sum of the subscription's item prices.
 *  Prices are tax-exclusive and automatic tax is off, so this is what Stripe will charge. */
function upcomingAmountCents(sub: Stripe.Subscription): number {
  return sub.items.data.reduce((sum, item) => sum + (item.price?.unit_amount ?? 0) * (item.quantity ?? 1), 0);
}
```

Add a new case before `invoice.upcoming`:

```ts
      case 'customer.subscription.trial_will_end': {
        // Stripe sends this 3 days before trial_end. The one reminder a trial
        // user gets; invoice.upcoming skips trialing subscriptions below.
        const sub = event.data.object as Stripe.Subscription;
        const customerId = asId(sub.customer);
        if (!customerId || sub.status !== 'trialing' || !sub.trial_end) break;
        try {
          await sendTrialEndingEmail(customerId, upcomingAmountCents(sub), sub.currency, sub.trial_end);
          const userId = (sub.metadata?.supabase_user_id as string | undefined) ?? null;
          if (userId) {
            const endDate = new Date(sub.trial_end * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
            await createNotification({
              user_id: userId,
              type: 'billing',
              title: 'Your free week ends soon',
              message: `Your Pro trial ends on ${endDate}. Cancel before then in Settings if you don't want to continue.`,
              entity_type: 'user',
              entity_id: `trial_end:${sub.id}`,
              severity: 'info',
            });
          }
        } catch (err) {
          // Best-effort, like the renewal email: never fail the webhook over a reminder.
          console.error('[stripe webhook] trial ending reminder failed', err);
        }
        break;
      }
```

In the existing `invoice.upcoming` case, gate the send on the subscription status. Replace the `if (customerId && subscriptionId && invoice.next_payment_attempt) {` block's body with:

```ts
          try {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            if (shouldSendRenewalReminder(subscription.status)) {
              await sendRenewalReminderEmail(
                customerId,
                invoice.amount_due,
                invoice.currency,
                invoice.next_payment_attempt
              );
            }
          } catch (err) {
            // Best-effort — a failed reminder email must never fail the webhook.
            console.error('[stripe webhook] renewal reminder email failed', err);
          }
```

(`stripe` is the non-null client from the top of `POST`.)

In `enforceTrialFingerprint`, after `await stripe.subscriptions.update(sub.id, { trial_end: 'now' });`, add:

```ts
  // Checkout showed this customer a free trial; tell them plainly why they were
  // charged today and how to get a refund. Best-effort.
  try {
    await sendTrialRevokedEmail(customerId, upcomingAmountCents(sub), sub.currency);
  } catch (err) {
    console.error('[stripe webhook] trial revoked email failed', err);
  }
```

- [ ] **Step 6: Check how the notification bell renders an unknown type**

Run: `npx eslint app/api/billing/webhook/route.ts lib/email/billing-reminder.ts lib/notifications/notifications-db.ts`
Expected: no errors.

Then open `components/notifications/NotificationItem.tsx` and find where `type` picks an icon. If it is a `switch`/map with no default, add a `billing` entry using the `CreditCard` icon from `lucide-react`:

```tsx
case 'billing':
  return CreditCard;
```

If a default branch already exists, leave it.

- [ ] **Step 7: Enable the Stripe event (needs David's approval)**

Ask David in chat: "OK to add `customer.subscription.trial_will_end` to the live webhook endpoint `we_1TosLYENL12SSga4xqgJqVRR`?" Only after a yes, update the endpoint via the Stripe MCP (`stripe_api_write`, operation `PostWebhookEndpointsWebhookEndpoint`) with `enabled_events` set to exactly:

```json
["checkout.session.completed","customer.subscription.created","customer.subscription.updated","customer.subscription.deleted","invoice.upcoming","customer.subscription.trial_will_end"]
```

Then re-read it (`GetWebhookEndpointsWebhookEndpoint`) and confirm all six events are listed.

- [ ] **Step 8: Test-mode end-to-end check**

With the test-mode keys in `.env.local` and `stripe listen --forward-to localhost:3000/api/billing/webhook` running against a dev server started by you:
1. Create a test customer with a test clock, attach `tok_visa`, create a subscription on the monthly test price with `trial_period_days: 7` and `metadata.supabase_user_id` set to a throwaway test user.
2. Advance the test clock to 3 days before `trial_end`. Expect the webhook log to show `customer.subscription.trial_will_end` handled, a Resend email with subject `Your BullPen Pro trial ends on …`, and a `notifications` row with `type = 'billing'`.
3. Confirm no `Your BullPen Pro subscription renews on …` email was sent for that invoice.
4. Delete the test customer and the test user afterwards.

- [ ] **Step 9: Commit**

```bash
npm run lint
git add lib/email/billing-reminder.ts lib/notifications/notifications-db.ts app/api/billing/webhook/route.ts scripts/test-onboarding-trial.ts components/notifications/NotificationItem.tsx
git commit -m "feat(billing): email before the trial ends, one reminder not two, explain revoked trials"
git push origin preview
```

(Drop `NotificationItem.tsx` from `git add` if Step 6 needed no change.)

---

### Task 3: Checkout returns to onboarding

**Files:**
- Create: `lib/billing/checkout-return.ts`
- Modify: `app/api/billing/checkout/route.ts:37-38,157-158`
- Modify: `lib/billing/checkout.ts:20-32`
- Test: `scripts/test-onboarding-trial.ts`

**Interfaces:**
- Produces:
  - `type CheckoutReturnTarget = 'upgrade' | 'onboarding'`
  - `checkoutReturnUrls(base: string, target: CheckoutReturnTarget): { success: string; cancel: string }`
  - `parseReturnTarget(value: unknown): CheckoutReturnTarget`
  - `startCheckout(cycle: BillingCycle, options?: { returnTo?: CheckoutReturnTarget }): Promise<CheckoutResult>`

- [ ] **Step 1: Write the failing test**

Add to the imports at the top of `scripts/test-onboarding-trial.ts`:

```ts
import { checkoutReturnUrls, parseReturnTarget } from '../lib/billing/checkout-return';
```

Append before the final `console.log`:

```ts
// ── Task 3: checkout return URLs ─────────────────────────────────────────────
assert.deepEqual(checkoutReturnUrls('https://bullpen.no', 'upgrade'), {
  success: 'https://bullpen.no/upgrade?checkout=success&session_id={CHECKOUT_SESSION_ID}',
  cancel: 'https://bullpen.no/upgrade?checkout=cancelled',
});
assert.deepEqual(checkoutReturnUrls('https://bullpen.no', 'onboarding'), {
  success: 'https://bullpen.no/dashboard?trial=started',
  cancel: 'https://bullpen.no/get-started/trial',
});
assert.equal(parseReturnTarget('onboarding'), 'onboarding');
assert.equal(parseReturnTarget('https://evil.example'), 'upgrade', 'anything unknown falls back, never a raw URL');
assert.equal(parseReturnTarget(undefined), 'upgrade');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test-onboarding-trial`
Expected: FAIL, cannot find module `checkout-return`.

- [ ] **Step 3: Implement**

Create `lib/billing/checkout-return.ts`:

```ts
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
```

In `app/api/billing/checkout/route.ts`:

Import:

```ts
import { checkoutReturnUrls, parseReturnTarget } from '@/lib/billing/checkout-return';
```

After `const cycle = ...` (line 38):

```ts
  const returnTarget = parseReturnTarget(body?.returnTo);
```

Replace the two lines `success_url: ...` and `cancel_url: ...` (lines 157-158) with:

```ts
      success_url: checkoutReturnUrls(base, returnTarget).success,
      cancel_url: checkoutReturnUrls(base, returnTarget).cancel,
```

Change the idempotency key so the two targets never collide on one cached session:

```ts
    const idempotencyKey = `checkout:${userId}:${cycle}:${returnTarget}`;
```

In `lib/billing/checkout.ts` replace `startCheckout`:

```ts
/** Client helper: start (or waitlist) a Pro upgrade for the given billing cycle. */
export async function startCheckout(
  cycle: BillingCycle,
  options: { returnTo?: 'upgrade' | 'onboarding' } = {}
): Promise<CheckoutResult> {
  try {
    const res = await fetch('/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'pro', cycle, returnTo: options.returnTo ?? 'upgrade' }),
    });
    if (!res.ok) return { error: true };
    return await res.json();
  } catch {
    return { error: true };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test-onboarding-trial`
Expected: `test-onboarding-trial: all assertions passed`

- [ ] **Step 5: Commit**

```bash
npm run lint
git add lib/billing/checkout-return.ts app/api/billing/checkout/route.ts lib/billing/checkout.ts scripts/test-onboarding-trial.ts
git commit -m "feat(billing): checkout can return to onboarding instead of /upgrade"
git push origin preview
```

---

### Task 4: Onboarding staging v2 and flush

**Files:**
- Create: `lib/onboarding/starter-stocks.ts`
- Rewrite: `lib/onboarding/pending-onboarding.ts`
- Rewrite: `lib/onboarding/flush.ts`
- Modify: `components/onboarding/PendingOnboardingFlush.tsx`
- Test: `scripts/test-onboarding-trial.ts`

**Interfaces:**
- Produces:
  - `STARTER_STOCKS: { ticker: string; name: string }[]` (11 entries)
  - `type ExplainStyle = 'plain' | 'market'`
  - `interface StockPick { ticker: string; name: string }`
  - `interface AlertChoices { price_alerts: boolean; upcoming_earnings: boolean; dividend_reminder: boolean }`
  - `const DEFAULT_ALERTS: AlertChoices` (all true)
  - `interface OnboardingDraft { style?: ExplainStyle; picks: StockPick[]; alerts: AlertChoices }`
  - `interface PendingOnboarding { style: ExplainStyle; picks: StockPick[]; alerts: AlertChoices }`
  - `experienceLevelFor(style: ExplainStyle): 'beginner' | 'intermediate'`
  - `parsePendingOnboarding(raw: string | null, now: number): PendingOnboarding | null`
  - `savePendingOnboarding(p: PendingOnboarding): void`, `readPendingOnboarding(): PendingOnboarding | null`, `clearPendingOnboarding(): void`, `hasPendingOnboarding(): boolean`
  - `saveDraft(step: number, draft: OnboardingDraft): void`, `readDraft(): { step: number; draft: OnboardingDraft } | null`, `clearDraft(): void`
  - `notificationOverrides(alerts: AlertChoices): Record<string, boolean>`
  - `flushPendingOnboardingData(userId: string): Promise<void>` (same name as today, so `AuthProvider` needs no change)

- [ ] **Step 1: Write the failing test**

Add to the imports at the top of `scripts/test-onboarding-trial.ts`:

```ts
import {
  parsePendingOnboarding,
  experienceLevelFor,
  notificationOverrides,
  DEFAULT_ALERTS,
} from '../lib/onboarding/pending-onboarding';
import { STARTER_STOCKS } from '../lib/onboarding/starter-stocks';
```

Append before the final `console.log`:

```ts
// ── Task 4: onboarding staging ───────────────────────────────────────────────
const now = Date.parse('2026-09-15T12:00:00Z');
const good = JSON.stringify({
  version: 2,
  savedAt: '2026-09-15T11:00:00Z',
  style: 'plain',
  picks: [{ ticker: 'NVDA', name: 'NVIDIA' }],
  alerts: { price_alerts: true, upcoming_earnings: false, dividend_reminder: true },
});
assert.deepEqual(parsePendingOnboarding(good, now), {
  style: 'plain',
  picks: [{ ticker: 'NVDA', name: 'NVIDIA' }],
  alerts: { price_alerts: true, upcoming_earnings: false, dividend_reminder: true },
});
assert.equal(parsePendingOnboarding(null, now), null);
assert.equal(parsePendingOnboarding('not json', now), null);
assert.equal(
  parsePendingOnboarding(JSON.stringify({ version: 1, savedAt: '2026-09-15T11:00:00Z', experience_level: 'beginner' }), now),
  null,
  'old v1 quiz payload is rejected'
);
assert.equal(
  parsePendingOnboarding(good.replace('2026-09-15T11:00:00Z', '2026-09-12T11:00:00Z'), now),
  null,
  'older than 48h is expired'
);
assert.equal(
  parsePendingOnboarding(JSON.stringify({ ...JSON.parse(good), style: 'expert' }), now),
  null,
  'unknown style rejected'
);
// Picks are capped and sanitized: bad entries dropped, at most 20 kept.
const manyPicks = Array.from({ length: 25 }, (_, i) => ({ ticker: `T${i}`, name: `Co ${i}` }));
const capped = parsePendingOnboarding(
  JSON.stringify({ ...JSON.parse(good), picks: [...manyPicks, { ticker: 42 }] }),
  now
);
assert.equal(capped?.picks.length, 20);

assert.equal(experienceLevelFor('plain'), 'beginner');
assert.equal(experienceLevelFor('market'), 'intermediate');

assert.deepEqual(notificationOverrides(DEFAULT_ALERTS), {}, 'all on writes nothing, since unset already means on');
assert.deepEqual(
  notificationOverrides({ price_alerts: true, upcoming_earnings: false, dividend_reminder: false }),
  { upcoming_earnings: false, dividend_reminder: false }
);

assert.equal(STARTER_STOCKS.length, 11);
assert.ok(STARTER_STOCKS.some((s) => s.ticker === 'SPY') && STARTER_STOCKS.some((s) => s.ticker === 'QQQ'));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test-onboarding-trial`
Expected: FAIL, `parsePendingOnboarding` is not exported.

- [ ] **Step 3: Create the shared starter list**

Create `lib/onboarding/starter-stocks.ts`:

```ts
/**
 * Well-known starting points for someone who hasn't named a stock yet. One
 * list for both the onboarding picker and the dashboard fallback popup, so
 * they can't drift apart.
 */
export const STARTER_STOCKS: { ticker: string; name: string }[] = [
  { ticker: 'NVDA', name: 'NVIDIA' },
  { ticker: 'MSFT', name: 'Microsoft' },
  { ticker: 'META', name: 'Meta' },
  { ticker: 'AAPL', name: 'Apple' },
  { ticker: 'AMZN', name: 'Amazon' },
  { ticker: 'TSLA', name: 'Tesla' },
  { ticker: 'NBIS', name: 'Nebius' },
  { ticker: 'MU', name: 'Micron' },
  { ticker: 'JNJ', name: 'Johnson & Johnson' },
  { ticker: 'SPY', name: 'SPDR S&P 500 ETF' },
  { ticker: 'QQQ', name: 'Invesco QQQ Trust' },
];
```

- [ ] **Step 4: Rewrite the staging module**

Replace `lib/onboarding/pending-onboarding.ts` entirely:

```ts
// Client-side staging for the pre-signup onboarding. Choices are made before
// an account exists, so they can't be written to Supabase yet (RLS only lets a
// user touch their own row). This module stages them; lib/onboarding/flush.ts
// writes them once the account exists.

export type ExplainStyle = 'plain' | 'market';

export interface StockPick {
  ticker: string;
  name: string;
}

export interface AlertChoices {
  price_alerts: boolean;
  upcoming_earnings: boolean;
  dividend_reminder: boolean;
}

export const DEFAULT_ALERTS: AlertChoices = {
  price_alerts: true,
  upcoming_earnings: true,
  dividend_reminder: true,
};

/** Everything chosen before signup, ready to be written. */
export interface PendingOnboarding {
  style: ExplainStyle;
  picks: StockPick[];
  alerts: AlertChoices;
}

/** In-progress flow state (style is unset until screen 1 is answered). */
export interface OnboardingDraft {
  style?: ExplainStyle;
  picks: StockPick[];
  alerts: AlertChoices;
}

const PENDING_KEY = 'bp.pendingOnboarding.v2';
const DRAFT_KEY = 'bp.onboardingDraft.v2';
// Keys from the old 4-question quiz. Removed on read so they can't linger.
const LEGACY_KEYS = ['bp.pendingOnboarding.v1'];
const LEGACY_SESSION_KEYS = ['bp.quizProgress.v1'];
const PENDING_TTL_MS = 48 * 60 * 60 * 1000;
const MAX_PICKS = 20;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

export function experienceLevelFor(style: ExplainStyle): 'beginner' | 'intermediate' {
  return style === 'plain' ? 'beginner' : 'intermediate';
}

/** Only the switches turned OFF are written: an unset notification key already means enabled. */
export function notificationOverrides(alerts: AlertChoices): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [key, on] of Object.entries(alerts)) if (!on) out[key] = false;
  return out;
}

function sanitizePicks(value: unknown): StockPick[] {
  if (!Array.isArray(value)) return [];
  const picks: StockPick[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const ticker = (item as StockPick)?.ticker;
    const name = (item as StockPick)?.name;
    if (typeof ticker !== 'string' || typeof name !== 'string') continue;
    const upper = ticker.trim().toUpperCase();
    if (!upper || seen.has(upper)) continue;
    seen.add(upper);
    picks.push({ ticker: upper, name });
    if (picks.length === MAX_PICKS) break;
  }
  return picks;
}

function sanitizeAlerts(value: unknown): AlertChoices | null {
  const v = value as Partial<AlertChoices> | null;
  if (
    !v ||
    typeof v.price_alerts !== 'boolean' ||
    typeof v.upcoming_earnings !== 'boolean' ||
    typeof v.dividend_reminder !== 'boolean'
  ) {
    return null;
  }
  return { price_alerts: v.price_alerts, upcoming_earnings: v.upcoming_earnings, dividend_reminder: v.dividend_reminder };
}

/** Pure parser (no storage access) so it can be tested. */
export function parsePendingOnboarding(raw: string | null, now: number): PendingOnboarding | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.version !== 2 || typeof parsed.savedAt !== 'string') return null;
    const age = now - new Date(parsed.savedAt).getTime();
    if (Number.isNaN(age) || age > PENDING_TTL_MS) return null;
    if (parsed.style !== 'plain' && parsed.style !== 'market') return null;
    const alerts = sanitizeAlerts(parsed.alerts);
    if (!alerts) return null;
    return { style: parsed.style, picks: sanitizePicks(parsed.picks), alerts };
  } catch {
    return null;
  }
}

// ── Completed choices awaiting a Supabase write (localStorage) ───────────────

export function savePendingOnboarding(p: PendingOnboarding): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ version: 2, savedAt: new Date().toISOString(), ...p })
    );
  } catch {
    // Storage unavailable. Never block signup over this.
  }
}

export function readPendingOnboarding(): PendingOnboarding | null {
  if (!isBrowser()) return null;
  try {
    for (const key of LEGACY_KEYS) window.localStorage.removeItem(key);
    const raw = window.localStorage.getItem(PENDING_KEY);
    const parsed = parsePendingOnboarding(raw, Date.now());
    if (raw && !parsed) window.localStorage.removeItem(PENDING_KEY);
    return parsed;
  } catch {
    return null;
  }
}

export function hasPendingOnboarding(): boolean {
  return readPendingOnboarding() !== null;
}

export function clearPendingOnboarding(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(PENDING_KEY);
  } catch {
    // ignore
  }
}

// ── In-progress draft (sessionStorage: survives a refresh, not a closed tab) ─

export function saveDraft(step: number, draft: OnboardingDraft): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ version: 2, step, draft }));
  } catch {
    // ignore
  }
}

export function readDraft(): { step: number; draft: OnboardingDraft } | null {
  if (!isBrowser()) return null;
  try {
    for (const key of LEGACY_SESSION_KEYS) window.sessionStorage.removeItem(key);
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version?: number; step?: unknown; draft?: Record<string, unknown> };
    if (parsed.version !== 2 || typeof parsed.step !== 'number' || !parsed.draft) return null;
    const style = parsed.draft.style === 'plain' || parsed.draft.style === 'market' ? parsed.draft.style : undefined;
    return {
      step: parsed.step,
      draft: {
        style,
        picks: sanitizePicks(parsed.draft.picks),
        alerts: sanitizeAlerts(parsed.draft.alerts) ?? DEFAULT_ALERTS,
      },
    };
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test-onboarding-trial`
Expected: `test-onboarding-trial: all assertions passed`

- [ ] **Step 6: Rewrite the flush**

Replace `lib/onboarding/flush.ts` entirely:

```ts
import { createBrowserClient } from '@/lib/supabase/client';
import {
  clearPendingOnboarding,
  experienceLevelFor,
  notificationOverrides,
  readPendingOnboarding,
} from './pending-onboarding';

/**
 * Writes the pre-signup onboarding choices now that the account exists.
 * Called from AuthProvider on every SIGNED_IN event (email and Google both
 * funnel through it), and again as a fallback retry from
 * PendingOnboardingFlush once `user` has loaded.
 *
 * Order matters for idempotency: the users row and watchlist writes are both
 * safe to repeat (update / upsert), and the pending payload is cleared only
 * after both succeed, so a partial failure retries the whole thing.
 *
 * Never throws: this is setup, not the critical path.
 */
export async function flushPendingOnboardingData(userId: string): Promise<void> {
  const pending = readPendingOnboarding();
  if (!pending) return;

  try {
    const supabase = createBrowserClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const usersTable = (supabase as any).from('users');

    // Fetch-merge-write settings so nothing already present is clobbered.
    const { data: existing } = await usersTable.select('settings').eq('id', userId).single();
    const settings = (existing?.settings as Record<string, unknown>) ?? {};
    const notifications = {
      ...((settings.notifications as Record<string, boolean>) ?? {}),
      ...notificationOverrides(pending.alerts),
    };

    const { error } = await usersTable
      .update({
        experience_level: experienceLevelFor(pending.style),
        settings: { ...settings, notifications },
      })
      .eq('id', userId);
    if (error) return;

    // Sequential, not parallel: /api/watchlist lazily creates the user's first
    // list, and parallel first calls would race to create it twice.
    for (const pick of pending.picks) {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: pick.ticker, company_name: pick.name }),
      });
      if (!res.ok) return;
    }

    clearPendingOnboarding();
  } catch {
    // Network blip, RLS not ready yet. Leave the payload for the next retry.
  }
}
```

- [ ] **Step 7: Update the dashboard fallback popup**

In `components/onboarding/PendingOnboardingFlush.tsx`:
- Remove the local `STARTER_STOCKS` array and add `import { STARTER_STOCKS } from '@/lib/onboarding/starter-stocks';`
- Replace `import { readPendingQuizAnswers } from '@/lib/onboarding/pending-onboarding';` with `import { readPendingOnboarding } from '@/lib/onboarding/pending-onboarding';` and the call `readPendingQuizAnswers()` with `readPendingOnboarding()`.
- Add `import { useWatchlist } from '@/hooks/use-watchlist';` and after the `useHoldings` line:

```tsx
  const { data: watchlist, isLoading: watchlistLoading } = useWatchlist();
```

- Replace the `hasHoldings` / `isOpen` lines with:

```tsx
  // Someone who already picked stocks in onboarding (watchlist) or holds
  // anything doesn't need a "pick a few stocks" nudge.
  const hasTrackedStocks = (holdings?.length ?? 0) > 0 || (watchlist?.length ?? 0) > 0;
  const isOpen =
    isDashboard && !isLoading && !!user && !promptShown && !dismissed &&
    !holdingsLoading && !watchlistLoading && !hasTrackedStocks;
```

Update the file's doc comment line "for accounts that don't already hold anything" to "for accounts that don't already hold or watch anything".

- [ ] **Step 8: Lint and commit**

The old quiz still imports removed exports until Task 5 lands, so lint this task's files only and commit Task 4 and Task 5 together at the end of Task 5.

Run: `npx eslint lib/onboarding/pending-onboarding.ts lib/onboarding/flush.ts lib/onboarding/starter-stocks.ts components/onboarding/PendingOnboardingFlush.tsx scripts/test-onboarding-trial.ts`
Expected: no errors.

(No commit yet; see Task 5 Step 8.)

---

### Task 5: Onboarding screens 1 to 3 and the flow

**Files:**
- Delete: `components/get-started/quiz-questions.ts`, `components/get-started/QuizStep.tsx`, `components/get-started/RevealStep.tsx`, `lib/onboarding/reveal-copy.ts`
- Create: `components/get-started/StepShell.tsx`, `components/get-started/ExplainStyleStep.tsx`, `components/get-started/PickStocksStep.tsx`, `components/get-started/AlertsStep.tsx`
- Rewrite: `components/get-started/GetStartedFlow.tsx`

**Interfaces:**
- Consumes: everything from Task 4; `useInstantSearch(query, limit)` returning `{ results: InstantSearchResult[]; isLoading: boolean }` from `@/hooks/use-symbol-index`; `getGlossaryEntry('P/E')` from `@/lib/finance/glossary`; `CompanyLogo` (`name`, `ticker`, `size`)
- Produces: `StepShell({ stepIndex, totalSteps, onBack, children })`; `ExplainStyleStep({ value, onSelect, stepIndex, totalSteps })`; `PickStocksStep({ picks, onChange, onContinue, onBack, stepIndex, totalSteps })`; `AlertsStep({ alerts, onChange, onContinue, onBack, stepIndex, totalSteps })`; `TOTAL_STEPS = 5` exported from `GetStartedFlow.tsx`

- [ ] **Step 1: Know the search hook's shape (verified 2026-09-15)**

`useInstantSearch(query, limit)` in `hooks/use-symbol-index.ts` returns `{ results: InstantSearchResult[]; isLoading: boolean }`, where `InstantSearchResult` has `ticker: string` and `name: string` (plus optional exchange/currency fields). Local catalogue hits render on the keystroke; server-only hits (crypto, foreign listings) are appended after a 250ms debounce. No code change in this step; Step 4 uses `results` directly.

- [ ] **Step 2: Create the shared step shell**

Create `components/get-started/StepShell.tsx`:

```tsx
'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { OnboardingProgress } from './OnboardingProgress';

/** Motion, progress bar and back button shared by every onboarding screen. */
export function StepShell({
  stepIndex,
  totalSteps,
  onBack,
  maxWidth = 520,
  children,
}: {
  stepIndex: number;
  totalSteps: number;
  onBack?: () => void;
  maxWidth?: number;
  children: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2 }}
      style={{ maxWidth, margin: '0 auto', width: '100%' }}
    >
      <OnboardingProgress stepIndex={stepIndex} totalSteps={totalSteps} />
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 20, fontSize: 13,
            color: 'var(--fg-dim)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
          }}
        >
          <ArrowLeft size={14} />
          Back
        </button>
      )}
      {children}
    </motion.div>
  );
}

/** Headline with the single serif accent word (DESIGN.md One Serif Word Rule). */
export function StepHeadline({ text, accent }: { text: string; accent: string }) {
  return (
    <h1
      className="headline"
      style={{ margin: '0 0 12px', fontSize: 'clamp(26px, 3.4vw, 34px)', color: 'var(--fg)', textAlign: 'center' }}
    >
      {text}{' '}
      <span className="accent-serif" style={{ color: 'var(--accent)' }}>{accent}</span>
    </h1>
  );
}

export const primaryButtonStyle = { width: '100%', marginTop: 24 } as const;
```

- [ ] **Step 3: Create screen 1 (explanation style)**

Create `components/get-started/ExplainStyleStep.tsx`:

```tsx
'use client';

import { getGlossaryEntry } from '@/lib/finance/glossary';
import type { ExplainStyle } from '@/lib/onboarding/pending-onboarding';
import { StepHeadline, StepShell } from './StepShell';

/**
 * The one onboarding choice that visibly changes the app. Both cards render the
 * same metric exactly the way the app renders it in each mode (TermTooltip:
 * plain label + glossary description for beginners, the market term
 * otherwise), read from the glossary so it can't drift from the real UI.
 */
export function ExplainStyleStep({
  value,
  onSelect,
  stepIndex,
  totalSteps,
}: {
  value?: ExplainStyle;
  onSelect: (style: ExplainStyle) => void;
  stepIndex: number;
  totalSteps: number;
}) {
  const pe = getGlossaryEntry('P/E');
  const options: { style: ExplainStyle; title: string; label: string; body: string }[] = [
    {
      style: 'plain',
      title: 'Plain English',
      label: pe?.plainLabel ?? 'Price vs Earnings',
      body: pe?.description ?? '',
    },
    {
      style: 'market',
      title: 'Market terms',
      label: 'P/E (TTM)',
      body: 'The standard terms you see on trading platforms, with explanations one tap away.',
    },
  ];

  return (
    <StepShell stepIndex={stepIndex} totalSteps={totalSteps}>
      <StepHeadline text="How should BullPen explain" accent="things?" />
      <p style={{ margin: '0 0 28px', textAlign: 'center', fontSize: 15, color: 'var(--fg-muted)' }}>
        Here is the same metric, shown both ways. Pick the one that reads right.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {options.map((opt) => {
          const selected = value === opt.style;
          return (
            <button
              key={opt.style}
              type="button"
              onClick={() => onSelect(opt.style)}
              aria-pressed={selected}
              style={{
                display: 'flex', flexDirection: 'column', gap: 6, width: '100%', textAlign: 'left',
                padding: '16px 20px', borderRadius: 14, cursor: 'pointer', color: 'var(--fg)',
                border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                background: selected ? 'var(--accent-soft)' : 'var(--surface)',
                transition: 'border-color 180ms cubic-bezier(0.22,1,0.36,1), background 180ms cubic-bezier(0.22,1,0.36,1)',
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-dim)' }}>{opt.title}</span>
              <span style={{ fontSize: 17, fontWeight: 600 }}>{opt.label}</span>
              <span style={{ fontSize: 13, color: 'var(--fg-dim)', lineHeight: 1.5 }}>{opt.body}</span>
            </button>
          );
        })}
      </div>
      <p style={{ marginTop: 16, fontSize: 12, color: 'var(--fg-dim)', textAlign: 'center' }}>
        You can change this anytime in Settings.
      </p>
    </StepShell>
  );
}
```

No example number is shown next to the label: a figure that looks like data but belongs to no company breaks the "never ship synthetic numbers" rule. The label and its explanation carry the comparison on their own.

- [ ] **Step 4: Create screen 2 (pick stocks)**

Create `components/get-started/PickStocksStep.tsx`. Replace `results` below with the exact field name found in Step 1 if different:

```tsx
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Plus, Search, X } from 'lucide-react';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { useInstantSearch } from '@/hooks/use-symbol-index';
import { STARTER_STOCKS } from '@/lib/onboarding/starter-stocks';
import type { StockPick } from '@/lib/onboarding/pending-onboarding';
import { StepHeadline, StepShell } from './StepShell';

const MAX_PICKS = 20;

/** Today's move for suggestions, from the shared movers cache (no per-visitor quote calls). */
function useSuggestionMoves() {
  return useQuery({
    queryKey: ['onboarding-suggestion-moves'],
    queryFn: async (): Promise<Record<string, number>> => {
      const res = await fetch('/api/market/movers?limit=20');
      if (!res.ok) return {};
      const json = await res.json();
      const all = [...(json.movers?.gainers ?? []), ...(json.movers?.losers ?? [])] as { symbol: string; changePercent: number }[];
      return Object.fromEntries(all.map((m) => [m.symbol, m.changePercent]));
    },
    staleTime: 3 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function PickStocksStep({
  picks,
  onChange,
  onContinue,
  onBack,
  stepIndex,
  totalSteps,
}: {
  picks: StockPick[];
  onChange: (picks: StockPick[]) => void;
  onContinue: () => void;
  onBack: () => void;
  stepIndex: number;
  totalSteps: number;
}) {
  const [query, setQuery] = useState('');
  const { results } = useInstantSearch(query, 6);
  const { data: moves } = useSuggestionMoves();
  const picked = new Set(picks.map((p) => p.ticker));

  const toggle = (pick: StockPick) => {
    if (picked.has(pick.ticker)) onChange(picks.filter((p) => p.ticker !== pick.ticker));
    else if (picks.length < MAX_PICKS) onChange([...picks, pick]);
  };

  return (
    <StepShell stepIndex={stepIndex} totalSteps={totalSteps} onBack={onBack}>
      <StepHeadline text="Pick stocks you own or" accent="follow" />
      <p style={{ margin: '0 0 24px', textAlign: 'center', fontSize: 15, color: 'var(--fg-muted)' }}>
        We'll add them to your watchlist so BullPen is ready when you arrive.
      </p>

      <label style={{ position: 'relative', display: 'block' }}>
        <span className="sr-only">Search for a stock or ETF</span>
        <Search size={16} aria-hidden style={{ position: 'absolute', left: 14, top: 14, color: 'var(--fg-dim)' }} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or ticker"
          autoComplete="off"
          style={{
            width: '100%', height: 44, padding: '0 14px 0 40px', borderRadius: 12, fontSize: 15,
            border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--fg)',
          }}
        />
      </label>

      {picks.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }} aria-label="Your picks">
          {picks.map((p) => (
            <button
              key={p.ticker}
              type="button"
              onClick={() => toggle(p)}
              aria-label={`Remove ${p.name}`}
              className="mono"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999,
                background: 'var(--accent-soft)', color: 'var(--accent)', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {p.ticker} <X size={12} aria-hidden />
            </button>
          ))}
        </div>
      )}

      <p style={{ margin: '20px 0 10px', fontSize: 12, fontWeight: 600, color: 'var(--fg-dim)' }}>
        {query.trim() ? 'Results' : 'Popular starting points'}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(query.trim() ? results.map((r) => ({ ticker: r.ticker, name: r.name })) : STARTER_STOCKS).map((s) => {
          const isPicked = picked.has(s.ticker);
          const move = moves?.[s.ticker];
          return (
            <button
              key={s.ticker}
              type="button"
              onClick={() => toggle(s)}
              aria-pressed={isPicked}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 52, padding: '8px 14px',
                borderRadius: 12, textAlign: 'left', cursor: 'pointer', color: 'var(--fg)',
                border: `1px solid ${isPicked ? 'var(--accent)' : 'var(--border)'}`,
                background: isPicked ? 'var(--accent-soft)' : 'var(--surface)',
              }}
            >
              <CompanyLogo name={s.name} ticker={s.ticker} size={28} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="mono" style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{s.ticker}</span>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--fg-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
              </span>
              {typeof move === 'number' && (
                <span className={`mono ${move >= 0 ? 'up' : 'down'}`} style={{ fontSize: 12 }}>
                  {move >= 0 ? '▲ +' : '▼ −'}{Math.abs(move).toFixed(2)}%
                </span>
              )}
              {isPicked ? <Check size={16} aria-hidden /> : <Plus size={16} aria-hidden style={{ color: 'var(--fg-dim)' }} />}
            </button>
          );
        })}
      </div>

      <button type="button" className="btn-brand-solid" onClick={onContinue} style={{ width: '100%', marginTop: 24 }}>
        {picks.length > 0 ? `Continue with ${picks.length} ${picks.length === 1 ? 'stock' : 'stocks'}` : 'Skip for now'}
      </button>
    </StepShell>
  );
}
```

Confirm `.down` exists alongside `.up` in `components/landing/landing-styles.css` (the `.up` rule is at line 495). If `.down` is missing, add next to it:

```css
.bullpen-landing-root .down { color: var(--down); }
```

- [ ] **Step 5: Create screen 3 (alerts)**

Create `components/get-started/AlertsStep.tsx`:

```tsx
'use client';

import type { AlertChoices } from '@/lib/onboarding/pending-onboarding';
import { StepHeadline, StepShell } from './StepShell';

const ROWS: { key: keyof AlertChoices; label: string; description: string }[] = [
  { key: 'price_alerts', label: 'Big price moves', description: 'When one of your stocks moves 5% or more in a day.' },
  { key: 'upcoming_earnings', label: 'Earnings coming up', description: 'A heads-up before a company reports results.' },
  { key: 'dividend_reminder', label: 'Dividend dates', description: 'Before a stock goes ex-dividend, so you know when to own it.' },
];

export function AlertsStep({
  alerts,
  onChange,
  onContinue,
  onBack,
  stepIndex,
  totalSteps,
}: {
  alerts: AlertChoices;
  onChange: (alerts: AlertChoices) => void;
  onContinue: () => void;
  onBack: () => void;
  stepIndex: number;
  totalSteps: number;
}) {
  return (
    <StepShell stepIndex={stepIndex} totalSteps={totalSteps} onBack={onBack}>
      <StepHeadline text="What should we tell you" accent="about?" />
      <p style={{ margin: '0 0 24px', textAlign: 'center', fontSize: 15, color: 'var(--fg-muted)' }}>
        These arrive by email, only for the stocks you pick.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ROWS.map((row) => {
          const on = alerts[row.key];
          const id = `alert-${row.key}`;
          return (
            <div
              key={row.key}
              style={{
                display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px', borderRadius: 14,
                border: '1px solid var(--border)', background: 'var(--surface)',
              }}
            >
              <label htmlFor={id} style={{ flex: 1, cursor: 'pointer' }}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: 'var(--fg)' }}>{row.label}</span>
                <span style={{ display: 'block', fontSize: 13, color: 'var(--fg-dim)' }}>{row.description}</span>
              </label>
              <button
                id={id}
                type="button"
                role="switch"
                aria-checked={on}
                onClick={() => onChange({ ...alerts, [row.key]: !on })}
                style={{
                  position: 'relative', width: 44, height: 26, flexShrink: 0, borderRadius: 999, border: 'none', cursor: 'pointer',
                  background: on ? 'var(--accent)' : 'var(--border-strong)', transition: 'background 180ms ease-out',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    position: 'absolute', top: 3, left: 3, width: 20, height: 20, borderRadius: 999, background: 'white',
                    transform: `translateX(${on ? 18 : 0}px)`, transition: 'transform 180ms ease-out',
                  }}
                />
              </button>
            </div>
          );
        })}
      </div>
      <button type="button" className="btn-brand-solid" onClick={onContinue} style={{ width: '100%', marginTop: 24 }}>
        Continue
      </button>
    </StepShell>
  );
}
```

- [ ] **Step 6: Rewrite the flow**

Replace `components/get-started/GetStartedFlow.tsx` entirely (screen 4, `PreviewStep`, arrives in Task 6; until then it renders a placeholder that still stages the payload):

```tsx
'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { trackEvent } from '@/lib/analytics/track';
import {
  clearDraft,
  DEFAULT_ALERTS,
  readDraft,
  saveDraft,
  savePendingOnboarding,
  type OnboardingDraft,
} from '@/lib/onboarding/pending-onboarding';
import { ExplainStyleStep } from './ExplainStyleStep';
import { PickStocksStep } from './PickStocksStep';
import { AlertsStep } from './AlertsStep';
import { PreviewStep } from './PreviewStep';

/** 4 screens here plus the trial offer at /get-started/trial, for the progress bar. */
export const TOTAL_STEPS = 5;
const STEP_KEYS = ['explain_style', 'pick_stocks', 'alerts', 'preview'] as const;

export function GetStartedFlow() {
  // Mounts only after GetStartedPage's auth gate, never in the SSR tree, so
  // reading sessionStorage in the initializer can't cause a hydration mismatch.
  const [step, setStep] = useState(() => readDraft()?.step ?? 0);
  const [draft, setDraft] = useState<OnboardingDraft>(
    () => readDraft()?.draft ?? { picks: [], alerts: DEFAULT_ALERTS }
  );

  useEffect(() => {
    saveDraft(step, draft);
  }, [step, draft]);

  useEffect(() => {
    trackEvent('get_started_step_viewed', { step_key: STEP_KEYS[step], step_number: step + 1 });
  }, [step]);

  // Reaching the preview means every choice is made: stage it for the
  // post-signup flush and drop the draft.
  useEffect(() => {
    if (step !== 3 || !draft.style) return;
    savePendingOnboarding({ style: draft.style, picks: draft.picks, alerts: draft.alerts });
    clearDraft();
  }, [step, draft]);

  // A resumed draft past screen 1 without a style can't render the preview.
  const safeStep = step > 0 && !draft.style ? 0 : step;

  return (
    <div style={{ padding: '80px 0' }}>
      <div className="wrap">
        <AnimatePresence mode="wait">
          {safeStep === 0 && (
            <ExplainStyleStep
              key="explain_style"
              value={draft.style}
              stepIndex={0}
              totalSteps={TOTAL_STEPS}
              onSelect={(style) => {
                trackEvent('get_started_step_answered', { step_key: 'explain_style', step_number: 1, value: style });
                setDraft((d) => ({ ...d, style }));
                setStep(1);
              }}
            />
          )}
          {safeStep === 1 && (
            <PickStocksStep
              key="pick_stocks"
              picks={draft.picks}
              stepIndex={1}
              totalSteps={TOTAL_STEPS}
              onChange={(picks) => setDraft((d) => ({ ...d, picks }))}
              onBack={() => setStep(0)}
              onContinue={() => {
                trackEvent('stocks_picked', { count: draft.picks.length });
                setStep(2);
              }}
            />
          )}
          {safeStep === 2 && (
            <AlertsStep
              key="alerts"
              alerts={draft.alerts}
              stepIndex={2}
              totalSteps={TOTAL_STEPS}
              onChange={(alerts) => setDraft((d) => ({ ...d, alerts }))}
              onBack={() => setStep(1)}
              onContinue={() => {
                trackEvent('alerts_chosen', { ...draft.alerts });
                setStep(3);
              }}
            />
          )}
          {safeStep === 3 && draft.style && (
            <PreviewStep
              key="preview"
              picks={draft.picks}
              alerts={draft.alerts}
              stepIndex={3}
              totalSteps={TOTAL_STEPS}
              onBack={() => setStep(2)}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
```

Create a temporary `components/get-started/PreviewStep.tsx` so this compiles before Task 6 (Task 6 replaces it entirely):

```tsx
'use client';

import type { AlertChoices, StockPick } from '@/lib/onboarding/pending-onboarding';
import { GetStartedSignupForm } from './GetStartedSignupForm';
import { StepShell } from './StepShell';

export function PreviewStep(props: {
  picks: StockPick[];
  alerts: AlertChoices;
  stepIndex: number;
  totalSteps: number;
  onBack: () => void;
}) {
  return (
    <StepShell stepIndex={props.stepIndex} totalSteps={props.totalSteps} onBack={props.onBack} maxWidth={560}>
      <GetStartedSignupForm />
    </StepShell>
  );
}
```

- [ ] **Step 7: Delete the old quiz files and verify nothing references them**

```bash
git rm components/get-started/quiz-questions.ts components/get-started/QuizStep.tsx components/get-started/RevealStep.tsx lib/onboarding/reveal-copy.ts
```

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | findstr /i "get-started onboarding"` (PowerShell: `npx tsc --noEmit -p tsconfig.json 2>&1 | Select-String -Pattern "get-started|onboarding"`)
Expected: no errors in `components/get-started/**` or `lib/onboarding/**`. (Project-wide TS errors from the degraded Supabase types are pre-existing and out of scope.)

Then search for stragglers: `rg "readPendingQuizAnswers|savePendingQuizAnswers|reveal-copy|quiz-questions|QuizStep|RevealStep" app components lib hooks`
Expected: no matches.

- [ ] **Step 8: Test, lint, commit Tasks 4 and 5 together**

Run: `npm run test-onboarding-trial`
Expected: all assertions passed.

```bash
npm run lint
git add lib/onboarding/starter-stocks.ts lib/onboarding/pending-onboarding.ts lib/onboarding/flush.ts components/onboarding/PendingOnboardingFlush.tsx components/get-started/StepShell.tsx components/get-started/ExplainStyleStep.tsx components/get-started/PickStocksStep.tsx components/get-started/AlertsStep.tsx components/get-started/PreviewStep.tsx components/get-started/GetStartedFlow.tsx scripts/test-onboarding-trial.ts components/landing/landing-styles.css
git commit -m "feat(onboarding): setup steps replace the survey (explain style, pick stocks, alerts)"
git push origin preview
```

(Drop `landing-styles.css` from `git add` if Task 5 Step 4 needed no CSS change.)

---

### Task 6: Preview + signup screen, cache-only Health Scores, redirects

**Files:**
- Create: `app/api/onboarding/health-scores/route.ts`
- Replace: `components/get-started/PreviewStep.tsx`
- Modify: `components/get-started/GetStartedSignupForm.tsx`
- Modify: `app/get-started/page.tsx`

**Interfaces:**
- Consumes: `StockPick`, `AlertChoices`, `STARTER_STOCKS`, `hasPendingOnboarding()`, `StepShell`, `StepHeadline`; `POST /api/quotes/batch` → `{ success, quotes: Record<string, { price: number; change: number; changePercent: number; stale?: boolean }> }`
- Produces: `GET /api/onboarding/health-scores?symbols=A,B` → `{ scores: Record<string, { score: number; grade: string }> }`; `GetStartedSignupForm` routes to `/get-started/trial`

- [ ] **Step 1: Create the cache-only Health Score route**

Create `app/api/onboarding/health-scores/route.ts`:

```ts
/**
 * GET /api/onboarding/health-scores?symbols=NVDA,MSFT
 *
 * Health Scores for the onboarding preview, read ONLY from screener_stats
 * (the persisted canonical score). This screen is reachable before signup, and
 * computing a score for an uncached symbol costs ~300 TwelveData credits
 * (three statement fetches), so this route never computes. A symbol without a
 * persisted score is simply absent from the response.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { validateTicker } from '@/lib/security/input-validation';

const MAX_SYMBOLS = 20;

async function handler(request: NextRequest): Promise<NextResponse> {
  const raw = request.nextUrl.searchParams.get('symbols') ?? '';
  const symbols = [
    ...new Set(
      raw
        .split(',')
        .map((s) => validateTicker(s.trim()))
        .filter((v) => v.valid && v.normalized)
        .map((v) => v.normalized as string)
    ),
  ].slice(0, MAX_SYMBOLS);

  if (symbols.length === 0) return addSecurityHeaders(NextResponse.json({ scores: {} }));

  const { data } = await createServerClient()
    .from('screener_stats')
    .select('ticker, health_score, health_score_grade')
    .in('ticker', symbols)
    .not('health_score', 'is', null);

  const scores: Record<string, { score: number; grade: string }> = {};
  for (const row of (data as { ticker: string; health_score: number; health_score_grade: string | null }[] | null) ?? []) {
    if (row.health_score_grade) scores[row.ticker] = { score: row.health_score, grade: row.health_score_grade };
  }

  return addSecurityHeaders(
    NextResponse.json({ scores }, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600' } })
  );
}

export const GET = withRateLimit(handler, { windowMs: 60 * 1000, maxRequests: 30 });
```

Verify it: start the dev server yourself (`npm run dev`, never reuse a dev server you didn't start), then run
`curl -s "http://localhost:3000/api/onboarding/health-scores?symbols=NVDA,MSFT,ZZZZ"`
Expected: JSON with `scores` for tickers that have a persisted score, and no `ZZZZ` key. Stop the dev server after.

- [ ] **Step 2: Replace the preview screen**

Replace `components/get-started/PreviewStep.tsx` entirely:

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { STARTER_STOCKS } from '@/lib/onboarding/starter-stocks';
import type { AlertChoices, StockPick } from '@/lib/onboarding/pending-onboarding';
import { GetStartedSignupForm } from './GetStartedSignupForm';
import { StepHeadline, StepShell } from './StepShell';

interface Quote { price: number; change: number; changePercent: number; stale?: boolean }

const EXAMPLE_TICKERS = ['NVDA', 'AAPL', 'SPY'];
const ALERT_WORDS: Record<keyof AlertChoices, string> = {
  price_alerts: 'big price moves',
  upcoming_earnings: 'earnings',
  dividend_reminder: 'dividend dates',
};

function alertsSentence(alerts: AlertChoices): string {
  const on = (Object.keys(alerts) as (keyof AlertChoices)[]).filter((k) => alerts[k]).map((k) => ALERT_WORDS[k]);
  if (on.length === 0) return 'Alerts are off. You can turn them on anytime in Settings.';
  const list = on.length === 1 ? on[0] : `${on.slice(0, -1).join(', ')} and ${on[on.length - 1]}`;
  return `We'll email you about ${list} for these stocks.`;
}

export function PreviewStep({
  picks,
  alerts,
  stepIndex,
  totalSteps,
  onBack,
}: {
  picks: StockPick[];
  alerts: AlertChoices;
  stepIndex: number;
  totalSteps: number;
  onBack: () => void;
}) {
  const isExample = picks.length === 0;
  const shown: StockPick[] = isExample
    ? STARTER_STOCKS.filter((s) => EXAMPLE_TICKERS.includes(s.ticker))
    : picks.slice(0, 6);
  const tickers = shown.map((s) => s.ticker);

  const { data: quotes } = useQuery({
    queryKey: ['onboarding-preview-quotes', tickers],
    queryFn: async (): Promise<Record<string, Quote>> => {
      const res = await fetch('/api/quotes/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: tickers }),
      });
      if (!res.ok) return {};
      return (await res.json()).quotes ?? {};
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: scores } = useQuery({
    queryKey: ['onboarding-preview-scores', tickers],
    queryFn: async (): Promise<Record<string, { score: number; grade: string }>> => {
      const res = await fetch(`/api/onboarding/health-scores?symbols=${encodeURIComponent(tickers.join(','))}`);
      if (!res.ok) return {};
      return (await res.json()).scores ?? {};
    },
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const lead = shown[0];

  return (
    <StepShell stepIndex={stepIndex} totalSteps={totalSteps} onBack={onBack} maxWidth={560}>
      <StepHeadline text="Your BullPen is" accent="ready." />

      {isExample && (
        <p style={{ margin: '0 0 12px', textAlign: 'center', fontSize: 12, color: 'var(--fg-dim)' }}>Examples</p>
      )}

      <ul style={{ listStyle: 'none', margin: '20px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {shown.map((s) => {
          const q = quotes?.[s.ticker];
          const hs = scores?.[s.ticker];
          const up = (q?.changePercent ?? 0) >= 0;
          return (
            <li
              key={s.ticker}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 12,
                border: '1px solid var(--border)', background: 'var(--surface)',
              }}
            >
              <CompanyLogo name={s.name} ticker={s.ticker} size={28} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="mono" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{s.ticker}</span>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--fg-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.name}{hs ? ` · Health ${hs.score} (${hs.grade})` : ''}
                </span>
              </span>
              {q ? (
                <span style={{ textAlign: 'right' }}>
                  <span className="mono" style={{ display: 'block', fontSize: 14, color: 'var(--fg)' }}>${q.price.toFixed(2)}</span>
                  <span className={`mono ${up ? 'up' : 'down'}`} style={{ display: 'block', fontSize: 12 }}>
                    {up ? '▲ +' : '▼ −'}{Math.abs(q.changePercent).toFixed(2)}%{q.stale ? ' last close' : ''}
                  </span>
                </span>
              ) : (
                <span aria-hidden className="mono" style={{ fontSize: 12, color: 'var(--fg-dim)' }}>···</span>
              )}
            </li>
          );
        })}
      </ul>

      <p style={{ margin: '14px 0 0', textAlign: 'center', fontSize: 14, color: 'var(--fg-muted)' }}>
        {alertsSentence(alerts)}
      </p>

      {lead && (
        <div style={{ marginTop: 20, padding: '14px 18px', borderRadius: 14, border: '1px solid var(--border-strong)' }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>With Pro, for {lead.ticker}:</p>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.7 }}>
            <li>Why Today? explains what moved it, the day it moves</li>
            <li>A Deep Dive report on the business, in plain language</li>
            <li>A Daily Brief every morning covering your stocks</li>
          </ul>
        </div>
      )}

      <GetStartedSignupForm />
    </StepShell>
  );
}
```

- [ ] **Step 3: Route signup to the trial screen**

In `components/get-started/GetStartedSignupForm.tsx`:
- `handleSuccess`: replace `router.replace('/dashboard');` with `router.replace('/get-started/trial');`
- `handleGoogleSignIn`: replace `await signInWithGoogle();` with `await signInWithGoogle('/get-started/trial');`
- `AuthFormSignup` props: `submitLabel="Create my BullPen"` and `submitLoadingLabel="Creating..."`
- Update the component doc comment's "saving the profile" wording to "creating their BullPen".

- [ ] **Step 4: Stop the page's signed-in redirect from beating the form**

Email signup signs the user in immediately (email confirmation is off), so `GetStartedPage`'s "already signed in" effect would redirect to `/dashboard` before `handleSuccess` sends them to the trial screen. In `app/get-started/page.tsx`:

```tsx
import { hasPendingOnboarding } from '@/lib/onboarding/pending-onboarding';
```

Replace the effect body:

```tsx
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      // Just finished onboarding (choices still staged): the trial offer is
      // the next screen. Anyone else signed in has nothing to do here.
      router.replace(hasPendingOnboarding() ? '/get-started/trial' : '/dashboard');
    }
  }, [isLoading, isAuthenticated, router]);
```

Note: `AuthProvider` may clear the pending payload (successful flush) before this effect runs. That is why the form's own `handleSuccess` also routes to `/get-started/trial`; either path lands on the trial screen, and the trial page itself sends already-Pro users on to the dashboard.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add app/api/onboarding/health-scores/route.ts components/get-started/PreviewStep.tsx components/get-started/GetStartedSignupForm.tsx app/get-started/page.tsx
git commit -m "feat(onboarding): live preview of picked stocks before signup, cache-only health scores"
git push origin preview
```

---

### Task 7: Trial offer page and post-checkout welcome

**Files:**
- Create: `app/get-started/trial/page.tsx`
- Create: `components/billing/TrialStartedModal.tsx`
- Modify: `app/dashboard/DashboardClient.tsx`

**Interfaces:**
- Consumes: `trialTermsLine(cycle)` (Task 1), `startCheckout(cycle, { returnTo: 'onboarding' })` (Task 3), `useAuth()`, `useEntitlements()` (`{ isPro }`), `useWatchlist()` (`data: { symbol: string }[]`), `PRICING`, `UpgradeSuccessModal({ open, onOpenChange })`, `TOTAL_STEPS` (Task 5), `OnboardingProgress`
- Produces: route `/get-started/trial`; `TrialStartedModal()`

- [ ] **Step 1: Create the trial offer page**

Create `app/get-started/trial/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useEntitlements } from '@/hooks/use-entitlements';
import { useWatchlist } from '@/hooks/use-watchlist';
import { Logo } from '@/components/landing/Atoms';
import { OnboardingProgress } from '@/components/get-started/OnboardingProgress';
import { TOTAL_STEPS } from '@/components/get-started/GetStartedFlow';
import { PRICING } from '@/lib/billing/entitlements';
import { startCheckout, type BillingCycle } from '@/lib/billing/checkout';
import { trialTermsLine } from '@/lib/billing/trial-copy';
import { trackEvent } from '@/lib/analytics/track';
import '@/components/landing/landing-styles.css';

export default function TrialOfferPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const { isPro } = useEntitlements();
  const { data: watchlist } = useWatchlist();
  const router = useRouter();
  const [cycle, setCycle] = useState<BillingCycle>('annual');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'unavailable'>('idle');

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) router.replace('/get-started');
    else if (isPro) router.replace('/dashboard');
  }, [isLoading, isAuthenticated, isPro, router]);

  useEffect(() => {
    if (!isLoading && isAuthenticated && !isPro) {
      trackEvent('get_started_step_viewed', { step_key: 'trial_offer', step_number: 5 });
      trackEvent('trial_offer_viewed', {});
    }
  }, [isLoading, isAuthenticated, isPro]);

  if (isLoading || !isAuthenticated || isPro) return null;

  const lead = watchlist?.[0]?.symbol;

  async function start() {
    setStatus('loading');
    trackEvent('trial_offer_started', { cycle });
    const result = await startCheckout(cycle, { returnTo: 'onboarding' });
    if (result.url) {
      window.location.href = result.url;
      return;
    }
    if (result.alreadyPro) {
      router.replace('/dashboard');
      return;
    }
    setStatus(result.waitlisted ? 'unavailable' : 'error');
  }

  const benefits = [
    lead ? `Why Today? explains what moved ${lead}, the day it moves` : 'Why Today? explains what moved a stock, the day it moves',
    'Deep Dive reports on any company, in plain language',
    'A Daily Brief every morning covering your stocks',
    'Unlimited alerts and AI research with Ask Bull',
  ];

  return (
    <div className="bullpen-landing-root dark">
      <div className="page-bg" aria-hidden />
      <div className="page-noise" aria-hidden />
      <div className="content-layer">
        <header style={{ borderBottom: '1px solid var(--border)', padding: '24px 0' }}>
          <div className="wrap">
            <Logo size="sm" />
          </div>
        </header>

        <main style={{ padding: '80px 0' }}>
          <div className="wrap" style={{ maxWidth: 520, margin: '0 auto' }}>
            <OnboardingProgress stepIndex={4} totalSteps={TOTAL_STEPS} />

            <h1
              className="headline"
              style={{ margin: '0 0 12px', fontSize: 'clamp(28px, 4vw, 40px)', color: 'var(--fg)', textAlign: 'center' }}
            >
              Here&apos;s a one week free trial{' '}
              <span className="accent-serif" style={{ color: 'var(--accent)' }}>on us!</span>
            </h1>
            <p style={{ margin: '0 0 28px', textAlign: 'center', fontSize: 16, color: 'var(--fg-muted)' }}>
              Try everything in BullPen Pro for {PRICING.trialDays} days.
            </p>

            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {benefits.map((b) => (
                <li key={b} style={{ display: 'flex', gap: 10, fontSize: 15, color: 'var(--fg)' }}>
                  <span aria-hidden style={{ color: 'var(--accent)' }}>✓</span>
                  {b}
                </li>
              ))}
            </ul>

            <div role="radiogroup" aria-label="Billing" style={{ display: 'flex', gap: 8, marginTop: 28 }}>
              {(['annual', 'monthly'] as const).map((c) => {
                const selected = cycle === c;
                return (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setCycle(c)}
                    style={{
                      flex: 1, padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left', color: 'var(--fg)',
                      border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                      background: selected ? 'var(--accent-soft)' : 'var(--surface)',
                    }}
                  >
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{c === 'annual' ? 'Yearly' : 'Monthly'}</span>
                    <span className="mono" style={{ display: 'block', fontSize: 13, color: 'var(--fg-muted)' }}>
                      ${c === 'annual' ? PRICING.proAnnualPerMonth : PRICING.proMonthly}/mo{c === 'annual' ? ' billed yearly' : ''}
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              className="btn-brand-solid"
              onClick={start}
              disabled={status === 'loading'}
              style={{ width: '100%', marginTop: 20 }}
            >
              {status === 'loading' ? <><Loader2 size={16} className="animate-spin" aria-hidden /> One moment</> : 'Start my free week'}
            </button>

            <p style={{ margin: '12px 0 0', textAlign: 'center', fontSize: 12, color: 'var(--fg-dim)', lineHeight: 1.6 }}>
              {trialTermsLine(cycle)}{' '}
              <Link href="/terms" style={{ textDecoration: 'underline' }}>Refunds within {PRICING.moneyBackDays} days of your first charge.</Link>
            </p>

            {status === 'error' && (
              <p role="alert" style={{ margin: '12px 0 0', textAlign: 'center', fontSize: 13, color: 'var(--down)' }}>
                We couldn&apos;t open checkout. Please try again.
              </p>
            )}
            {status === 'unavailable' && (
              <p role="status" style={{ margin: '12px 0 0', textAlign: 'center', fontSize: 13, color: 'var(--fg-muted)' }}>
                Trials aren&apos;t available right now. You can start one later from your account.
              </p>
            )}

            <p style={{ margin: '24px 0 0', textAlign: 'center' }}>
              <Link
                href="/dashboard"
                onClick={() => trackEvent('trial_offer_skipped', {})}
                style={{ fontSize: 14, color: 'var(--fg-dim)' }}
              >
                Continue with Free
              </Link>
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the post-checkout welcome**

Create `components/billing/TrialStartedModal.tsx`:

```tsx
'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { UpgradeSuccessModal } from './UpgradeSuccessModal';
import { trackEvent } from '@/lib/analytics/track';

/** Opens the existing success modal when Stripe Checkout returns from onboarding (?trial=started). */
function TrialStartedModalInner() {
  const params = useSearchParams();
  const router = useRouter();
  const started = params.get('trial') === 'started';
  const [open, setOpen] = useState(started);

  useEffect(() => {
    if (started) trackEvent('trial_checkout_completed', {});
  }, [started]);

  return (
    <UpgradeSuccessModal
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Drop the query param so a refresh doesn't reopen it.
        if (!next) router.replace('/dashboard', { scroll: false });
      }}
    />
  );
}

export function TrialStartedModal() {
  return (
    <Suspense fallback={null}>
      <TrialStartedModalInner />
    </Suspense>
  );
}
```

In `app/dashboard/DashboardClient.tsx`, import it and render it as the first child inside `<HomepageRedirect>`'s wrapper div:

```tsx
import { TrialStartedModal } from '@/components/billing/TrialStartedModal';
```

```tsx
    <div className={`min-h-screen ${hasAnimatedBackground ? '' : 'bg-background'}`}>
      <TrialStartedModal />
```

- [ ] **Step 3: Lint and commit**

```bash
npm run lint
git add app/get-started/trial/page.tsx components/billing/TrialStartedModal.tsx app/dashboard/DashboardClient.tsx
git commit -m "feat(onboarding): day-one 7-day free trial offer after signup"
git push origin preview
```

---

### Task 8: Verification, polish, and cleanup

**Files:** none new (fixes only, committed with their own messages)

- [ ] **Step 1: Unit checks and lint**

Run: `npm run test-onboarding-trial` → all assertions passed.
Run: `npm run lint` → 0 errors.

- [ ] **Step 2: Vercel preview build**

Use the Vercel MCP `list_deployments` (team `team_WADpWhyieR8hWCfrZRdUG3TB`, project `prj_vEwnmFwacDFUk31DlDe43uB9AWky`) and confirm the deployment for the last commit reaches `READY`. If `ERROR`, read `get_deployment_build_logs`, fix, push, recheck.

- [ ] **Step 3: Browser walkthrough on the preview deploy (Playwright MCP)**

Get an access link with `get_access_to_vercel_url` for the deployment's own URL (not the branch alias). Then, at 1280px and again at 400px:
1. `/get-started`: screen 1 shows both cards with "Price vs Earnings" and "P/E (TTM)"; progress bar at 20%.
2. Screen 2: search "nvi" shows NVIDIA; pick NVDA and SPY; chips appear; button reads "Continue with 2 stocks". No horizontal scroll at 400px.
3. Screen 3: all three switches on; turn off Dividend dates; each switch has `role="switch"` and a label.
4. Screen 4: NVDA and SPY rows show price and a signed, arrowed move; alerts sentence reads "We'll email you about big price moves and earnings for these stocks."; no request to `/api/stock/*/health-score` in the network log (only `/api/onboarding/health-scores`).
5. Sign up with a throwaway email. Expect redirect to `/get-started/trial`, progress bar at 100%, headline "Here's a one week free trial on us!", terms line with "Free for 7 days, then $108/year".
6. In Supabase: the new user has `experience_level` set, `settings.notifications.dividend_reminder = false`, and `user_watchlist` rows for NVDA and SPY.
7. Click "Continue with Free" → `/dashboard`, no "pick a few stocks" popup (watchlist not empty).
8. Repeat with a second throwaway account and click "Start my free week" → Stripe Checkout shows a 7-day trial. Cancel → back on `/get-started/trial`.
9. Delete both throwaway users (Supabase `auth.users` via the admin API) and any Stripe test customers created.

Check the console for new errors on every screen (ignore the known vercel.live CSP and preload warnings).

- [ ] **Step 4: Polish pass**

Invoke `/impeccable polish components/get-started` and apply its fixes (alignment, states, copy). Lint, commit (`fix(onboarding): polish pass`), push, and re-run Step 3 items 1 to 5 at 400px.

- [ ] **Step 5: Update memory**

Add a project memory `project_onboarding_trial_paywall.md` (what shipped, the trial_will_end webhook event state, the no-double-email rule, test account cleanup done) and a pointer line in `MEMORY.md`.

---

## Self-Review Notes (plan vs spec)

- Spec Part 1 screens 1 to 4 → Tasks 4, 5, 6. Timeframe/risk/interest removal → Task 5 Step 7.
- Spec cache-only Health Score → Task 6 Step 1; verified no `/health-score` call in Task 8 Step 3.4.
- Spec trial offer + skippable + terms + already-Pro skip → Task 7.
- Spec checkout return → Task 3. Spec 7 days everywhere → Task 1 (all copy interpolates `trialDays`; verified no hardcoded "14" in any locale).
- Spec reminder + no double emails + Stripe event → Task 2 (event change gated on David's approval).
- Spec repeat-trial email → Task 2 Step 5.
- Spec edge cases: legacy draft discard (Task 4 `LEGACY_*_KEYS`), popup hides with watchlist (Task 4 Step 7), signed-in redirect race (Task 6 Step 4), email-confirmation fallback unchanged (existing `AuthFormSignup` branch).
- Spec analytics → Tasks 5 (step views, `stocks_picked`, `alerts_chosen`) and 7 (`trial_offer_*`, `trial_checkout_completed`).
- Spec testing + rollout → Task 8 and task order.
