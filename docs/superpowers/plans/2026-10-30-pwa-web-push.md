# PWA + Web Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make BullPen installable, and deliver the notifications people care about as phone/desktop pushes: held through quiet hours, combined, at most 3 a day.

**Architecture:** Producers only *mark* rows: `notifications.push_kind` says a row may be pushed. A QStash cron, `/api/cron/dispatch-push`, runs every 15 minutes. It finds pending rows, runs a pure planner (expiry, quiet hours, cap, combining) for each user, sends one push to each of that user's devices with `web-push`, and stamps `pushed_at`. The client side is a manifest, a service worker that only shows pushes and handles clicks, a `PushPrompt` card shown in context, and a Settings row.

**Tech Stack:** Next 16 App Router, React 19, Supabase (service role in routes and actions), `web-push` (new), Upstash QStash, PostHog `trackEvent`, tsx assert scripts (no test framework).

**Spec:** `docs/superpowers/specs/2026-10-30-pwa-web-push-design.md`

## Global Constraints

- Quiet hours are local 22:00 to 08:00. A held push waits until 08:00; it is never skipped because of quiet hours.
- At most 3 pushes per user per local day. A push made up only of `user_alert` rows doesn't count, and `user_alert` rows go out even when the cap is reached.
- Expiry: `daily_challenge_reminder` expires when its New York day ends, `user_alert` after 12 hours, every other kind after 20 hours. An expired row is never pushed.
- Push priority, highest first: `user_alert`, `portfolio_recap`, `price_alerts`, `upcoming_earnings`, `dividend_reminder`, `weekly_pick`, `daily_challenge_reminder`, `new_course`.
- Every push URL carries `src=push&n=<notification id>`.
- New env vars: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:contact@bullpeninvest.com`.
- `web-push` is the only new dependency.
- No offline caching, and no fetch handler in the service worker.
- Push text is the English `title` and `message` already stored on the row.
- UI copy: no em or en dashes. Onboarding copy stays hardcoded English like its siblings. Every other new string goes through i18n (`settings` namespace in Settings, `navigation` for `PushPrompt`).
- Never ask for permission on first page load. Each `PushPrompt` context shows once per device, then stays quiet for 30 days after a dismissal or a no.
- A failed push never fails or delays the notification write.
- Mutations never fail silently (CLAUDE.md). The subscribe/unsubscribe UI shows an inline `role="alert"` message on failure.
- Apply the migration through the Supabase MCP as soon as the file exists.
- Work on `preview` and push after each commit (CLAUDE.md).

## Review Focus

1. **A shared device changes hands.** A pushes must stop when someone signs out, and a new person signing in on the same device must take over its subscription. Owned by Task 4: unsubscribe on sign-out, upsert on endpoint.
2. **The browser reports a garbage or missing time zone.** Fall back to UTC; never crash the dispatcher. Owned by Task 1 (test).
3. **Someone reads a notification in the bell before the dispatcher runs.** It must not be pushed afterwards. Owned by Task 1 (test) and Task 3 (the query filters `is_read = false`).
4. **A row gets updated by the 5-minute dedupe after it was pushed.** It must not push a second time; the update path must not clear `pushed_at`. Owned by Task 2.
5. **Daylight saving changes.** Quiet hours and "local day" must follow the zone's real offset on change dates. Owned by Task 1 (test on 2026-03-29 Oslo and 2026-11-01 New York).

---

### Task 1: Pure push planner

**Files:**
- Create: `lib/notifications/push-plan.ts`
- Create: `scripts/test-push-plan.ts`
- Modify: `package.json` (script `"test-push-plan": "tsx scripts/test-push-plan.ts"`)

**Interfaces:**
- Produces:
  ```ts
  export type PushKind = 'user_alert' | 'portfolio_recap' | 'price_alerts' | 'upcoming_earnings'
    | 'dividend_reminder' | 'weekly_pick' | 'daily_challenge_reminder' | 'new_course';
  export const PUSH_PRIORITY: PushKind[]; // the Global Constraints order
  export interface PendingPushRow { id: string; push_kind: PushKind; title: string; message: string;
    href: string | null; created_at: string; is_read: boolean }
  export interface PushedRow { pushed_at: string; push_kind: PushKind }
  export type PushPlan =
    | { action: 'send'; rowIds: string[]; title: string; body: string; url: string }
    | { action: 'hold'; reason: 'quiet' | 'cap' | 'nothing' };
  export function safeTimeZone(tz: string | null | undefined): string; // invalid or empty -> 'UTC' (use isValidTimeZone from lib/dates/clock.ts)
  export function isQuietHour(now: Date, tz: string): boolean;          // local hour >= 22 || < 8
  export function isExpired(row: Pick<PendingPushRow, 'push_kind' | 'created_at'>, now: Date): boolean;
  export function pushesTodayCount(pushed: PushedRow[], now: Date, tz: string): number;
  export function withPushParams(href: string, id: string): string;     // appends src=push&n=id with ? or &
  export function planUserPush(input: { pending: PendingPushRow[]; pushed: PushedRow[];
    timeZone: string | null; now: Date }): PushPlan;
  ```

- [ ] **Step 1: Write the failing test** `scripts/test-push-plan.ts` (node:assert/strict, same style as `scripts/test-deliverable-email.ts`). Assertions:
  - `safeTimeZone('Not/AZone') === 'UTC'`, `safeTimeZone(null) === 'UTC'`, `safeTimeZone('Europe/Oslo') === 'Europe/Oslo'`.
  - `isQuietHour(new Date('2026-10-30T20:59:00Z'), 'Europe/Oslo') === false` (21:59 local) and `…T21:00:00Z` is `true` (22:00). `…T07:00:00Z` (08:00 local) is `false`.
  - DST: `isQuietHour(new Date('2026-03-29T06:30:00Z'), 'Europe/Oslo') === false` (08:30 CEST, the day clocks go forward). `isQuietHour(new Date('2026-11-01T12:30:00Z'), 'America/New_York') === true` (07:30 EST, the day clocks go back), and `…T13:00:00Z` is `false` (08:00 EST).
  - Expiry: `user_alert` created 11h59m before now is not expired, 12h01m is. `weekly_pick` at 19h59m is not expired, 20h01m is. `daily_challenge_reminder` created `2026-10-30T01:00:00Z` (21:00 NY on the 29th): not expired at `2026-10-30T03:59:00Z`, expired at `2026-10-30T04:01:00Z` (NY midnight is 04:00Z in EDT).
  - `pushesTodayCount`: three rows sharing one `pushed_at` count as 1. A group containing only `user_alert` counts as 0. A `pushed_at` from yesterday (local) counts as 0.
  - `withPushParams('/stock/AAPL', 'x') === '/stock/AAPL?src=push&n=x'` and `withPushParams('/holdings?riskAnalysisId=1', 'x') === '/holdings?riskAnalysisId=1&src=push&n=x'`.
  - `planUserPush`, with `now = 2026-10-30T12:00:00Z`, tz `America/New_York` (08:00 local) unless stated:
    - Empty or all-read `pending` gives `{ action: 'hold', reason: 'nothing' }`. A read row is never in `rowIds`.
    - The same input at `T03:00:00Z` (23:00 local) gives `hold/quiet`.
    - One row gives `send` with that row's title, message as `body`, and `url = withPushParams(href, id)`. A null `href` uses `/notifications`.
    - Three rows (`new_course`, `portfolio_recap`, `upcoming_earnings`) give `send` with all three ids, the `portfolio_recap` title, `body === 'Plus 2 more updates'`, and `url === withPushParams('/notifications', <portfolio_recap id>)`. Two rows give `'Plus 1 more update'`.
    - With `pushed` holding 3 counting pushes today: `pending` of `weekly_pick` + `user_alert` gives `send` with only the `user_alert` id. `pending` of only `weekly_pick` gives `hold/cap`.
    - An expired row is dropped. If everything is expired, the result is `hold/nothing`.

- [ ] **Step 2: Run it and confirm it fails.** `npm run test-push-plan` should fail because the module is missing.
- [ ] **Step 3: Implement `lib/notifications/push-plan.ts`.** Get local hour and date with `Intl.DateTimeFormat(…, { timeZone, hourCycle: 'h23' })` parts. For the New York day end: take the NY calendar date of `created_at`; expiry is the first instant whose NY date is later than that.
- [ ] **Step 4: Run it and confirm it passes.** `npm run test-push-plan` prints `test-push-plan: ok`.
- [ ] **Step 5: Commit.** Message: `feat(push): pure push planner`.

### Task 2: Schema, push marks on producers, shared notification link

**Files:**
- Create: `supabase/migrations/187_push_notifications.sql`
- Create: `lib/notifications/notification-href.ts`
- Modify: `components/notifications/NotificationItem.tsx` (`notificationSource` builds its `href` with `notificationHref`)
- Modify: `lib/notifications/notifications-db.ts` (types, insert, update path)
- Modify: `lib/notifications/notification-creators.ts` (the producers below)
- Delete: `app/actions/notifications.ts` (nothing imports it, and its `createNotification` server action takes any `user_id`. It must not become a way to push to someone else's phone.)

**Interfaces:**
- Consumes: `PushKind` from Task 1.
- Produces:
  - `notifications.push_kind text null`, `notifications.pushed_at timestamptz null`, `notifications.push_opened_at timestamptz null`.
  - Table `push_subscriptions(id uuid pk default gen_random_uuid(), user_id uuid not null references users(id) on delete cascade, endpoint text not null unique, p256dh text not null, auth text not null, time_zone text, user_agent text, created_at timestamptz not null default now(), last_sent_at timestamptz)`.
  - `export function notificationHref(n: Pick<Notification, 'type' | 'entity_type' | 'entity_id' | 'title'>): string | null` in `lib/notifications/notification-href.ts`.
  - `CreateNotificationInput.push?: PushKind`.

- [ ] **Step 1: Write the migration.**
  - The three columns above, and a partial index `notifications_push_pending_idx on notifications(user_id) where push_kind is not null and pushed_at is null`.
  - The `push_subscriptions` table, with an index on `user_id`.
  - RLS on, with policies so a user can select and delete rows `where user_id = auth.uid()`. No insert or update policy: writes go through the service role.
  - Additive and safe on main before the code ships (header comment, like 182).
- [ ] **Step 2: Apply it** with `mcp__claude_ai_Supabase__apply_migration` (project `kgqpzuvhslqazurfrqya`), then check with `select column_name from information_schema.columns where table_name='notifications' and column_name like 'push%'`. Expect 3 rows.
- [ ] **Step 3: Extract `notificationHref`.** Move the href half of `notificationSource` into it with the logic unchanged. Add the single-stock case the card uses (`/stock/<symbol>`, from `entity_id` for `entity_type === 'stock'`, or `leadingTicker(title)` for user alerts), and the Academy cases (`academy:new_course:<slug>` gives `/academy/<slug>`, `academy:streak_reminder:*` gives `/academy`). `notificationSource` keeps its labels and calls it.
- [ ] **Step 4: Store `push_kind`.**
  - `createNotification()` writes `push_kind: input.push ?? null` on insert.
  - On the dedupe update it writes `push_kind` only if the existing row's `pushed_at` is null. It never touches `pushed_at` (Review Focus 4: select `pushed_at` in the dedupe lookup).
  - Add `push_kind` / `pushed_at` / `push_opened_at` to the `Notification` interface.
- [ ] **Step 5: Mark the producers.** `createPortfolioRecapNotification` gets `portfolio_recap`; `createPriceMoveDigestNotification` and `createPriceMoveNotification` get `price_alerts`; `createEarningsUpcomingNotification` gets `upcoming_earnings`; `createDividendReminderNotification` gets `dividend_reminder`; `createDailyChallengeReminderNotification` gets `daily_challenge_reminder`; `createWeeklyPickNotification` gets `weekly_pick`; `createUserAlertNotification` gets `user_alert`. In `notifyNewAcademyCourse`, each inserted row gets `push_kind: 'new_course'`.
- [ ] **Step 6: Verify.**
  - `npm run lint` passes.
  - `npx tsc --noEmit -p . 2>&1 | grep -E "notification|push-plan"` shows no new errors in touched files.
  - Open `/notifications` locally: every card's link is unchanged (compare a stock, a weekly pick and a 13F card before and after).
- [ ] **Step 7: Commit.** Message: `feat(push): mark pushable notifications, push_subscriptions table`.

### Task 3: Sender and dispatcher cron

**Files:**
- Create: `lib/notifications/push-send.ts`
- Create: `app/api/cron/dispatch-push/route.ts`
- Modify: `scripts/test-cron-coverage.ts` (add `'/api/cron/dispatch-push'` to `QSTASH_CRON_PATHS`)
- Modify: `docs/agent/scheduled-work.md` (QStash table row), `docs/agent/environment.md` (the 3 VAPID vars), `.env.example`
- Modify: `package.json` (`web-push` dependency, `@types/web-push` dev dependency)

**Interfaces:**
- Consumes: `planUserPush`, `safeTimeZone`, `PendingPushRow`, `PushedRow` (Task 1); `notificationHref`, the table and columns (Task 2).
- Produces:
  - `export interface StoredSubscription { id: string; endpoint: string; p256dh: string; auth: string }`
  - `export async function sendPush(sub: StoredSubscription, payload: { title: string; body: string; url: string; tag: string }): Promise<'sent' | 'gone' | 'error'>`. A 404 or 410 means `'gone'`. It never throws.
  - Route JSON: `{ users, pushes, rows, held_quiet, capped, expired, gone }`.

- [ ] **Step 1: Generate the VAPID keys and set env vars.**
  - Run `npx web-push generate-vapid-keys` and put the three vars in `.env.local`.
  - Add them to Vercel preview and production with the Vercel MCP `create_project_env` (team and project IDs: `reference_vercel` memory). `VAPID_PRIVATE_KEY` is a sensitive type.
  - Document them in `environment.md` and `.env.example`, without values.
- [ ] **Step 2: Implement `sendPush`.** Call `webpush.setVapidDetails` once at module scope. Send with `TTL: 4 * 3600`. The payload is the JSON of `{ title, body, url, tag }`.
- [ ] **Step 3: Implement the route.** Copy the auth, `maxDuration` and logging shape from `app/api/cron/check-economic-results/route.ts`. Then, in order:
  1. Load subscribed user ids. If there are none, return zeros right away (this keeps CPU cost near zero).
  2. Pending rows: `push_kind not null, pushed_at null, is_read false, created_at > now() - 24h, user_id in (subscribed)`, `.limit(1000)` (PostgREST cap).
  3. Already-pushed rows: `pushed_at > now() - 30h` for those users.
  4. Settings: `users.settings` for those users. Drop users with `notifications.push_alerts === false`, and drop rows whose kind setting is `false` (`user_alert` has no setting).
  5. For each user, call `planUserPush` with the newest subscription's `time_zone` and `href = notificationHref(row)`. On `send`, call `sendPush` on each subscription with `tag = rowIds[0]`. Delete `'gone'` subscriptions.
  6. If at least one device got `'sent'`, update `pushed_at = now` for `rowIds` and `last_sent_at` for those subscriptions.
  7. Count `expired` as pending rows dropped by expiry.
- [ ] **Step 4: Register the schedule.**
  - `npm run test-cron-coverage` passes.
  - Add the `scheduled-work.md` row: `*/15 * * * *`, with what the job does.
  - Create the QStash schedule in the EU region: `*/15 * * * *`, URL `https://bullpeninvest.com/api/cron/dispatch-push`, headers `Upstash-Forward-Authorization: Bearer $CRON_SECRET` and `Upstash-Method: GET`. Use the QStash API if a `QSTASH_TOKEN` is in the environment. Otherwise hand David the exact console values (`reference-qstash-console-header-forwarding` memory). Create it only after this code is on main, or every 15 minutes would hit a 404.
