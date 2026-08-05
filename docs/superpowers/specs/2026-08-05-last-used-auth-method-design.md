# "Last Used" Sign-In Method Badge — Design Spec

**Date:** 2026-08-05
**Status:** Draft, pending review

## Problem

BullPen supports two sign-in methods: Google OAuth and email/password. A user who signed up via Google and later forgets that (a common support complaint across products with mixed auth) will land on the login form, try their usual password, fail, and conclude something is broken — when the real issue is they're using the wrong method entirely.

Supabase's own dashboard login page solves this with a small "LAST USED" badge next to whichever method the user signed in with previously, so returning users don't have to guess or remember. This spec adds the equivalent to BullPen's two login surfaces.

## Goals

- On return to either login surface, a user who last signed in with Google sees a small, unobtrusive badge on the Google button reminding them.
- Device-local only — no cross-device sync, no new DB schema, no new privacy surface (nothing beyond "which button did this browser use last" ever leaves the client).
- Works identically on both login surfaces: `/login` (`app/login/page.tsx`) and the `AuthModal` (used from the landing page and elsewhere).

## Non-goals (this pass)

- **Email-method hint.** When email/password was the last method used, no extra UI is shown. The email form is always visible as the default option regardless of history, so there's nothing to disambiguate the way there is for the Google button (decided during design review — the alternative of a "(last used)" note on the "Or continue with email" divider was considered and rejected as unnecessary).
- **Cross-device sync via the DB.** Architecturally not possible for this use case anyway — the login page doesn't know which user is about to sign in until *after* they authenticate, so there's no `users` row to read a stored preference from beforehand.
- **Pre-filling the email address.** Supabase's own badge doesn't do this either; scope stays to "which method," not "which credentials."
- **A new toast/notification primitive.** Not needed — this is a static badge rendered from a boolean, no transient feedback involved.

## Design

### New module: `lib/auth/last-used-method.ts`

Small, isolated, two functions:

```ts
export type LastUsedAuthMethod = 'google' | 'email';

const STORAGE_KEY = 'bullpen-last-auth-method';

export function getLastUsedAuthMethod(): LastUsedAuthMethod | null { ... }
export function setLastUsedAuthMethod(method: LastUsedAuthMethod): void { ... }
```

Both wrapped in `try/catch` around `window.localStorage` access — private-browsing or storage-disabled edge cases silently no-op rather than throwing. `getLastUsedAuthMethod` also returns `null` immediately when `window` is undefined (SSR safety), no error needed for that path since it's an expected condition, not a failure.

Stored as a plain string value (`'google'` or `'email'`), not a boolean, so a future third method (Apple, GitHub, etc.) is a one-line addition to the union type rather than a rewrite — matches the existing `provider: 'google'` string already used at the `signInWithOAuth` call site.

### Write points (2 — both already-centralized, no new duplication)

1. **`signIn()`** in `lib/auth/auth.ts` — call `setLastUsedAuthMethod('email')` right after the existing `last_login_at` update, before the success return. This one function already backs both login surfaces (`AuthFormLogin` is shared), so no per-surface duplication.
2. **`app/auth/callback/page.tsx`** — call `setLastUsedAuthMethod('google')` where `data.session` is confirmed after `exchangeCodeForSession()` succeeds. This is the single landing point for every OAuth completion regardless of which page/modal initiated it, and only fires on a genuinely established session — not on a cancelled Google consent screen (ruling out the alternative of writing the flag optimistically before the redirect, which would produce false positives on cancellation).

### Read point + rendering

`AuthOAuthButtons` (`components/auth/AuthOAuthButtons.tsx`) gains an optional `lastUsed?: boolean` prop. Both call sites (`app/login/page.tsx`, `components/auth/AuthModal.tsx`) read the stored value in a `useEffect` on mount (avoids an SSR/hydration mismatch — the value literally doesn't exist on the server) and pass `lastUsed={getLastUsedAuthMethod() === 'google'}` down.

When `lastUsed` is true, render a small `Badge` (existing `components/ui/badge.tsx` primitive) inside the Google button, right-aligned — same placement Supabase uses. Styled as a muted/outline badge consistent with BullPen's existing secondary-badge treatment, **not** Signal Emerald — that color is reserved for gain/loss and the landing hero accent per `DESIGN.md`, and this badge is neutral UI chrome, not a market signal.

The badge appears a beat after mount (once the `useEffect` runs), which is consistent with the login page's existing fade-in entrance animation — no flash-of-wrong-content concern since there's nothing incorrect being shown before the badge appears, just nothing yet.

### Error handling

- `localStorage` unavailable/throws → treated as "no history," badge simply never appears. Never blocks sign-in itself (write points are fire-and-forget relative to the auth flow's own success/error handling, which is unchanged).
- No new error states introduced anywhere in the auth flow.

### Testing

No test framework in this repo (per `CLAUDE.md`, one-off scripts only, no unit test runner). Verification is manual:
1. Sign in with email/password, reload `/login` → no badge (matches "email has no hint" non-goal).
2. Sign in with Google, return to `/login` and open `AuthModal` from another entry point → badge appears on the Google button in both.
3. Sign out, sign back in with email → badge disappears (flag overwritten to `'email'`).
4. Private/incognito window with storage restrictions → page loads normally, no badge, no console errors.
