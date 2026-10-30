# PWA + web push: design

Date: 2026-10-30. Replaces the 10-29 scope note (`docs/PWA_WEB_PUSH_SCOPE.md`, deleted).

## Why

BullPen's problem is return visits, not signups. As of 10-29: 31 accounts, 3 active in the last 7 days, 0 paying, and no new user has come back on a later day. People turn alerts on in onboarding, but those alerts only land in the in-app bell (0 of 14 new users ever read one). The 08:30 UTC morning email covers only some notification types, and only for verified users.

Push is the main thing a native app would add, and web push gets it for ~$0:
- Android Chrome and desktop browsers: works without installing.
- iPhone/iPad (iOS 16.4+): only from the web app added to the Home Screen.

It is also the test for the App Store decision. If push brings people back, that makes the case for a native app. If nobody installs or allows it, months were saved. (The evaluation and triggers are in the roadmap memory, 10-29.)

## What David decided

- **What gets pushed depends on what the person cares about.** A portfolio person wants "your portfolio jumped 1.5% today" and earnings for their stocks. A learner wants "keep your streak alive" and new courses.
- **People are asked in context.** Nobody has to go to Settings to opt in; Settings is for turning things off.
- **Defaults Claude proposed and David accepted (10-30):**
  - Quiet hours from 22:00 to 08:00 in the person's time zone.
  - At most 3 pushes per person per day.
  - The morning email stays as it is for everyone.
  - Icons made from the existing bull logo. A designer can redo them later.
  - Push text in English only.
  - David adds push subscriptions to the privacy policy in Termly himself.
- **A push that comes due during quiet hours waits until 08:00 local time** (David, 10-30). See "Quiet hours" for why skipping it doesn't work.

## Goals

1. BullPen is installable, and opening a push lands on the right page.
2. Portfolio people get portfolio pushes and learners get learning pushes. Each says yes at the moment the interest shows.
3. Whether push works can be measured account by account, including for people who declined cookies.

## Non-goals

- Offline mode or page caching. Stale market data is worse than an error.
- Home-screen widgets, an App Store or Play build, or Capacitor.
- Translated push text.
- Per-type push switches in Settings. The existing per-type switches plus one master push switch cover it.
- Making the streak reminder time-zone aware (follow-up, see Risks).

## Anti-goals (fails even if it technically works)

- Asking on first page load, or asking again within weeks of a no.
- More than 3 buzzes a day, several buzzes in the same second, or buzzing at night.
- Lower onboarding completion. Nobody is sent to the Home Screen in the middle of onboarding.
- A failed push ever breaking or delaying the notification itself.

## Constraints