- [ ] **Step 5: Verify locally.** Run `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/dispatch-push`. With no subscriptions it returns `{"users":0,…}`. The end-to-end check is Task 4, Step 7.
- [ ] **Step 6: Commit.** Message: `feat(push): dispatcher cron + web-push sender`.

### Task 4: Installable shell, subscribing, Settings, measuring opens

**Files:**
- Create: `app/manifest.ts`, `public/sw.js`, `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png`, `public/apple-touch-icon.png`, `public/badge-72.png`
- Create: `lib/push/client.ts`, `app/actions/push.ts`, `components/pwa/PwaBoot.tsx`
- Modify: `app/layout.tsx` (icons and `appleWebApp` metadata; mount `<PwaBoot />` inside the existing providers)
- Modify: `next.config.ts` (`/sw.js` headers), `middleware.ts` (exclude `sw.js|manifest.webmanifest` in the page matcher)
- Modify: `components/user/SettingsModal.tsx` (`push_alerts` default `true`, plus the device row), `lib/i18n/locales/en/settings.json` (new keys)
- Modify: `signOut()` in `lib/auth/auth.ts` (Review Focus 1; every sign-out button calls it)

**Interfaces:**
- Consumes: the `push_subscriptions` table (Task 2), `safeTimeZone` (Task 1).
- Produces:
  - `lib/push/client.ts`: `isPushSupported(): boolean`, `isStandalone(): boolean`, `needsHomeScreenInstall(): boolean` (iOS, push not supported in this context, not standalone), `getPermission(): NotificationPermission | 'unsupported'`, `subscribeThisDevice(): Promise<PushSubscriptionJSON>` (registers or reuses `/sw.js`, calls `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`), `unsubscribeThisDevice(): Promise<string | null>` (returns the endpoint it removed).
  - `app/actions/push.ts` (`'use server'`; the user id always comes from `getCurrentUserId()`):
    - `savePushSubscription(sub: PushSubscriptionJSON, timeZone: string, userAgent: string): Promise<{ success: boolean; error?: string }>`. Rejects a non-https endpoint, an endpoint over 1000 characters, or missing keys. Rate limited with `checkRateLimit('push-sub:'+userId, { windowMs: 60_000, maxRequests: 10 })`. Upserts on `endpoint` and sets `user_id` to the caller. Stores `safeTimeZone(timeZone)`.
    - `deletePushSubscription(endpoint: string): Promise<{ success: boolean }>`. Deletes only the caller's own row.
    - `recordPushOpen(notificationId: string): Promise<void>`. Sets `push_opened_at = now()` and `is_read = true` where `id` matches and `user_id` is the caller.

