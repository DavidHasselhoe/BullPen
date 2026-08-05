# "Last Used" Sign-In Method Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a small "Last used" badge on BullPen's Google sign-in button when that was the last method this browser used to sign in, matching Supabase's own dashboard login page.

**Architecture:** A tiny localStorage-backed module (`lib/auth/last-used-method.ts`) is written to on successful sign-in (email/password inside `signIn()`, Google inside the OAuth callback page) and read on mount by both login surfaces (`/login` page and `AuthModal`), which pass the result down to `AuthOAuthButtons` as a boolean prop controlling whether the badge renders.

**Tech Stack:** Next.js App Router, React 19 client components, TypeScript strict mode, existing `Badge` UI primitive (`components/ui/badge.tsx`, shadcn/Radix-based).

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-08-05-last-used-auth-method-design.md` — read it first for the full rationale.
- No test framework exists in this repo (per `CLAUDE.md`) — verification is `npm run lint`, `npx tsc --noEmit`, and manual browser checks, not automated tests.
- Badge must use the `secondary` or `outline` `Badge` variant — never Signal Emerald (green), which is reserved for gain/loss data per `DESIGN.md`.
- No new DB schema, no new API routes — this is 100% client-side.
- Email/password sign-in gets **no** badge/hint anywhere (decided during design review) — only the Google button ever renders one.

---

### Task 1: Storage module

**Files:**
- Create: `lib/auth/last-used-method.ts`

**Interfaces:**
- Produces: `LastUsedAuthMethod` (type, `'google' | 'email'`), `getLastUsedAuthMethod(): LastUsedAuthMethod | null`, `setLastUsedAuthMethod(method: LastUsedAuthMethod): void` — both used by Tasks 2 and 3.

- [ ] **Step 1: Write the module**

```ts
/**
 * Tracks which sign-in method this browser last used, purely client-side
 * (localStorage) so the login page can show a small "last used" hint —
 * mirrors Supabase's own dashboard login page. Device-local only; never
 * synced to the server, since the login page doesn't know which user is
 * about to sign in until after they authenticate.
 */

export type LastUsedAuthMethod = 'google' | 'email';

const STORAGE_KEY = 'bullpen-last-auth-method';

export function getLastUsedAuthMethod(): LastUsedAuthMethod | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'google' || value === 'email' ? value : null;
  } catch {
    return null;
  }
}

export function setLastUsedAuthMethod(method: LastUsedAuthMethod): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, method);
  } catch {
    // Storage disabled/unavailable (e.g. some private-browsing modes) — the
    // badge just never appears next time; sign-in itself is unaffected.
  }
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors mentioning `last-used-method.ts`.
Run: `npm run lint` — expect no errors or warnings.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, open any page on `localhost:3000` in a browser, open devtools console, and run:

```js
localStorage.setItem('bullpen-last-auth-method', 'google');
localStorage.getItem('bullpen-last-auth-method'); // → "google"
localStorage.setItem('bullpen-last-auth-method', 'bogus');
```

The `bogus` value simulates corrupted/foreign storage — Task 3's read point (`getLastUsedAuthMethod()`) must return `null` for it, not `'bogus'`. This is verified inline once Task 3 wires up the read call; no separate check needed here beyond confirming the raw `localStorage` calls work.

- [ ] **Step 4: Commit**

```bash
git add lib/auth/last-used-method.ts
git commit -m "feat: add last-used sign-in method storage module"
```

---

### Task 2: Write points — record the method on successful sign-in

**Files:**
- Modify: `lib/auth/auth.ts` (email/password path, inside `signIn()`)
- Modify: `app/auth/callback/page.tsx` (Google OAuth path)

**Interfaces:**
- Consumes: `setLastUsedAuthMethod` from `lib/auth/last-used-method.ts` (Task 1).

- [ ] **Step 1: Add the import to `lib/auth/auth.ts`**

Find the existing imports at the top of the file:

```ts
import { createBrowserClient } from '../supabase/client';
import { maybeClaimShareAttribution } from './share-attribution';
```

Replace with:

```ts
import { createBrowserClient } from '../supabase/client';
import { maybeClaimShareAttribution } from './share-attribution';
import { setLastUsedAuthMethod } from './last-used-method';
```

- [ ] **Step 2: Record `'email'` on successful password sign-in**

In the same file, find this block inside `signIn()`:

```ts
    // Fetch user profile (with retry on abort)
    const { data: userProfile, error: profileError } = await fetchUserProfileWithRetry(supabase, userId);

    if (profileError || !userProfile) {
      const errMsg = /abort|signal|fetch|network/i.test(profileError ?? '')
        ? 'Connection was interrupted. Please try again.'
        : 'Failed to fetch user profile. Please try again.';
      return { success: false, error: errMsg };
    }

    return { success: true, user: userProfile };
  } catch (error) {
```

Replace with:

```ts
    // Fetch user profile (with retry on abort)
    const { data: userProfile, error: profileError } = await fetchUserProfileWithRetry(supabase, userId);

    if (profileError || !userProfile) {
      const errMsg = /abort|signal|fetch|network/i.test(profileError ?? '')
        ? 'Connection was interrupted. Please try again.'
        : 'Failed to fetch user profile. Please try again.';
      return { success: false, error: errMsg };
    }

    setLastUsedAuthMethod('email');
    return { success: true, user: userProfile };
  } catch (error) {
```

- [ ] **Step 3: Record `'google'` on successful OAuth callback**

In `app/auth/callback/page.tsx`, find the import block:

```ts
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';
import { maybeClaimShareAttribution } from '@/lib/auth/share-attribution';
import { Loader2 } from 'lucide-react';
```

Replace with:

```ts
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';
import { maybeClaimShareAttribution } from '@/lib/auth/share-attribution';
import { setLastUsedAuthMethod } from '@/lib/auth/last-used-method';
import { Loader2 } from 'lucide-react';
```

Then find this block:

```ts
      if (data.session) {
        void maybeClaimShareAttribution(data.session.user.id);
        redirectHome();
      }
    };
```

Replace with:

```ts
      if (data.session) {
        setLastUsedAuthMethod('google');
        void maybeClaimShareAttribution(data.session.user.id);
        redirectHome();
      }
    };
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors mentioning `auth.ts` or `callback/page.tsx`.
Run: `npm run lint` — expect no errors or warnings.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, go to `/login`, sign in with an existing email/password account (or the QA test account, `qa-test-agent@bullpen.no` — credentials in this project's Claude memory, `reference-qa-test-account.md`). After landing on the dashboard, open devtools console and run:

```js
localStorage.getItem('bullpen-last-auth-method'); // → "email"
```

Log out, then sign in again via the Google button. After the OAuth round-trip completes and you land back in the app, re-run the same console check — expect `"google"`.

- [ ] **Step 6: Commit**

```bash
git add lib/auth/auth.ts app/auth/callback/page.tsx
git commit -m "feat: record last-used sign-in method on successful auth"
```

---

### Task 3: Read point and badge rendering

**Files:**
- Modify: `components/auth/AuthOAuthButtons.tsx`
- Modify: `app/login/page.tsx`
- Modify: `components/auth/AuthModal.tsx`

**Interfaces:**
- Consumes: `getLastUsedAuthMethod` from `lib/auth/last-used-method.ts` (Task 1); `Badge` from `components/ui/badge.tsx` (existing).
- Produces: `AuthOAuthButtonsProps.lastUsed?: boolean` — new optional prop, defaults to `false`/absent when not passed.

- [ ] **Step 1: Add the `lastUsed` prop and badge to `AuthOAuthButtons`**

Replace the full contents of `components/auth/AuthOAuthButtons.tsx` with:

```tsx
'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

interface AuthOAuthButtonsProps {
  onGoogleClick: () => Promise<void>;
  isLoading?: boolean;
  disabled?: boolean;
  /** True when this browser's last successful sign-in used Google — shows a small badge. */
  lastUsed?: boolean;
}

const GoogleIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="currentColor"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="currentColor"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="currentColor"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

