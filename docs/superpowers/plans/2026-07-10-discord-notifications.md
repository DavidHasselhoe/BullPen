# Discord Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Relay Vercel production deployment status and changelog updates to two separate Discord channels via incoming webhooks.

**Architecture:** A shared `postToDiscord()` helper (modeled on `lib/email/resend.ts`) is called from two independent places: a new signature-verified API route that receives Vercel's deployment webhooks (modeled on `app/api/billing/webhook/route.ts`), and a new one-off script that posts the newest `content/changelog.json` entry, run manually as part of CLAUDE.md's End Session Protocol.

**Tech Stack:** Next.js App Router route handlers, Node's built-in `crypto` (HMAC-SHA1), plain `fetch` (no new dependency — Discord incoming webhooks are a documented JSON POST API).

## Global Constraints

- Two separate Discord webhook URLs (`DISCORD_DEPLOY_WEBHOOK_URL`, `DISCORD_CHANGELOG_WEBHOOK_URL`) — never combine into one.
- Only `deployment.ready` (build succeeded and live — **not** `deployment.succeeded`, which requires registered Checks this project doesn't use) and `deployment.error` trigger a Discord post, and only when `payload.target === 'production'`. Preview deploys and all other event types are acknowledged with `200` and silently skipped.
- Changelog posting is triggered manually (`npm run post-changelog-discord`, added as a step in CLAUDE.md's End Session Protocol) — no file watcher, no CI workflow.
- Messages are rich Discord embeds (title/description/color/fields), not plain text.
- No new npm dependency — Discord webhooks and Vercel's HMAC-SHA1 signature scheme are both implementable with `fetch` and Node's `crypto`.
- Env vars are read via `process.env.X` directly at point of use (no centralized config module) — matches every existing secret in this codebase.

---

### Task 1: Shared Discord posting helper

**Files:**
- Create: `lib/discord/post-message.ts`
- Create: `scripts/test-discord-webhook.ts`
- Modify: `package.json` (add one script entry)

**Interfaces:**
- Produces: `postToDiscord(webhookUrl: string, message: { content?: string; embeds?: DiscordEmbed[] }): Promise<void>` and the exported `DiscordEmbed` type — used by Task 2 and Task 3.

- [ ] **Step 1: Write the helper**

```ts
// lib/discord/post-message.ts
/**
 * Discord incoming-webhook client for BullPen.
 *
 * Posts to a Discord "Incoming Webhook" URL (created in a channel's
 * Integrations → Webhooks settings) — no OAuth, no bot token, just a POST.
 */

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number; // decimal RGB, e.g. 0x22c55e for green
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text: string };
  timestamp?: string; // ISO 8601
}

export interface DiscordMessage {
  content?: string;
  embeds?: DiscordEmbed[];
}

/**
 * Post a message to a Discord incoming webhook. Throws on a non-2xx response —
 * callers decide whether to await (propagate failure) or fire-and-forget with
 * a .catch(), matching how lib/email/resend.ts's sendEmail() is used.
 */
export async function postToDiscord(webhookUrl: string, message: DiscordMessage): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Discord webhook post failed: ${res.status} ${body}`);
  }
}
```

- [ ] **Step 2: Ask the user for the two Discord webhook URLs, and add them to `.env.local`**

This step needs real values from the user — do not fabricate them. Ask:

> "I need two Discord incoming webhook URLs to test this: one for the deploy-status channel, one for the changelog channel. In Discord: channel Settings → Integrations → Webhooks → New Webhook → Copy Webhook URL. Can you paste both?"

Once provided, add these two lines to `.env.local` (create the file if it doesn't exist; it's gitignored):

```env
DISCORD_DEPLOY_WEBHOOK_URL=<paste the deploy-channel webhook URL>
DISCORD_CHANGELOG_WEBHOOK_URL=<paste the changelog-channel webhook URL>
```

- [ ] **Step 3: Write the verification script**

```ts
// scripts/test-discord-webhook.ts
/**
 * Test Discord webhook posting.
 *
 * Usage: npm run test-discord-webhook -- deploy
 *        npm run test-discord-webhook -- changelog
 *
 * Ensure DISCORD_DEPLOY_WEBHOOK_URL / DISCORD_CHANGELOG_WEBHOOK_URL is set in .env.local
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { postToDiscord } from '../lib/discord/post-message';

async function main() {
  const which = process.argv[2] === 'changelog' ? 'changelog' : 'deploy';
  const envVar = which === 'changelog' ? 'DISCORD_CHANGELOG_WEBHOOK_URL' : 'DISCORD_DEPLOY_WEBHOOK_URL';
  const webhookUrl = process.env[envVar];

  if (!webhookUrl) {
    console.error(`Set ${envVar} in .env.local first.`);
    process.exit(1);
  }

  try {
    await postToDiscord(webhookUrl, {
      embeds: [
        {
          title: '✅ Test message from BullPen',
          description: `This is a test post to the ${which} channel.`,
          color: 0x3b82f6,
          timestamp: new Date().toISOString(),
        },
      ],
    });
    console.log(`Posted test message to the ${which} webhook — check Discord.`);
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
```

- [ ] **Step 4: Add the package.json script**

In `package.json`, inside `"scripts"`, add (matching the existing `"test-resend": "tsx scripts/test-resend.ts"` line style):

```json
"test-discord-webhook": "tsx scripts/test-discord-webhook.ts",
```

- [ ] **Step 5: Run the verification script for both channels**

Run: `npm run test-discord-webhook -- deploy`
Expected: `Posted test message to the deploy webhook — check Discord.` — then confirm with the user that the message actually appeared in the deploy channel.

Run: `npm run test-discord-webhook -- changelog`
Expected: `Posted test message to the changelog webhook — check Discord.` — then confirm with the user that the message actually appeared in the changelog channel.

If either fails with a non-2xx error, the most likely cause is a stale/incorrect webhook URL — ask the user to re-copy it from Discord.

- [ ] **Step 6: Lint**

Run: `npx eslint lib/discord/post-message.ts scripts/test-discord-webhook.ts`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/discord/post-message.ts scripts/test-discord-webhook.ts package.json
git commit -m "feat(discord): add postToDiscord helper and webhook test script"
git push origin preview
```

---

### Task 2: Vercel deployment webhook receiver

**Files:**
- Create: `app/api/webhooks/vercel-deploy/route.ts`
- Create: `scripts/test-vercel-deploy-webhook.ts`

**Interfaces:**
- Consumes: `postToDiscord`, `DiscordEmbed` from `lib/discord/post-message.ts` (Task 1).
- Produces: `POST /api/webhooks/vercel-deploy` — no other task depends on this route's internals.

- [ ] **Step 1: Write the route**

```ts
// app/api/webhooks/vercel-deploy/route.ts
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { postToDiscord, type DiscordEmbed } from '@/lib/discord/post-message';

// Vercel needs the raw request body to verify the signature — never cache/parse.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface VercelWebhookPayload {
  id: string;
  type: string;
  createdAt: number;
  payload: {
    target?: string | null;
    deployment?: {
      id?: string;
      url?: string;
      name?: string;
      meta?: Record<string, string>;
    };
    links?: {
      deployment?: string;
      project?: string;
    };
  };
}

/**
 * POST /api/webhooks/vercel-deploy
 *
 * Vercel → BullPen. Verifies the signature, then relays production
 * deployment.ready / deployment.error events to a Discord channel.
 *
 * Register this endpoint in Vercel (Project Settings → Webhooks), subscribed
 * to deployment.ready and deployment.error, and put the signing secret in
 * VERCEL_WEBHOOK_SECRET.
 */