- [ ] **Step 1: Manifest and icons.**
  - `app/manifest.ts` per the spec (`start_url: '/dashboard?src=pwa'`, `display: 'standalone'`, colours from DESIGN.md).
  - Export the PNGs from the existing bull mark (`public/icon-light.png` / `icon-dark.png`). The maskable icon gets about 20% safe padding. The badge is a white silhouette on transparent.
- [ ] **Step 2: Service worker.** In `public/sw.js`:
  - `push`: parse the JSON and call `showNotification(title, { body, icon: '/icon-192.png', badge: '/badge-72.png', tag, data: { url } })`.
  - `notificationclick`: `clients.matchAll({ type: 'window', includeUncontrolled: true })`. Focus and `navigate(url)` the first same-origin client, otherwise `clients.openWindow(url)`.
  - No other listeners.
  - `next.config.ts`: `/sw.js` gets `Cache-Control: no-cache, no-store, must-revalidate`.
- [ ] **Step 3: `lib/push/client.ts` and `app/actions/push.ts`** with the interfaces above.
- [ ] **Step 4: `PwaBoot`** (client, renders `null`):
  - Registers `/sw.js` when `isPushSupported()`.
  - On the first standalone launch, fires `trackEvent('pwa_installed')`, once per device via try/catch `localStorage` key `bp_pwa_installed`.
  - When the URL has `src=push&n=<id>`, calls `recordPushOpen(id)` and strips both params with `router.replace`.