export function AuthOAuthButtons({ onGoogleClick, isLoading = false, disabled = false, lastUsed = false }: AuthOAuthButtonsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: 0.1 }}
      className="space-y-3"
    >
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full gap-3 border-2 transition-all hover:bg-accent/50 hover:border-accent-foreground/20"
        onClick={onGoogleClick}
        disabled={disabled || isLoading}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Connecting...</span>
          </>
        ) : (
          <>
            <GoogleIcon />
            <span>Continue with Google</span>
            {lastUsed && (
              <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0 font-normal">
                Last used
              </Badge>
            )}
          </>
        )}
      </Button>
    </motion.div>
  );
}
```

(Only two things changed from the current file: the `Badge` import + `lastUsed` prop, and the conditional `<Badge>` right after the "Continue with Google" `<span>`. Everything else — the icon, button classes, loading state — is unchanged, reproduced here in full since this is a small file and a full-file replacement is less error-prone than a partial diff.)

- [ ] **Step 2: Wire the read into `/login` page**

In `app/login/page.tsx`, find:

```tsx
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { signInWithGoogle } from '@/lib/auth/auth';
import { AuthOAuthButtons } from '@/components/auth/AuthOAuthButtons';
import { AuthFormLogin } from '@/components/auth/AuthFormLogin';
import { Separator } from '@/components/ui/separator';
import { motion } from 'framer-motion';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  const redirectTo = searchParams.get('redirect') || '/';
```

Replace with:

```tsx
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { signInWithGoogle } from '@/lib/auth/auth';
import { getLastUsedAuthMethod } from '@/lib/auth/last-used-method';
import { AuthOAuthButtons } from '@/components/auth/AuthOAuthButtons';
import { AuthFormLogin } from '@/components/auth/AuthFormLogin';
import { Separator } from '@/components/ui/separator';
import { motion } from 'framer-motion';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastUsedGoogle, setLastUsedGoogle] = useState(false);

  const redirectTo = searchParams.get('redirect') || '/';

  // Read on mount only (not SSR-safe to read synchronously — localStorage
  // doesn't exist on the server, so this must happen post-hydration).
  useEffect(() => {
    setLastUsedGoogle(getLastUsedAuthMethod() === 'google');
  }, []);
```

Then find:

```tsx
        <AuthOAuthButtons
          onGoogleClick={handleGoogleSignIn}
          isLoading={isGoogleLoading}
          disabled={false}
        />
```

Replace with:

```tsx
        <AuthOAuthButtons
          onGoogleClick={handleGoogleSignIn}
          isLoading={isGoogleLoading}
          disabled={false}
          lastUsed={lastUsedGoogle}
        />
```

- [ ] **Step 3: Wire the read into `AuthModal`**

In `components/auth/AuthModal.tsx`, find:

```tsx
import { signInWithGoogle } from '@/lib/auth/auth';
import { AuthOAuthButtons } from './AuthOAuthButtons';
```

Replace with:

```tsx
import { signInWithGoogle } from '@/lib/auth/auth';
import { getLastUsedAuthMethod } from '@/lib/auth/last-used-method';
import { AuthOAuthButtons } from './AuthOAuthButtons';
```

Then find:

```tsx
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: reset form state when modal opens
      setMode(initialMode);
       
      setError('');
    }
  }, [open, initialMode]);
```

Replace with:

```tsx
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastUsedGoogle, setLastUsedGoogle] = useState(false);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: reset form state when modal opens
      setMode(initialMode);
       
      setError('');
      setLastUsedGoogle(getLastUsedAuthMethod() === 'google');
    }
  }, [open, initialMode]);
```

Then find:

```tsx
              <AuthOAuthButtons
                onGoogleClick={handleGoogleAuth}
                isLoading={isGoogleLoading}
                disabled={false}
              />
```

Replace with:

```tsx
              <AuthOAuthButtons
                onGoogleClick={handleGoogleAuth}
                isLoading={isGoogleLoading}
                disabled={false}
                lastUsed={lastUsedGoogle}
              />
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors mentioning `AuthOAuthButtons.tsx`, `login/page.tsx`, or `AuthModal.tsx`.
Run: `npm run lint` — expect no errors or warnings.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`.

1. In devtools console: `localStorage.setItem('bullpen-last-auth-method', 'google')`, then reload `/login`. Expect: a small "Last used" badge on the right side of the Google button.
2. Trigger the `AuthModal` from another entry point (e.g. the landing page's sign-in CTA) with the same storage value set — expect the same badge there.
3. In devtools console: `localStorage.setItem('bullpen-last-auth-method', 'email')`, reload `/login` — expect no badge anywhere (matches the "no email hint" non-goal).
4. In devtools console: `localStorage.removeItem('bullpen-last-auth-method')`, reload `/login` — expect no badge (first-time visitor / cleared storage case).
5. Full end-to-end pass: log out if signed in, sign in with the QA test account's email/password, land in the app, go back to `/login` (or open `AuthModal`) — expect no badge (email was last used, matches non-goal). Then sign in via Google — after landing in the app, return to `/login` — expect the badge to now appear on the Google button.

- [ ] **Step 6: Commit**

```bash
git add components/auth/AuthOAuthButtons.tsx app/login/page.tsx components/auth/AuthModal.tsx
git commit -m "feat: show last-used badge on the Google sign-in button"
```