export async function POST(request: NextRequest) {
  const webhookSecret = process.env.VERCEL_WEBHOOK_SECRET;
  const deployWebhookUrl = process.env.DISCORD_DEPLOY_WEBHOOK_URL;
  if (!webhookSecret || !deployWebhookUrl) {
    return NextResponse.json({ error: 'discord_deploy_webhook_not_configured' }, { status: 500 });
  }

  const signature = request.headers.get('x-vercel-signature');
  if (!signature) {
    return NextResponse.json({ error: 'missing_signature' }, { status: 400 });
  }

  const rawBody = await request.text();
  const expectedSignature = crypto
    .createHmac('sha1', webhookSecret)
    .update(rawBody)
    .digest('hex');

  const signatureValid =
    signature.length === expectedSignature.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));

  if (!signatureValid) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 403 });
  }

  let event: VercelWebhookPayload;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const isDeploySuccess = event.type === 'deployment.ready';
  const isDeployFailure = event.type === 'deployment.error';
  const isProduction = event.payload?.target === 'production';

  if ((!isDeploySuccess && !isDeployFailure) || !isProduction) {
    return NextResponse.json({ received: true, skipped: true });
  }

  const deployment = event.payload.deployment ?? {};
  const commitMessage = deployment.meta?.githubCommitMessage ?? deployment.url ?? 'No commit message available';
  const dashboardUrl = event.payload.links?.deployment ?? `https://${deployment.url ?? ''}`;

  const embed: DiscordEmbed = isDeploySuccess
    ? {
        title: '✅ Production deploy succeeded',
        description: commitMessage,
        color: 0x22c55e,
        fields: [{ name: 'Deployment', value: dashboardUrl }],
        footer: { text: deployment.name ?? 'bullpen' },
        timestamp: new Date(event.createdAt).toISOString(),
      }
    : {
        title: '❌ Production deploy failed',
        description: commitMessage,
        color: 0xef4444,
        fields: [{ name: 'Deployment', value: dashboardUrl }],
        footer: { text: deployment.name ?? 'bullpen' },
        timestamp: new Date(event.createdAt).toISOString(),
      };

  try {
    await postToDiscord(deployWebhookUrl, { embeds: [embed] });
  } catch (err) {
    // Logged for visibility in Vercel's function logs — not confirmed to trigger
    // a Vercel-side redelivery; see docs/superpowers/specs/2026-07-10-discord-notifications-design.md.
    console.error('[vercel-deploy webhook] Discord post failed:', err);
    return NextResponse.json({ error: 'discord_post_failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
```

- [ ] **Step 2: Add a local test secret**

This route's signature check can be fully verified locally without the real Vercel-issued secret — any string works, as long as the test script (Step 3) signs with the same value. Add to `.env.local`:

```env
VERCEL_WEBHOOK_SECRET=local-test-secret-do-not-use-in-production
```

- [ ] **Step 3: Write the verification script**

```ts
// scripts/test-vercel-deploy-webhook.ts
/**
 * Simulates Vercel deployment webhooks against the local dev server to verify:
 *  1. An invalid signature is rejected (403).
 *  2. A valid signature on a non-production deploy is acknowledged but skipped.
 *  3. A valid signature on a production deployment.ready posts to Discord.
 *
 * Usage: npm run dev (in another terminal), then npm run test-vercel-deploy-webhook
 * Ensure VERCEL_WEBHOOK_SECRET and DISCORD_DEPLOY_WEBHOOK_URL are set in .env.local
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import crypto from 'crypto';

const URL = 'http://localhost:3000/api/webhooks/vercel-deploy';

function buildPayload(overrides: { type: string; target: string | null }) {
  return JSON.stringify({
    id: 'evt_test123',
    type: overrides.type,
    createdAt: Date.now(),
    payload: {
      target: overrides.target,
      deployment: {
        id: 'dpl_test123',
        url: 'bullpen-test123.vercel.app',
        name: 'bullpen',
        meta: { githubCommitMessage: 'test: verify Discord deploy webhook relay' },
      },
      links: { deployment: 'https://vercel.com/test/bullpen/dpl_test123' },
    },
  });
}

function sign(body: string, secret: string): string {
  return crypto.createHmac('sha1', secret).update(body).digest('hex');
}

async function post(body: string, signature: string) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-vercel-signature': signature },
    body,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function main() {
  const secret = process.env.VERCEL_WEBHOOK_SECRET;
  if (!secret) {
    console.error('Set VERCEL_WEBHOOK_SECRET in .env.local first.');
    process.exit(1);
  }

  console.log('1) Invalid signature — expect 403...');
  const badBody = buildPayload({ type: 'deployment.ready', target: 'production' });
  const badResult = await post(badBody, 'deadbeef00000000000000000000000000000000');
  console.log('  →', badResult.status, badResult.json);
  if (badResult.status !== 403) {
    console.error('  ❌ FAIL — expected 403');
    process.exit(1);
  }

  console.log('2) Valid signature, non-production target — expect 200 skipped:true...');
  const previewBody = buildPayload({ type: 'deployment.ready', target: 'staging' });
  const previewResult = await post(previewBody, sign(previewBody, secret));
  console.log('  →', previewResult.status, previewResult.json);
  if (previewResult.status !== 200 || previewResult.json?.skipped !== true) {
    console.error('  ❌ FAIL — expected 200 with skipped:true');
    process.exit(1);
  }

  console.log('3) Valid signature, production deployment.ready — expect 200, and a Discord post...');
  const prodBody = buildPayload({ type: 'deployment.ready', target: 'production' });
  const prodResult = await post(prodBody, sign(prodBody, secret));
  console.log('  →', prodResult.status, prodResult.json);
  if (prodResult.status !== 200 || prodResult.json?.received !== true) {
    console.error('  ❌ FAIL — expected 200 with received:true');
    process.exit(1);
  }

  console.log('\n✅ All response checks passed. Now check Discord — a green "Production deploy succeeded" embed with the test commit message should have appeared in the deploy channel.');
}

main();
```

- [ ] **Step 4: Add the package.json script**

```json
"test-vercel-deploy-webhook": "tsx scripts/test-vercel-deploy-webhook.ts",
```

- [ ] **Step 5: Run the dev server and the verification script**

Run: `npm run dev` (leave running in the background)

Run: `npm run test-vercel-deploy-webhook`

Expected: all three checks print, ending with:
```
✅ All response checks passed. Now check Discord — a green "Production deploy succeeded" embed with the test commit message should have appeared in the deploy channel.
```

Confirm with the user that the embed actually appeared in the deploy channel, styled green with the test commit message "test: verify Discord deploy webhook relay."

- [ ] **Step 6: Lint**

Run: `npx eslint "app/api/webhooks/vercel-deploy/route.ts" scripts/test-vercel-deploy-webhook.ts`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add "app/api/webhooks/vercel-deploy/route.ts" scripts/test-vercel-deploy-webhook.ts package.json
git commit -m "feat(discord): add Vercel deployment webhook receiver"
git push origin preview
```

---

### Task 3: Changelog Discord poster

**Files:**
- Create: `scripts/post-changelog-discord.ts`
- Modify: `package.json` (add one script entry)

**Interfaces:**
- Consumes: `postToDiscord`, `DiscordEmbed` from `lib/discord/post-message.ts` (Task 1); reads `content/changelog.json` directly (no shared type import needed — the shape is small enough to redeclare locally, matching how `app/changelog/page.tsx` also declares its own local types rather than importing from a shared module).

- [ ] **Step 1: Write the script**

```ts
// scripts/post-changelog-discord.ts
/**
 * Post the newest changelog entry to Discord.
 *
 * Usage: npm run post-changelog-discord
 * Run this after committing a new content/changelog.json entry — see
 * CLAUDE.md's End Session Protocol, step 3.
 *
 * Ensure DISCORD_CHANGELOG_WEBHOOK_URL is set in .env.local
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { readFileSync } from 'fs';
import { join } from 'path';
import { postToDiscord, type DiscordEmbed } from '../lib/discord/post-message';

type ChangelogEntryType = 'new' | 'improved' | 'fixed';
interface ChangelogEntry {
  type: ChangelogEntryType;
  text: string;
}
interface ChangelogDateGroup {
  date: string;
  entries: ChangelogEntry[];
}

const TYPE_EMOJI: Record<ChangelogEntryType, string> = {
  new: '🆕',
  improved: '⚡',
  fixed: '🐛',
};

async function main() {
  const webhookUrl = process.env.DISCORD_CHANGELOG_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error('Set DISCORD_CHANGELOG_WEBHOOK_URL in .env.local first.');
    process.exit(1);
  }

  const changelogPath = join(process.cwd(), 'content', 'changelog.json');
  const changelog = JSON.parse(readFileSync(changelogPath, 'utf-8')) as ChangelogDateGroup[];

  if (changelog.length === 0) {
    console.error('content/changelog.json is empty — nothing to post.');
    process.exit(1);
  }

  const latest = changelog[0];
  const description = latest.entries.map((e) => `${TYPE_EMOJI[e.type]} ${e.text}`).join('\n');

  const embed: DiscordEmbed = {
    title: `📦 BullPen updates — ${latest.date}`,
    description,
    color: 0x3b82f6,
    fields: [{ name: 'Full changelog', value: 'https://bullpen.no/changelog' }],
    timestamp: new Date().toISOString(),
  };

  await postToDiscord(webhookUrl, { embeds: [embed] });
  console.log(`Posted ${latest.entries.length} entries from ${latest.date} to Discord.`);
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
```

- [ ] **Step 2: Add the package.json script**

```json
"post-changelog-discord": "tsx scripts/post-changelog-discord.ts",
```

- [ ] **Step 3: Run it for real**

This posts the actual current newest entry (`2026-07-08`, 6 items) from `content/changelog.json` to the real changelog channel — this is intentional, not a mock: it both verifies the script and bootstraps the channel with the latest real update.

Run: `npm run post-changelog-discord`
Expected: `Posted 6 entries from 2026-07-08 to Discord.`

Confirm with the user that a blue-accented embed titled "📦 BullPen updates — 2026-07-08" with all 6 emoji-prefixed lines appeared in the changelog channel.

- [ ] **Step 4: Lint**

Run: `npx eslint scripts/post-changelog-discord.ts`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add scripts/post-changelog-discord.ts package.json
git commit -m "feat(discord): add changelog-to-Discord poster script"
git push origin preview
```

---

### Task 4: Documentation — CLAUDE.md and ENV_SETUP.md

**Files:**
- Modify: `CLAUDE.md:58` (End Session Protocol step 3)
- Modify: `CLAUDE.md:356` (Environment variables section)
- Modify: `ENV_SETUP.md` (add a new env var block)

**Interfaces:** None — documentation only, no code depends on this task.

- [ ] **Step 1: Update the End Session Protocol**

In `CLAUDE.md`, find this exact line (step 3 of the End Session Protocol):

```
**3. Generate changelog entry**
Find the last commit that touched the changelog with `git log -1 --format=%H -- content/changelog.json`, then run `git log <that commit>..HEAD --oneline` on `preview` to see everything shipped since. If there's user-facing material in that range — new features, meaningful UX/behavior changes, user-noticeable bug fixes — write one entry dated with today's date to `content/changelog.json` (newest entry first in the array). Use plain, non-technical language: no file paths, no commit/ticket references, no jargon. Each item's `type` is exactly one of `"new" | "improved" | "fixed"`. Exclude pure internal refactors, perf/RLS-only commits, dependency bumps, and doc/CLAUDE.md-only changes. If nothing in the range qualifies, skip this step silently — do not add an empty or filler entry. Commit the change to `preview` before continuing.
```

Replace with (one sentence appended at the end):

```
**3. Generate changelog entry**
Find the last commit that touched the changelog with `git log -1 --format=%H -- content/changelog.json`, then run `git log <that commit>..HEAD --oneline` on `preview` to see everything shipped since. If there's user-facing material in that range — new features, meaningful UX/behavior changes, user-noticeable bug fixes — write one entry dated with today's date to `content/changelog.json` (newest entry first in the array). Use plain, non-technical language: no file paths, no commit/ticket references, no jargon. Each item's `type` is exactly one of `"new" | "improved" | "fixed"`. Exclude pure internal refactors, perf/RLS-only commits, dependency bumps, and doc/CLAUDE.md-only changes. If nothing in the range qualifies, skip this step silently — do not add an empty or filler entry. Commit the change to `preview` before continuing. If an entry was added, run `npm run post-changelog-discord` to announce it in Discord.
```

- [ ] **Step 2: Add the new env vars to CLAUDE.md's Environment variables section**

Find this exact line:

```
Optional but used in production: `FINNHUB_API_KEY`, `RESEND_API_KEY`, `CRON_SECRET`, `LOGO_DEV_KEY`, `NEXT_PUBLIC_APP_URL`, `ANTHROPIC_API_KEY` (Why Today? + Daily Brief), `SNAPTRADE_CLIENT_ID`, `SNAPTRADE_CONSUMER_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.
```

Replace with:

```
Optional but used in production: `FINNHUB_API_KEY`, `RESEND_API_KEY`, `CRON_SECRET`, `LOGO_DEV_KEY`, `NEXT_PUBLIC_APP_URL`, `ANTHROPIC_API_KEY` (Why Today? + Daily Brief), `SNAPTRADE_CLIENT_ID`, `SNAPTRADE_CONSUMER_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `DISCORD_DEPLOY_WEBHOOK_URL` / `DISCORD_CHANGELOG_WEBHOOK_URL` / `VERCEL_WEBHOOK_SECRET` (Discord notifications — see `app/api/webhooks/vercel-deploy/route.ts` and `scripts/post-changelog-discord.ts`).
```

- [ ] **Step 3: Add a new section to ENV_SETUP.md**

In `ENV_SETUP.md`, find this exact block (right after the Logo.dev section, before "Optional: override default sender"):

```
# Logo.dev (required for company logo fetching) — server-only, never use NEXT_PUBLIC_
# Get your API key at https://logo.dev
LOGO_DEV_KEY=your-logo-dev-key

# Optional: override default sender (default: BullPen <hello@updates.bullpen.no>)
```

Replace with:

```
# Logo.dev (required for company logo fetching) — server-only, never use NEXT_PUBLIC_
# Get your API key at https://logo.dev
LOGO_DEV_KEY=your-logo-dev-key

# Discord notifications (optional) — deploy status + changelog announcements
# Create an Incoming Webhook per channel: Discord channel Settings → Integrations → Webhooks → New Webhook
DISCORD_DEPLOY_WEBHOOK_URL=https://discord.com/api/webhooks/your-deploy-webhook
DISCORD_CHANGELOG_WEBHOOK_URL=https://discord.com/api/webhooks/your-changelog-webhook
# Signing secret shown once when creating the webhook in Vercel: Project Settings → Webhooks
VERCEL_WEBHOOK_SECRET=your-vercel-webhook-signing-secret

# Optional: override default sender (default: BullPen <hello@updates.bullpen.no>)
```

- [ ] **Step 4: Verify the edits**

Run: `grep -n "post-changelog-discord\|DISCORD_DEPLOY_WEBHOOK_URL" CLAUDE.md ENV_SETUP.md`
Expected: matches in both files at the lines just edited.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md ENV_SETUP.md
git commit -m "docs(discord): document Discord notification env vars and End Session Protocol step"
git push origin preview
```

---

### Task 5: Register the Vercel webhook (manual, no code)

This task has no files to create or modify — it's the final manual wiring step, included here so nothing is left dangling.

- [ ] **Step 1: Register the webhook in Vercel**

Tell the user: "Go to the `bullpen` project in Vercel → Settings → Webhooks → Create Webhook. Set the URL to `https://bullpen.no/api/webhooks/vercel-deploy`, and subscribe to exactly two events: `deployment.ready` and `deployment.error`. Vercel will show you a signing secret once — copy it."

- [ ] **Step 2: Set the real secret in Vercel's env vars**

Tell the user: "Add `VERCEL_WEBHOOK_SECRET` (the real one from Step 1, not the local test value), `DISCORD_DEPLOY_WEBHOOK_URL`, and `DISCORD_CHANGELOG_WEBHOOK_URL` to the `bullpen` project's environment variables in Vercel (Production scope at minimum) — Project Settings → Environment Variables."

- [ ] **Step 3: Confirm with a real deploy**

The next time `main` is updated (e.g. via the End Session Protocol's merge step) and a production deployment completes, a green "Production deploy succeeded" embed should appear in the deploy channel automatically — ask the user to confirm this after the next real production deploy, since it can't be verified synchronously within this session.

---

## Self-Review Notes

**Spec coverage:** Shared helper (Task 1) ✓, deploy webhook receiver with production-only `deployment.ready`/`deployment.error` filtering (Task 2) ✓, changelog poster wired into the End Session Protocol (Task 3 + Task 4 Step 1) ✓, rich embeds throughout (all tasks use `DiscordEmbed`, no plain-text-only messages) ✓, env var documentation (Task 4) ✓, manual Discord-server-setup and Vercel-webhook-registration steps explicitly called out as user actions rather than silently assumed (Task 1 Step 2, Task 5) ✓. Out-of-scope items from the spec (preview notifications, `deployment.promoted`, Slack/Knock/Novu, CI-based changelog watching) have no corresponding task, as intended.

**Type consistency:** `DiscordEmbed`/`DiscordMessage`/`postToDiscord` (Task 1) are imported with identical names and signatures in Task 2 (`import { postToDiscord, type DiscordEmbed } from '@/lib/discord/post-message'`) and Task 3 (`import { postToDiscord, type DiscordEmbed } from '../lib/discord/post-message'` — relative path, since scripts aren't under the `@/` alias root the same way route files are, matching how `scripts/test-resend.ts` imports `'../lib/email/resend'`).