- [ ] **Step 5: Settings row.** In the Notifications tab, next to `email_alerts`, a "Notifications on this device" row.
  - When push is supported and permission isn't denied: enable/disable buttons calling `subscribeThisDevice` + `savePushSubscription`, or `unsubscribeThisDevice` + `deletePushSubscription`.
  - When permission is denied: the note "Turned off in your browser settings".
  - When `needsHomeScreenInstall()`: a one-line hint to add BullPen to the Home Screen.
  - Otherwise nothing.
  - A failure shows inline with `role="alert"`.
  - Also the `push_alerts` toggle with the existing `ToggleSetting`.
- [ ] **Step 6: Unsubscribe on sign-out.** Before the session is cleared: `const endpoint = await unsubscribeThisDevice(); if (endpoint) await deletePushSubscription(endpoint);`, wrapped so a failure never blocks sign-out.
- [ ] **Step 7: Verify end to end on desktop Chrome (localhost).**
  - Enable push in Settings. `select endpoint, time_zone from push_subscriptions` shows one row with your zone.
  - Insert a test notification for the QA account (`reference-qa-test-account` memory) with `push_kind='weekly_pick'`, then curl the dispatcher. A system notification appears, and the row's `pushed_at` is set.
  - Click it. It lands on the link with `src=push`, the params are stripped, and `push_opened_at` and `is_read` are set.
  - Curl the dispatcher again: `pushes: 0`.
  - Sign out: the subscription row is gone.
  - Sign in as a second account on the same browser and enable push: the same endpoint now belongs to the second account.
  - Lighthouse "Installable" passes.
