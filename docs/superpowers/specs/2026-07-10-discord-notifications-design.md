# Discord Notifications — Design

## Purpose

The user wants a community Discord server (public channels for suggestions/chat, plus a private admin-only category) with two automated feeds into the private side: Vercel production deployment status, and a summary of each session's changelog entry. This spec covers only the automated-notification pieces — the Discord server itself (channels, roles, permissions) is set up manually by the user, not by this codebase.

## Current state (confirmed by investigation)

- **No Vercel Marketplace integration exists for Discord.** Searched the Marketplace (screenshot confirmed): zero results under both "Native Integrations" and "External Integrations." A native Slack integration exists ("Get Slack messages for comments, deployment status, and new projects on Vercel") but targets Slack, not Discord. Notification-infrastructure platforms (Knock, Novu) are also listed but are unrelated heavyweight services (route app-level notifications across many channels) — evaluated and rejected as overkill for relaying two webhook event types to one Discord channel.
- **The user's existing Discord "Vercel Connect" OAuth connector (`discord.com/violet-plank`) is the wrong tool** — it's a user-login OAuth connector (`Subject Types: user`, authorize/token endpoints), built for "sign in as a specific Discord user," not for posting automated bot messages. Not used by this design.
- **`app/api/billing/webhook/route.ts`** (Stripe) is the existing precedent for a signature-verified inbound webhook route in this codebase: raw body via `request.text()`, `runtime = 'nodejs'` + `dynamic = 'force-dynamic'`, three-tier error handling (config missing → 500, bad signature → 400/403, downstream handler error → 500 so the sender retries), unhandled event types fall through and get acknowledged with 200.
- **No `.env.example` exists.** Env var conventions are documented in `CLAUDE.md`'s "Environment variables" section and `ENV_SETUP.md`, and read via `process.env.X` directly at point of use — no centralized config module (confirmed: `STRIPE_WEBHOOK_SECRET`, `CRON_SECRET`, `RESEND_API_KEY` all follow this).
- **Rate limiting (`withRateLimit`) is for browser-originated, user-facing routes** — scoped by client IP. Machine-called routes (every `app/api/cron/*` route, and the Stripe webhook) instead gate on a shared secret or cryptographic signature as the sole access control, with no IP rate limiting. The new Vercel deploy webhook route follows this same pattern.
- **`content/changelog.json`** shape: `Array<{ date: string; entries: Array<{ type: 'new'|'improved'|'fixed'; text: string }> }>`, newest date-group first, read via plain `fs.readFileSync` in `app/changelog/page.tsx` — no DB, no API layer. **Written manually by Claude once per session**, per CLAUDE.md's End Session Protocol step 3 (git-log diffing since the last changelog-touching commit, then a hand-written entry, committed directly to `preview`). No script, cron, or CI currently watches this file for changes.
- **`lib/email/resend.ts`** + its call site in `app/api/contact/route.ts` is the precedent for "post to an external service" helpers in this codebase: the helper itself throws on failure (doesn't swallow errors), and the *caller* decides fire-and-forget (`.catch(err => console.error(...))`) vs. propagating the failure. This is the model for the new Discord-posting helper.
- **Vercel webhook signature verification** (confirmed against live Vercel docs, current as of this session): HMAC-SHA1 over the raw request body, secret from `process.env`, header `x-vercel-signature`, compared with `crypto.timingSafeEqual` for constant-time comparison — this is Vercel's own currently-recommended snippet, an improvement over blindly copying the Stripe SDK's higher-level `constructEvent` (which is Stripe-specific).
- **Deployment webhook event types** (confirmed against live Vercel docs): `deployment.succeeded` explicitly **requires registered Checks**, which this project doesn't use — so the correct "build finished and is live" signal is **`deployment.ready`**, not `deployment.succeeded`. `deployment.error` fires on build failure. Production vs. preview is distinguished by `payload.target` (`"production"`, `"staging"`, or `null` — filter for exactly `"production"`). `payload.deployment.meta` carries git commit info as a key/value map (field names like `githubCommitMessage`, `githubCommitRef` were directly observed in this session's own `list_deployments` MCP output against this same Vercel project).

## Scope decisions (confirmed with user)

- **Separate Discord channels** for deploy notifications vs. changelog posts (two separate incoming webhook URLs) — keeps frequent technical deploy pings from burying the occasional changelog summary.
- **Production deploys only**, and only the two terminal states: success (`deployment.ready`) and failure (`deployment.error`). Preview deploys and in-progress/building events are silently ignored.
- **Changelog poster fires as an added manual step in CLAUDE.md's End Session Protocol** — no new file-watcher, no CI workflow. This matches how the changelog itself already only changes via that same manual, once-per-session process.
- **Rich Discord embeds**, not plain text — green-accented for a successful deploy, red for a failed one, BullPen-branded for changelog posts.
- **Custom webhook relay**, not any Vercel Marketplace integration — Slack (wrong platform), Knock/Novu (unrelated, heavyweight for this scope) were evaluated and rejected.

## Architecture

```
Vercel (production deploy)          content/changelog.json
        │  signed POST                       │  (edited manually,
        ▼                                     │   End Session Protocol)
app/api/webhooks/vercel-deploy/route.ts       ▼
        │                            scripts/post-changelog-discord.ts
        │  postToDiscord(...)                 │  postToDiscord(...)
        ▼                                     ▼
lib/discord/post-message.ts  ──────────────────
        │                              │
        ▼                              ▼
DISCORD_DEPLOY_WEBHOOK_URL      DISCORD_CHANGELOG_WEBHOOK_URL
   (#deployments channel)          (#updates channel)
```

