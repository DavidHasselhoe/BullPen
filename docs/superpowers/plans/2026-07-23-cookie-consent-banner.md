# Cookie Consent Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a small, on-brand cookie consent banner (floating bottom-left card) that lets a first-time visitor choose "Accept all" or "Necessary only", persisting the choice in `localStorage` so it doesn't reappear.

**Architecture:** A pure `localStorage` read/write helper (`lib/cookie-consent/storage.ts`) backs a single client component (`components/cookie-consent/CookieConsentBanner.tsx`) that shows itself once, on a short delay, if no consent is stored yet. The component is mounted once in `app/layout.tsx` alongside the app's other global singletons (`NotificationToastListener`, `PendingOnboardingFlush`).

**Tech Stack:** Next.js App Router client component, `framer-motion` (already a dependency — no new packages), existing `components/ui/button.tsx` (shadcn), Tailwind v4 tokens (`bg-background`, `border`, emerald-500 for the CTA per project convention).

## Global Constraints

- No new npm dependencies — reuse `framer-motion` (already installed); do **not** add `lottie-react` or any Lottie asset (per spec: "fun" comes from copy + motion, not a new animation asset).
- Consent choice lives in `localStorage` only, under the exact key `bullpen_cookie_consent` — no Supabase sync, no cookie, no cross-device persistence (per spec).
- Exactly two choices: "Accept all" and "Necessary only" — no category-manager panel, no third "Manage preferences" tier (per spec).
- No script-gating logic — Vercel Analytics/Speed Insights are cookieless and keep loading regardless of the user's choice (per spec, this is a legal-cover banner, not a consent-gate).
- Primary CTA ("Accept all") uses `bg-emerald-500 hover:bg-emerald-600 text-white` (Signal Emerald, the project's one meaningful color per `DESIGN.md`) — never red, since nothing here is a negative/loss state.
- Must respect `prefers-reduced-motion` — fall back to a plain opacity fade instead of the spring scale/slide (CLAUDE.md §7 Animation: 150–300ms, transform/opacity only).
- `role="region"` / `aria-label="Cookie consent"` — non-blocking, no focus trap, page stays interactive underneath (per spec).
- This repo has **no unit test framework** (`package.json` has no jest/vitest/testing-library — only `tsx`-run one-off scripts). Verification for every task below is: `npm run lint` passes, plus a manual/Playwright browser check — not unit tests. This matches CLAUDE.md's standing rule to verify UI work in a real browser before calling it done.

---

### Task 1: Consent storage helper

**Files:**
- Create: `lib/cookie-consent/storage.ts`

**Interfaces:**
- Produces: `type CookieConsentValue = 'accepted' | 'rejected'`, `getStoredConsent(): CookieConsentValue | null`, `setStoredConsent(value: CookieConsentValue): void` — Task 2 imports these three names directly from `@/lib/cookie-consent/storage`.

- [ ] **Step 1: Write the storage helper**

```ts
// lib/cookie-consent/storage.ts
export type CookieConsentValue = 'accepted' | 'rejected';

interface StoredConsent {
  value: CookieConsentValue;
  ts: number;
}

const STORAGE_KEY = 'bullpen_cookie_consent';

export function getStoredConsent(): CookieConsentValue | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredConsent>;
    if (parsed.value === 'accepted' || parsed.value === 'rejected') return parsed.value;
    return null;
  } catch {
    return null;
  }
}

export function setStoredConsent(value: CookieConsentValue): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: StoredConsent = { value, ts: Date.now() };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage unavailable (private browsing, quota, disabled) — fail
    // silently; the banner will simply reappear next visit.
  }
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: 0 errors (warnings acceptable per CLAUDE.md).

- [ ] **Step 3: Commit**

```bash
git add lib/cookie-consent/storage.ts
git commit -m "feat: add cookie consent localStorage helper"
```

---

### Task 2: Banner component + mount in layout

**Files:**
- Create: `components/cookie-consent/CookieConsentBanner.tsx`
- Modify: `app/layout.tsx:16` (add import), `app/layout.tsx:103` (mount alongside `NotificationToastListener`)

**Interfaces:**
- Consumes: `getStoredConsent(): CookieConsentValue | null`, `setStoredConsent(value: CookieConsentValue): void` from `@/lib/cookie-consent/storage` (Task 1).
- Produces: `CookieConsentBanner()` — a default-exportless named React component, no props, mounted once at the app root.

- [ ] **Step 1: Write the banner component**

```tsx
// components/cookie-consent/CookieConsentBanner.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { getStoredConsent, setStoredConsent, type CookieConsentValue } from '@/lib/cookie-consent/storage';

const SHOW_DELAY_MS = 500;

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (getStoredConsent()) return;
    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const dismiss = (value: CookieConsentValue) => {
    setStoredConsent(value);
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="region"
          aria-label="Cookie consent"
          initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 20 }}
          animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
          exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 20 }}
          transition={
            prefersReducedMotion
              ? { duration: 0.2 }
              : { type: 'spring', stiffness: 300, damping: 20 }
          }
          // left-4/bottom-5, matching NotificationToast's positioning (see
          // components/notifications/NotificationToast.tsx) — keeps clear of
          // the bottom-right "Ask Bull" toggle, with the same mobile tab-bar
          // clearance offset.
          className="fixed bottom-5 left-4 max-md:[bottom:calc(3.5rem+1.25rem+env(safe-area-inset-bottom))] z-50 w-[calc(100vw-2rem)] max-w-sm rounded-2xl border bg-background p-4 shadow-lg"
        >
          <p className="text-sm text-foreground">
            {'🍪'} Just the cookies that keep you logged in — no ad trackers here.{' '}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
              Learn more
            </Link>
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => dismiss('rejected')}>
              Necessary only
            </Button>
            <Button
              size="sm"
              className="bg-emerald-500 text-white font-semibold hover:bg-emerald-600"
              onClick={() => dismiss('accepted')}
            >
              Accept all
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Mount it in the root layout**