- [ ] **Step 8: Commit.** Message: `feat(pwa): manifest, service worker, device subscribe, push opens`.

### Task 5: Asking in context

**Files:**
- Create: `components/pwa/PushPrompt.tsx`
- Modify: `components/get-started/AlertsStep.tsx`, `lib/onboarding/pending-onboarding.ts` (`AlertChoices.learning`, `DEFAULT_ALERTS.learning = true`, the pending `pushSubscription?: { sub: PushSubscriptionJSON; timeZone: string }`), `lib/onboarding/flush.ts` (writes `learning` to settings keys `daily_challenge_reminder` + `new_course`; saves a held subscription with `savePushSubscription`)
- Modify: `app/holdings/page.tsx`, `components/academy/LessonPlayer.tsx`, `components/alerts/AlertDialog.tsx` (`onCreated`), `app/dashboard/page.tsx` (or its Home client component)
- Modify: `lib/i18n/locales/en/navigation.json` (new `PushPrompt` keys)

**Interfaces:**
- Consumes: `lib/push/client.ts` and `app/actions/push.ts` (Task 4).
- Produces: `<PushPrompt context="holding" | "lesson" | "alert" | "home" />`. The onboarding ask is built into `AlertsStep`, not done through `PushPrompt`.

- [ ] **Step 1: `PushPrompt`.**
  - Renders nothing when any of these holds:
    - `getPermission()` is `'denied'` or `'granted'` with this device already subscribed
    - neither push nor `needsHomeScreenInstall()` applies
    - the `localStorage` key `bp_push_prompt_<context>` holds a timestamp less than 30 days old
    - context `home` and the device isn't `needsHomeScreenInstall()`
  - Otherwise it shows one of two cards:
    - A permission card (one button: subscribe, then save).
    - The Add to Home Screen steps when `needsHomeScreenInstall()`, which adds "You'll sign in once more" if the Task 6 iPhone check confirms separate storage.
  - It's a quiet inline card per DESIGN.md, not a modal.
  - Fires `trackEvent('push_prompt_shown', { context, platform })` and `trackEvent('push_prompt_answered', { context, platform, result })`, where `result` is `granted`, `denied`, `dismissed` or `install_shown`.
  - Writes the timestamp on any outcome.
  - A failed save shows `role="alert"`.