- Next 16. Follow `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md` and use `app/manifest.ts`.
- CSP: `worker-src` is unset, so it falls back to `script-src 'self'`, which allows `/sw.js`. No change needed.
- `middleware.ts` matcher: add `sw.js|manifest.webmanifest` to the exclusion pattern. Vercel CPU is already over quota.
- Apply migrations right away with the Supabase MCP (CLAUDE.md).
- New env vars: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:contact@bullpeninvest.com`). Document them in `docs/agent/environment.md` and set them in Vercel (preview and production) and in `.env.local`.
- One new dependency, `web-push`. VAPID signing and payload encryption are not worth writing by hand.
- New cron: follow `docs/agent/scheduled-work.md` and run `npm run test-cron-coverage`.
- UI copy has no em or en dashes.
  - The onboarding steps, including `AlertsStep`, are hardcoded English with no i18n. The new onboarding row and button follow that and stay English.
  - Everything outside onboarding goes through i18n: the Settings strings in the `settings` namespace, `PushPrompt` in `navigation`.
- Frontend rules from CLAUDE.md apply: ui-ux-pro-max checks, then one `/impeccable polish` over the new prompt surfaces at the end.

## How it works

### 1. Installable app

- `app/manifest.ts`:
  - name and short_name "BullPen", `display: 'standalone'`, `start_url: '/dashboard?src=pwa'`
  - theme and background colours from DESIGN.md
  - icons: 192 and 512 PNG, plus a 512 maskable one, exported from the bull logo into `public/`
- Root layout: a 180px `apple-touch-icon` and `appleWebApp` metadata.

### 2. Service worker `public/sw.js`

- `push`: `showNotification(title, { body, icon: '/icon-192.png', badge, tag, data: { url } })`.
- `notificationclick`: focus an open BullPen tab and navigate it to `url`, or open a new window.
- No fetch handler and no caching.
- `next.config.ts` headers for `/sw.js`: `Cache-Control: no-cache, no-store, must-revalidate`.
- Registered client-side only when the browser supports push. Registering asks for nothing.

### 3. Data (one migration)

**`push_subscriptions`**

| column | notes |
|---|---|
| id | uuid pk |
| user_id | fk users, on delete cascade |
| endpoint | text, unique |
| p256dh, auth | text |
| time_zone | IANA zone from the browser at subscribe time. Used for quiet hours, because the `time_zone` setting is often `'auto'`, which the server can't resolve. |
| user_agent | text, for debugging per platform |
| created_at, last_sent_at | timestamptz |

- RLS: users can select and delete their own rows. Writes go through server actions using the service role.
- Subscribing upserts on `endpoint`. If someone else signs in on the same device, the row moves to them.

**`notifications`: three new nullable columns**

- `push_kind text`: which push this row is eligible for. Null means bell only.
- `pushed_at timestamptz`: when it went out as a push. Every row in one combined push gets the same value.
- `push_opened_at timestamptz`: when someone opened it from the push.

### 4. Settings

- New key `settings.notifications.push_alerts`, on by default, next to `email_alerts`.
- The Notifications tab in `SettingsModal.tsx` gets a "Notifications on this device" row. It shows one of three states:
  - an enable button, when push is supported and permission isn't denied
  - a short note when permission is denied ("Turned off in your browser settings")
  - nothing, when the browser can't do push
- Turning `push_alerts` off stops all pushes. The existing per-type switches still decide whether each notification gets created at all.

### 5. Marking: producers say which rows can be pushed

- `CreateNotificationInput` gets an optional `push?: PushKind`. `createNotification()` stores it in `push_kind`. When the 5-minute dedupe updates an existing row that hasn't been pushed yet, it keeps `push_kind`.
- Which producers set it:

  | producer | push_kind |
  |---|---|
  | `createPortfolioRecapNotification` | `portfolio_recap` |
  | `createPriceMoveDigestNotification`, `createPriceMoveNotification` | `price_alerts` |
  | `createEarningsUpcomingNotification` | `upcoming_earnings` |
  | `createDividendReminderNotification` | `dividend_reminder` |
  | `createDailyChallengeReminderNotification` | `daily_challenge_reminder` |
  | `createWeeklyPickNotification` | `weekly_pick` |
  | `createUserAlertNotification` | `user_alert` |
  | `notifyNewAcademyCourse` (bulk insert) | `new_course`, set on each inserted row |

- Everything else stays in the bell only: health score, 13F, politician trades, economic events, index changes, Daily Brief, AI insights, billing.
- Producers send nothing themselves. Notification writes behave exactly as today, so a push can never break or slow one.

### 6. Sending: one dispatcher

New cron `/api/cron/dispatch-push` on QStash, every 15 minutes, protected by `CRON_SECRET` like the others. Each run:

1. **Find pending rows.** Rows with `push_kind` set, `pushed_at` null, `is_read` false, not past their expiry, and belonging to a user with at least one subscription.
2. **Apply expiry.** Each kind has a fixed shelf life. A row that's too old is never pushed; it stays in the bell.
   - `daily_challenge_reminder`: until its New York streak day ends.
   - `user_alert`: 12 hours.
   - everything else: 20 hours.
3. **Skip users who turned push off.** That means `push_alerts === false`, or the row's kind switched off since it was created.
4. **Check quiet hours.** If it's between 22:00 and 08:00 for the user's newest subscription's `time_zone`, the user is held to a later run. Nothing is marked.
5. **Check the daily cap: 3 pushes per local day.** Count the distinct `pushed_at` values on that user's rows during their local day, leaving out pushes that held only `user_alert` rows.
   - If the cap is reached, only `user_alert` rows go out.
   - Everything else waits, and expires if the cap doesn't free up.
6. **Combine.** All of a user's eligible rows go out as **one** push.
   - One row: its title, its message, and its link.
   - Several rows: the highest-priority row's title, with "and N more updates" as the body. The link goes to `/notifications`.
   - Priority, highest first: user_alert, portfolio_recap, price_alerts, upcoming_earnings, dividend_reminder, weekly_pick, daily_challenge_reminder, new_course.
7. **Send and record.** Send to each of the user's devices with `web-push`.
   - A 404 or 410 deletes that subscription.
   - Success sets `last_sent_at` on the subscription and `pushed_at` on every row in the push.
8. **Report.** Return `{ users, pushes, rows, held_quiet, capped, expired, gone }` in the cron JSON, so cron health alerts and logs show it.

Push text and links:
- Text is the English `title` / `message` already stored on each row.
- The link comes from the same entity-to-link logic the bell uses in `NotificationItem`. Pull that logic out into a shared function so the bell and push can never disagree.
- Every push link carries `?src=push&n=<notification id>`. For a combined push, `n` is the top row's id.

Why one dispatcher instead of pushing inside `createNotification`:
- A single `check-price-moves` run can write a recap and two digests for one person. Pushing per row would buzz three times in a second and use up the whole cap.
- Producer schedules land at bad local hours. Holding requires something that runs later anyway.

### 7. Quiet hours: why held, not skipped

Checked against `vercel.json`, skipping pushes during quiet hours would silently drop most of them:

Local times are given as winter to summer (daylight saving time).

| cron | UTC | New York | Oslo |
|---|---|---|---|
| `check-price-moves` (recap, big moves) | 21:30 Mon-Fri | 16:30-17:30 | 22:30-23:30 |
| `check-daily-challenge-reminder` | 01:00 | 20:00-21:00 | 02:00-03:00 |
| `generate-weekly-pick` | 06:30 Mon | 01:30-02:30 | 07:30-08:30 |
| `check-earnings-upcoming`, `check-dividends-upcoming` | 08:00 | 03:00-04:00 | 09:00-10:00 |

- Holding these until 08:00 local time means US users get earnings, dividends and the Weekly Pick with their morning coffee. Norwegian users get last night's recap in the morning.
- The morning email does not cover the gap. `lib/email/alert-email.ts` leaves out Academy notifications, the portfolio recap and the person's own price alerts, and it only goes to verified users. For those kinds, a skipped push would land in the bell alone, and nobody reads the bell.
- The person's own price alerts follow quiet hours too. They're held to the morning (my call: the anti-goal says no buzzing at night, and a 22:30 alert is still worth seeing at 08:00).

### 8. Asking people

One client component, `PushPrompt`, takes a `context`.
- It shows once per context per device. The outcome is stored in `localStorage`, wrapped in try/catch because access can throw.
- After a dismissal or a "no", that context stays quiet for 30 days.
- If the browser permission is `denied`, it never renders.

What it shows depends on the platform:
- **It can subscribe** (Android, desktop, or iOS running as the installed app): a short card. The main button triggers the browser permission prompt, then subscribes.
- **iOS Safari, not installed:** the Add to Home Screen steps (Share, then Add to Home Screen). The next eligible context asks for permission once they open the installed app.
- **No push support:** nothing.

Contexts (copy is draft; final wording in the build):

| context | where | the ask |
|---|---|---|
| onboarding | `AlertsStep` | Adds a fourth row, **Learning**, "Streak reminders and new courses". It maps to `daily_challenge_reminder` + `new_course`, and `AlertChoices` gains `learning`. Under the rows: "Send these to my phone". The button is hidden on iOS Safari, so onboarding never sends anyone to the Home Screen. |
| holding | the holdings page, whenever the person has at least one holding | "Want to know when your portfolio has a big day, or one of your stocks reports?" This covers manual adds, SnapTrade sync and AI import alike. |
| lesson | after an Academy lesson completes (`LessonPlayer`, where `academy_lesson_completed` fires) | "Want a nudge before your streak runs out?" |
| alert | after a price alert is saved (`AlertDialog`, success) | "Get this alert on your phone?" |
| home | Home, once, for signed-in iOS Safari users who finished onboarding and haven't installed | The Add to Home Screen card. This is how iOS users get asked at all. |

Onboarding happens before signup.
- A subscription made at the alerts step is held with the pending-onboarding data (`lib/onboarding/pending-onboarding.ts`).
- `flushPendingOnboardingData` saves it to `push_subscriptions` once the account exists, the same way stock picks and alert choices are saved.

### 9. Measuring

**Server side** (no cookie consent needed; this is the source of truth):
- A page load with `?src=push&n=<id>` calls a server action `recordPushOpen(id)`.
  - It sets `push_opened_at` and `is_read` on that row, if the row belongs to the signed-in user.
  - Then it strips the params from the URL.
- The answer comes from SQL over:
  - `push_subscriptions`: who allowed push
  - `notifications.pushed_at` / `push_opened_at`: who received and opened pushes
  - `user_active_days`: who came back
  It is read account by account.

**PostHog** (only for people who accepted cookies; useful for the prompt funnel):
- `push_prompt_shown` and `push_prompt_answered` (context, platform, result: `granted` / `denied` / `dismissed` / `install_shown`)
- `pwa_installed`: the first standalone launch on a device

Success for David: in the two weeks after launch, some new users allow push, and those users come back on a later day while users without push still don't.

## Risks to check during the build

- **iOS Home Screen storage.** Installed web apps on iOS have historically kept cookies separate from Safari, so the person may need to sign in again inside the installed app. The cookie banner may come back there too. Check on a real iPhone.
  - If true, the install card says "You'll sign in once more".
  - A signed-out first launch lands on `/login?next=/dashboard`.
- **The streak reminder in Europe.** The reminder fires at 02:00 Oslo time, and the New York streak day ends around 06:00 Oslo time. So it expires before a Norwegian morning, and European learners get no streak push in v1. US learners get it at 20:00 to 21:00, which is right. Follow-up: a time-zone-aware reminder.
- **iOS subscriptions vanish.** Some developers report this. The 410 cleanup plus `last_sent_at` make it visible; nothing more is planned for v1.

## Left to the builder

- Exact copy, layout and motion of `PushPrompt`, within DESIGN.md. It's a quiet card, not a modal.
- The badge icon: a monochrome bull silhouette.
- iOS Safari vs standalone detection. Feature-detect where possible.
- Whether the onboarding subscription lives inside the pending-onboarding object or next to it.
- Indexes for the dispatcher query, for example a partial index on `notifications(user_id) where push_kind is not null and pushed_at is null`.
- Testing order: desktop Chrome locally, then preview on a real Android phone and David's iPhone.
  - Exercise quiet hours, the cap and combining by calling the dispatcher's pure functions from a scratch script with a fixed clock.
  - Don't use `checkRateLimit`, which the design no longer uses and which always allows everything in dev.
