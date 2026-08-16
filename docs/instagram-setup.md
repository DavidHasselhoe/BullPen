# Instagram Setup — Automated Content Pipeline

Prerequisite steps to take on Meta's side before anything can actually post. Until these are done, the pipeline runs in dry-run mode: content still generates, renders, and stages on schedule (see `app/api/cron/instagram-earnings-weekly/route.ts`), and both the Monday auto-publish cron (`app/api/cron/instagram-earnings-publish/route.ts`) and the manual `scripts/publish-instagram.ts` print what they would have posted instead of calling the real API.

**Once these are set, publishing is automatic** — every Sunday 12:00 UTC stages next week's carousel and posts a Discord preview; every Monday 11:00 UTC publishes whatever is still `status: 'ready'`. There's no manual approval step in between, so the Sunday Discord preview is the only window to catch something wrong before it goes live (delete the row, or run the earnings-web-search step again, before Monday morning).

## 1. Convert the target account to Business or Creator

In the Instagram app: Settings → Account type and tools → switch to Professional account, choose Business (or Creator). Required for the Graph API to publish to it at all.

## 2. Link a Facebook Page

The Instagram Graph API publishes through a Facebook Page connected to the Instagram account, not the Instagram account directly.

- In the Instagram app: Settings → Account → Linked accounts → Facebook, and connect (or create) a Page.
- Or from the Facebook Page's own Settings → Linked Accounts → Instagram.

## 3. Create a Meta Developer App

1. Go to [developers.facebook.com](https://developers.facebook.com) → My Apps → Create App.
2. Choose the "Business" app type.
3. Add the **Instagram Graph API** product to the app (App Dashboard → Add Product).

## 4. Get the Instagram Business Account ID

Using the [Graph API Explorer](https://developers.facebook.com/tools/explorer/) (select your app, generate a User Access Token with `pages_show_list` + `instagram_basic`):

```
GET /me/accounts
```

Find your Page in the response, note its `id`, then:

```
GET /{page-id}?fields=instagram_business_account
```

The `instagram_business_account.id` field is `INSTAGRAM_BUSINESS_ACCOUNT_ID`.

## 5. Generate a long-lived access token

1. In Graph API Explorer, generate a User Access Token with these permissions: `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`.
2. Exchange it for a long-lived token (valid ~60 days):
   ```
   GET /oauth/access_token
     ?grant_type=fb_exchange_token
     &client_id={app-id}
     &client_secret={app-secret}
     &fb_exchange_token={short-lived-token}
   ```
3. That long-lived token is `INSTAGRAM_ACCESS_TOKEN`.

**Token expiry**: long-lived tokens expire after ~60 days and need manual regeneration (repeat step 5) until an automated refresh job exists — not built in v1 given weekly posting frequency. Put a recurring reminder on the calendar, or watch for `scripts/publish-instagram.ts` failing with an auth error.

## 6. App Review (only needed to go fully live)

While the app is in **Development mode**, it can already publish to any Instagram account added as a tester/admin on the Meta App (App Dashboard → Roles) — that's enough to test the real end-to-end publish flow right now.

To publish without that restriction (i.e. the app acting on behalf of the account in production for real), Meta requires **App Review** approval for the `instagram_content_publish` permission. This is entirely on Meta's side and can take several days — submit it once the account/Page linkage above is stable, not as a blocker to testing.

## 7. Add the env vars

```env
INSTAGRAM_ACCESS_TOKEN=your-long-lived-token
INSTAGRAM_BUSINESS_ACCOUNT_ID=your-ig-business-account-id
```

Also set `DISCORD_INSTAGRAM_WEBHOOK_URL` (Discord channel → Integrations → Webhooks → New Webhook) so the weekly review notification has somewhere to land — separate from `DISCORD_CHANGELOG_WEBHOOK_URL` so Instagram reviews don't mix into the changelog channel.

## Testing without any of the above

```bash
npm run dev
npm run trigger-instagram-earnings   # generates + stages next week's carousel, posts Discord preview if configured
# open http://localhost:3000/api/instagram/render/<postId>/0, /1, ... in a browser to see each slide
npm run instagram-publish -- --id=<postId>   # dry-runs cleanly without Meta credentials
```