In `app/layout.tsx`, add the import next to the other component imports (near line 16, after `NotificationToastListener`):

```ts
import { CookieConsentBanner } from "@/components/cookie-consent/CookieConsentBanner";
```

Then render it next to `<NotificationToastListener />` (around line 103):

```tsx
                <NotificationToastListener />
                <CookieConsentBanner />
```

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: 0 errors.

- [ ] **Step 4: Manual browser verification**

Start the dev server (`npm run dev`) and use the Playwright MCP tools to drive a real browser:

1. Clear `localStorage` for `http://localhost:3000` (or use a fresh context), navigate to `/`.
2. Confirm the card appears bottom-left after ~500ms, with the spring entrance.
3. Confirm the copy, the `/privacy` link, and both buttons render correctly in **both** light and dark theme (toggle via the app's theme control).
4. Click **"Accept all"** — card exits, then reload the page and confirm it does **not** reappear. Check `localStorage.getItem('bullpen_cookie_consent')` in the console — expect `{"value":"accepted","ts":<number>}`.
5. Clear `localStorage` again, reload, click **"Necessary only"** — confirm the same dismiss/persist behavior with `"value":"rejected"`.
6. Emulate `prefers-reduced-motion: reduce` (Playwright `page.emulateMedia` or browser devtools rendering tab) and confirm the card fades in/out instead of springing/scaling.
7. Tab through the page with keyboard only and confirm both buttons are reachable with a visible focus ring.

Expected: all seven checks pass with no console errors.

- [ ] **Step 5: Commit**

```bash
git add components/cookie-consent/CookieConsentBanner.tsx app/layout.tsx
git commit -m "feat: add cookie consent banner"
```

---

## Self-Review Notes

- **Spec coverage:** in-house build (Tasks 1–2), simple accept/reject-only (Task 2 Step 1), localStorage-only storage (Task 1), no-new-dependency motion (Task 2 uses existing `framer-motion`), bottom-left placement + Signal Emerald CTA + reduced-motion fallback (Task 2 Step 1), accessibility role/label (Task 2 Step 1) — all covered. Script-gating and category panel are explicitly out of scope per spec and not present in either task.
- **Placeholder scan:** none found — all steps contain complete, runnable code.
- **Type consistency:** `CookieConsentValue` defined once in Task 1's `storage.ts` and imported (not redefined) in Task 2's component; `getStoredConsent`/`setStoredConsent` names match between both tasks.