## Components

### `lib/discord/post-message.ts` (shared helper)

```ts
export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number; // decimal RGB, e.g. 0x22c55e for green
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text: string };
  timestamp?: string; // ISO 8601
}

export async function postToDiscord(
  webhookUrl: string,
  payload: { content?: string; embeds?: DiscordEmbed[] }
): Promise<void>
```

Plain `fetch(webhookUrl, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) })`. Throws (with the response status/body in the message) on a non-2xx response. No new dependency — Discord incoming webhooks are a documented JSON POST API, no SDK needed.

### `app/api/webhooks/vercel-deploy/route.ts`

- `export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';` (raw-body access, matching the Stripe route).
- Reads the raw body via `request.text()`, verifies `x-vercel-signature` via `crypto.createHmac('sha1', process.env.VERCEL_WEBHOOK_SECRET).update(rawBody).digest('hex')` compared with `crypto.timingSafeEqual`.
- Missing/invalid signature → `403`.
- Parses the verified body as JSON: top-level shape is `{ id, type, createdAt, payload, region }`.
- If `type` is not `deployment.ready` or `deployment.error`, or `payload.target !== 'production'` → `200 { received: true, skipped: true }` (acknowledged, ignored — no Discord post).
- Otherwise builds one `DiscordEmbed`:
  - `deployment.ready`: green (`0x22c55e`), title `"✅ Production deploy succeeded"`, description from `payload.deployment.meta.githubCommitMessage` (fallback: `payload.deployment.url`), a field linking to `payload.links.deployment`.
  - `deployment.error`: red (`0xef4444`), title `"❌ Production deploy failed"`, same description/link fields.
  - Footer: project name from `payload.deployment.name`. Timestamp: `new Date(json.createdAt).toISOString()`.
- Awaits `postToDiscord(process.env.DISCORD_DEPLOY_WEBHOOK_URL!, { embeds: [embed] })`. If it throws, catches, logs, and returns `500`. Note: unlike the Stripe precedent, this isn't confirmed to trigger a Vercel-side redelivery (the docs fetched for this spec didn't establish a retry policy for deployment webhooks) — the 500 is returned primarily so a failed delivery is visible in Vercel's own webhook delivery log for manual investigation, not as a guaranteed retry mechanism.
- Success → `200 { received: true }`.

### `scripts/post-changelog-discord.ts`

Modeled on `scripts/test-resend.ts` (dotenv-loaded `tsx` script, not a test — a one-shot action script, same as e.g. `scripts/backfill-logos.ts`):
- Reads `content/changelog.json`, takes `entries[0]` (the newest date-group — the array is already newest-first by convention).
- Builds one embed: title `"📦 BullPen updates — <date>"`, description built from the entries (one line per entry, prefixed `🆕`/`⚡`/`🐛` for `new`/`improved`/`fixed`), a field linking to `https://bullpen.no/changelog`, blue accent color (`0x3b82f6`).
- Calls `postToDiscord(process.env.DISCORD_CHANGELOG_WEBHOOK_URL!, { embeds: [embed] })`, lets it throw (script exits non-zero on failure — matches `test-resend.ts`'s throwing style since this is a manually-run script, not a fire-and-forget server code path).
- New `package.json` script: `"post-changelog-discord": "tsx scripts/post-changelog-discord.ts"`.

### CLAUDE.md changes

One new line appended to the End Session Protocol's step 3 ("Generate changelog entry"): after committing the changelog change, run `npm run post-changelog-discord` to announce it.

New env vars documented in CLAUDE.md's "Environment variables" section and `ENV_SETUP.md`, alongside the existing optional vars: `DISCORD_DEPLOY_WEBHOOK_URL`, `DISCORD_CHANGELOG_WEBHOOK_URL`, `VERCEL_WEBHOOK_SECRET`.

## Manual setup (user does these — not part of the implementation plan)

1. Build the Discord server structure: public `#suggestions`/`#chat` channels, a private "Admin" category visible only to a role the user holds.
2. Create two Discord incoming webhooks (channel Settings → Integrations → Webhooks → New Webhook) — one in the deploy-status channel, one in the changelog/updates channel. Copy both URLs.
3. Add `DISCORD_DEPLOY_WEBHOOK_URL`, `DISCORD_CHANGELOG_WEBHOOK_URL`, `VERCEL_WEBHOOK_SECRET` to Vercel's env vars (Production + Preview) and to `.env.local` for local testing.
4. In Vercel: Project Settings → Webhooks → create a webhook pointed at `https://bullpen.no/api/webhooks/vercel-deploy`, subscribed to `deployment.ready` and `deployment.error`, scoped to the `bullpen` project. Copy the generated signing secret into `VERCEL_WEBHOOK_SECRET`.

## Out of scope

- Preview-deployment notifications, `deployment.promoted`/`deployment.rollback` events, or any event type beyond `deployment.ready`/`deployment.error`.
- Any Slack, Knock, or Novu integration.
- Automated/CI-based watching of `content/changelog.json` for changes — the trigger is the manual End Session Protocol step only.
- Any change to how `content/changelog.json` itself is authored.
- Discord server/role/channel setup itself (manual, outside this codebase).
- Retrying or queuing failed Discord posts beyond what Vercel's own webhook-delivery retry provides for Part A, and beyond the script simply failing loudly for Part B (a human re-runs it).