- [ ] **Step 2: Place it.**
  - Holdings page: when `holdings.length > 0`, context `holding`.
  - `LessonPlayer`: after the `academy_lesson_completed` event, on the finish screen, context `lesson`.
  - `AlertDialog`: after `onCreated`, under the list, context `alert`.
  - Home: for signed-in users who finished onboarding, context `home`.
  - Copy follows the spec's drafts, through i18n.
- [ ] **Step 3: Onboarding.** `AlertsStep` gets a fourth row, `learning`, "Learning: Streak reminders and new courses". Below the rows, a "Send these to my phone" button:
  - Hidden when `!isPushSupported() || needsHomeScreenInstall()`.
  - On click it calls `subscribeThisDevice()` and keeps `{ sub, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }` in the pending onboarding data.
  - `flushPendingOnboardingData` saves it after signup.
  - Continuing without tapping it works exactly as today.
- [ ] **Step 4: Verify in the browser (localhost, desktop Chrome plus mobile emulation).**
  - Each context shows once, and doesn't come back after dismissing.
  - The onboarding button subscribes before signup, and the row appears in `push_subscriptions` right after signup.
  - Emulated iPhone Safari shows the install steps on Home and no onboarding button.
  - `npm run lint` passes.
- [ ] **Step 5: Translate.** Run `npm run i18n:translate` for the new keys and review the diff for rewritten unrelated keys (`feedback-i18n-translate-review-diff` memory).
- [ ] **Step 6: Commit.** Message: `feat(push): ask in context (onboarding, holdings, lessons, alerts, Home)`.

### Task 6: Real devices and polish

**Files:** whatever the checks turn up.

- [ ] **Step 1:** Push to `preview`. Confirm the Vercel preview build is READY, not just lint (`feedback-verify-vercel-builds-not-just-lint` memory).
- [ ] **Step 2: Android Chrome on preview.** Install prompt, Settings enable, a test push via a QA notification plus a curl to the preview dispatcher, and the click landing.
- [ ] **Step 3: David's iPhone on preview.** Add to Home Screen, then open it.
  - Record whether the session carried over (this decides the "sign in once more" line in Task 5).
  - Allow push from the installed app, and confirm a test push arrives and opens.
- [ ] **Step 4:** Run `/impeccable polish` on `PushPrompt`, the `AlertsStep` row and the Settings row. Fix what it finds.
- [ ] **Step 5: Commit the fixes.** Remind David of two things: the Termly privacy line, and creating the QStash schedule after the merge to main (Task 3, Step 4).
