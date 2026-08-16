# Instagram Setup — Automated Content Pipeline

Prerequisite steps to take on Meta's side before anything can actually post. Until these are done, the pipeline runs in dry-run mode: content still generates, renders, and stages on schedule (see `app/api/cron/instagram-earnings-weekly/route.ts`), and both the Monday auto-publish cron (`app/api/cron/instagram-earnings-publish/route.ts`) and the manual `scripts/publish-instagram.ts` print what they would have posted instead of calling the real API.

**Once these are set, publishing is automatic** — every Sunday 12:00 UTC stages next week's carousel and posts a Discord preview; every Monday 11:00 UTC publishes whatever is still `status: 'ready'`. There's no manual approval step in between, so the Sunday Discord preview is the only window to catch something wrong before it goes live (delete the row, or run the earnings-web-search step again, before Monday morning).

This uses **Business Login for Instagram** (the Instagram Platform API's Facebook-Page-free auth path), not the older Facebook Login / Graph-API-through-a-Page flow — this pipeline only ever needs to publish, never ads or Business Manager features, so there's no reason to require a linked Facebook Page.

## 1. Convert the target account to Business or Creator

In the Instagram app: Settings → Account type and tools → switch to Professional account, choose Business (or Creator). Required for the API to publish to it at all — still true under this flow, a personal account can't be used either way.

## 2. Create a Meta Developer App with the Instagram product

1. Go to [developers.facebook.com](https://developers.facebook.com) → My Apps → Create App → choose the **Business** app type.
2. Add the **Instagram** product to the app (App Dashboard → Add Product → Instagram → set up **Business Login for Instagram**, not the older Instagram Graph API product).
3. Under the Instagram product's settings, add an **OAuth redirect URI**:
   ```
   https://bullpen.no/api/instagram/oauth/callback
   ```
4. Note the app's **Instagram App ID** and **Instagram App Secret** from the same page — these become `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET`.

## 3. Add the app-level env vars

```env
INSTAGRAM_APP_ID=your-instagram-app-id
INSTAGRAM_APP_SECRET=your-instagram-app-secret
```

These are only used by `app/api/instagram/oauth/callback/route.ts` (the one-time/occasional setup exchange below) — deploy this before starting step 4, since the callback route needs it live.

## 4. Run the one-time authorization flow

While the app is in **Development mode**, it can authorize any Instagram account added as a tester/admin on the app (App Dashboard → Roles → Instagram testers) — accept that invite from the target Instagram account first.

Then visit this URL in a browser, signed into the target Instagram account (replace `INSTAGRAM_APP_ID`):

```
https://www.instagram.com/oauth/authorize
  ?client_id=INSTAGRAM_APP_ID
  &redirect_uri=https://bullpen.no/api/instagram/oauth/callback
  &response_type=code
  &scope=instagram_business_basic,instagram_business_content_publish
```

Approve the permission request. Meta redirects to the callback route above with a `code` param — the route exchanges it for a short-lived token, then a long-lived one (~60 days), and prints both values it needs you to save:

```
INSTAGRAM_ACCESS_TOKEN=...
INSTAGRAM_USER_ID=...
```

## 5. Add the publishing env vars

```env
INSTAGRAM_ACCESS_TOKEN=your-long-lived-access-token
INSTAGRAM_USER_ID=your-instagram-scoped-user-id
```

Also set `DISCORD_INSTAGRAM_WEBHOOK_URL` (Discord channel → Integrations → Webhooks → New Webhook) so the weekly review notification and publish confirmations have somewhere to land — separate from `DISCORD_CHANGELOG_WEBHOOK_URL` so Instagram doesn't mix into the changelog channel.

## 6. App Review (only needed to go fully live)

Development mode already covers publishing to any tester/admin account (step 4) — enough to run the real pipeline end-to-end. To publish without that restriction, Meta requires **App Review** approval for the `instagram_business_content_publish` permission. This is entirely on Meta's side and can take several days — submit it once the flow above is working, not as a blocker to testing.

## Token expiry

Long-lived tokens last ~60 days. There's no automated refresh job built yet (not worth it at once-a-week posting frequency) — either re-run the authorization flow in step 4, or call the refresh endpoint directly before expiry:

```
GET https://graph.instagram.com/refresh_access_token
  ?grant_type=ig_refresh_token
  &access_token=<current INSTAGRAM_ACCESS_TOKEN>
```

Put a recurring reminder on the calendar, or watch for publish failures with an auth error.

## Testing without any of the above

```bash
npm run dev
npm run trigger-instagram-earnings           # generates + stages next week's carousel, posts Discord preview if configured
# open http://localhost:3000/api/instagram/render/<postId>/0, /1, ... in a browser to see each slide
npm run instagram-publish -- --id=<postId>   # dry-runs cleanly without Meta credentials
npm run trigger-instagram-earnings-publish   # same dry-run check, but via the Monday auto-publish cron's own lookup logic
```
