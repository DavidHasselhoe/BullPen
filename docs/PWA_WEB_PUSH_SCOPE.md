# PWA + web push: scope

Status: scoped 2026-10-29, not started. Pick up and decide the open questions first.

## Why this, and why before a store app

- 31 accounts, 3 active in the last 7 days, 0 paying, no new user has come back on day 2.
- Everyone at the onboarding alerts step turns on price, earnings and dividend alerts, but those land only as in-app notifications (0 of 14 ever read one) plus the 08:30 morning email for verified users.
- Push is the main thing a native app would add. Web push gets it for ~$0: Android Chrome and desktop browsers without installing, iOS/iPadOS 16.4+ once the site is added to the Home Screen.
- It is also the test for the native app decision: if push brings people back, that is the case for an App Store build (see the evaluation in the roadmap memory). If nobody installs or allows it, we saved months.

## What exists today

- No web app manifest, no service worker, no push code. `public/` has `icon-dark.png` / `icon-light.png` only.
- `lib/notifications/notifications-db.ts` `createNotification()` is the main write path (~23 callers). Three bulk inserts bypass it in `lib/notifications/notification-creators.ts` (lines ~551 Academy course, ~941 economic events, ~1085 index membership).
- Per-type opt-outs live in `users.settings.notifications` (`isNotificationEnabled()`), master email switch `email_alerts` (`SettingsModal.tsx`, `lib/email/alert-email.ts`). Push gets the same shape: a `push_alerts` key.
- Notification text: `params` holds i18n keys the client words; `title`/`message` are the English fallback. Push uses the English fallback for now, same as the morning email (no non-English accounts yet).
- CSP (`next.config.ts`): no `worker-src`, so it falls back to `script-src 'self'`, which allows `/sw.js`. No change needed.
- `middleware.ts` matcher runs on `/sw.js` (`.js` is not in its exclusion list). Add `sw.js|manifest.webmanifest` to the exclusion so the browser's update checks don't cost middleware CPU.

## Build (Next 16 guide: `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md`)

1. **Manifest** `app/manifest.ts`: name, short_name, `display: standalone`, start_url `/dashboard`, theme/background colours from DESIGN.md, 192/512 PNG icons + a maskable one (need to export from the bull mark), `apple-touch-icon` in layout metadata. Makes the site installable; on iOS it is what "Add to Home Screen" uses.
2. **Service worker** `public/sw.js`: `push` -> `showNotification(title, { body, icon, badge, data: { url } })`; `notificationclick` -> focus an open tab or open `url` with `?src=push`. No offline caching (YAGNI, and stale market data is worse than an error). Headers for `/sw.js` in `next.config.ts`: `Cache-Control: no-cache`, per the guide.
3. **Table** `push_subscriptions` (new migration): `id`, `user_id` FK, `endpoint` unique, `p256dh`, `auth`, `user_agent`, `created_at`, `last_sent_at`. RLS: users insert/delete their own rows. One user can have several devices.
4. **Subscribe/unsubscribe** server actions (in `app/actions/notifications.ts`), auth via `getUser()`, rate limited.
5. **Send** with the `web-push` package (new dependency; VAPID signing + payload encryption is not something to hand-roll). One helper `pushToUsers(userIds, payload)` in `lib/notifications/push.ts`:
   - skips users with `push_alerts === false` or the type opted out,
   - deletes subscriptions that return 404/410,
   - fire-and-forget, never blocks or fails the notification write.
   Call it from `createNotification()` and the three bulk inserts. (Alternative: a Supabase DB webhook on `notifications` insert catches every future path in one place, but the bulk inserts would fire one webhook per row. Helper is simpler at this size.)
6. **Ask for permission at the right moment, never on first load.**
   - Android/desktop: at the onboarding alerts step (where people already say yes to alerts), and a "Get these on your phone" button on `/notifications` and in Settings > Notifications.
   - iOS Safari (not installed): the same spots show a short "Add BullPen to your Home Screen" sheet (Share, then Add to Home Screen), because iOS only allows push from the installed app. Once opened standalone, ask for permission.
7. **Settings**: `push_alerts` toggle next to `email_alerts` in `SettingsModal.tsx`, shown only when the browser supports push. New strings go through i18n (no em dashes in copy).
8. **Measurement** (PostHog, after consent like everything else): `pwa_installed` (first standalone launch), `push_permission` (granted/denied/dismissed, platform), `push_sent` server-side count in the producers' cron JSON, `push_opened` from `?src=push`. The question to answer: do users with push return on day 2/7 more than those without?

Env vars: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:contact@bullpeninvest.com`). Add to `docs/agent/environment.md` and Vercel.

## Cost

- Money: $0. `web-push` is free, APNs/FCM web push endpoints are free, Vercel invocations are a handful per notification.
- Time (estimate): 3 to 5 days including the install sheet, settings, migration, i18n and testing on a real iPhone + Android.
- Upkeep: small. Subscriptions expire or get revoked; the 410 cleanup handles that. iOS push subscriptions are reported to vanish now and then, so `last_sent_at` lets us see it.

## Open questions for David

1. **Which types push by default?** Suggestion: user price alerts, big moves on holdings/watchlist (digest, not one per stock), earnings today, Weekly Pick, Daily Brief ready (Pro). Leave Academy, index changes, 13F, politician trades in-app only unless the user turns them on.
2. **Quiet hours**: no push between 22:00 and 07:00 in the user's display time zone, held until morning? Or just let crons run when they run (most fire in US market hours, which is evening in Norway).
3. **Push vs the morning email**: if someone gets push, do they still get the 08:30 email? Suggestion: yes for now, measure, then decide.
4. **Install sheet placement on iOS**: onboarding alerts step only, or also a dismissible one-time banner on Home for signed-in Mobile Safari users?
5. **Icons**: export a maskable PNG from the bull mark ourselves, or include it in the designer commission? (Ourselves is fine for v1.)
6. Privacy policy: Termly should mention push subscriptions (endpoint + device). David edits Termly.

## Not doing (until the data says so)

Offline mode, background sync, home-screen widgets (native only), Capacitor/App Store builds, translated push text.
