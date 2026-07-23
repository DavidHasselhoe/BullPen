# Cookie Consent Banner — Design

## Purpose

BullPen has no cookie consent mechanism today, despite the privacy policy's boilerplate cookie language. This adds a lightweight, on-brand consent banner — inspired by LottieFiles' playful floating-card style, but simplified to match BullPen's actual cookie footprint (essential auth cookies only; Vercel Analytics/Speed Insights are cookieless and need no consent).

## Decisions confirmed with user

- **Build in-house**, not a CMP (Cookiebot/Osano/etc). BullPen's cookie footprint is trivial today, so a bought consent-management platform would be overkill — extra script, extra cost, and a "skin someone else's widget" constraint that fights the "clean and fun" goal.
- **Simple two-choice banner**: "Necessary only" / "Accept all". No category-manager panel (no Functional/Performance/Marketing/Analytics/Social/Geolocation toggles like the Lottie reference) — there's nothing real to categorize yet.
- **localStorage only**, no Supabase sync. Per-device consent is normal, industry-standard behavior; re-prompting a user who switches devices or clears storage is legally fine and not worth a backend write path.
- **"Fun" comes from copy + motion, not a new animation asset.** A springy framer-motion entrance (already a project dependency) and on-brand playful microcopy carry the personality — no Lottie file, no `lottie-react` dependency, no mascot animation.

## Component

New file: `components/cookie-consent/CookieConsentBanner.tsx` — client component.

Mounted once in `app/layout.tsx`, alongside the other global singletons (`NotificationToastListener`, `PendingOnboardingFlush`), so it's present on every route without being page-specific.

## Storage & data flow

- Key: `bullpen_cookie_consent` in `localStorage`.
- Value: JSON `{ value: 'accepted' | 'rejected', ts: number }`.
- On mount: read the key. If present, render nothing. If absent, show the card after a short delay (~500ms) so it doesn't slam the user immediately on first paint.
- "Accept all" and "Necessary only" both just write the flag and dismiss (animated exit) — there is no conditional script-loading to gate today, since the only third-party script (Vercel Analytics/Speed Insights) is cookieless and loads regardless of consent. This is intentionally a legal-cover banner now, not a script gate.
- Extension point for later: if BullPen ever adds real tracking cookies (e.g. an analytics tool that isn't cookieless), a `hasConsent('analytics')` helper reading this same localStorage key is the natural place to gate that script — not built now, no placeholder code for it either.

## Visual design

- **Placement**: floating card, bottom-left, fixed position — not a full-width bar. Keeps it out of the way of BullPen's information-dense UI.
- **Style**: rounded-2xl, soft shadow, theme-aware background using existing design tokens (dark/light), consistent with the rest of the app's card styling — not a hardcoded white card like the Lottie reference screenshot.
- **Copy**: short, playful, on-brand. Something like *"🍪 Just the cookies that keep you logged in — no ad trackers here."* with a small inline link to `/privacy` for details.
- **Buttons**: "Accept all" is primary, using Signal Emerald (the only meaningful brand color, per `DESIGN.md`). "Necessary only" is a quiet ghost/outline secondary button. No red — nothing here is a loss/negative state.
- **Motion**: framer-motion spring entrance (slight scale + slide, gentle overshoot) and matching exit on dismiss. Respect `prefers-reduced-motion`: fall back to a plain opacity fade, per the UI/UX standard in `CLAUDE.md` (§7 Animation).

## Accessibility

- `role="region"` with `aria-label="Cookie consent"` — not a blocking modal, no focus trap, page stays fully interactive underneath.
- Both buttons keyboard-reachable with visible focus states.
- Contrast checked against the accessibility guidelines in `.agents/skills/ui-ux-pro-max/SKILL.md` for both themes.

## Out of scope

- Category-level consent toggles (Analytics/Marketing/etc.) — nothing to gate yet.
- Cross-device sync of consent choice.
- Geo-detection / region-specific consent flows (GDPR vs CCPA banners differing by IP).
- Updating `content/legal/privacy-policy.html`'s cookie section — the existing boilerplate language already covers cookie usage in general terms; not touched by this build.
