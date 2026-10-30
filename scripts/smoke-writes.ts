/**
 * Smoke check for the core write paths, run before preview -> main.
 *   npm run smoke-writes                         against http://localhost:3000
 *   SMOKE_BASE_URL=https://... npm run smoke-writes
 *
 * Signs in as the QA test account (QA_TEST_EMAIL / QA_TEST_PASSWORD in
 * .env.local) and drives the real HTTP routes with its session cookie:
 * create a watchlist, add and remove a symbol, delete the list. Everything it
 * creates it deletes. The Vercel preview URL sits behind deployment protection;
 * set VERCEL_AUTOMATION_BYPASS_SECRET to point it there.
 *
 * Exists because creating a watchlist 403'd in production for weeks
 * (2026-10-30): the server gate ignored users.role, so an admin on a Free
 * account_tier was treated as Free once they had 3 lists, while the client
 * hook counted them as Pro and opened the dialog anyway. Lint, the build and
 * the review all passed. The gate asserts below fail on that code.
 *
 * Not covered: adding a holding is a Server Action (app/actions/holdings.ts),
 * not an HTTP route, so it can't be called from here.
 */

import assert from 'node:assert/strict';
import { config } from 'dotenv';
import { createServerClient } from '@supabase/ssr';
import { canCreateWatchlist, MAX_FREE_WATCHLISTS } from '@/lib/watchlist/limits';

config({ path: '.env.local' });

// The gate both POST /api/watchlist/lists and useWatchlistLimits call.
const later = new Date(Date.now() + 3_600_000).toISOString();
assert.equal(canCreateWatchlist(MAX_FREE_WATCHLISTS, 1, 'admin'), true, 'admin on a Free tier must not be capped');
assert.equal(canCreateWatchlist(MAX_FREE_WATCHLISTS, 3, 'user'), true, 'paid Pro must not be capped');
assert.equal(canCreateWatchlist(MAX_FREE_WATCHLISTS, 1, 'user', later), true, 'pro_bonus_until must lift the cap');
assert.equal(canCreateWatchlist(MAX_FREE_WATCHLISTS - 1, 1, 'user'), true, 'Free under the cap can create');
assert.equal(canCreateWatchlist(MAX_FREE_WATCHLISTS, 1, 'user'), false, 'Free at the cap is blocked');
console.log('ok  watchlist gate');

const base = (process.env.SMOKE_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

async function sessionCookie(): Promise<string> {
  const jar = new Map<string, string>();
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => cookies.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  const { error } = await supabase.auth.signInWithPassword({
    email: process.env.QA_TEST_EMAIL!,
    password: process.env.QA_TEST_PASSWORD!,
  });
  if (error) throw new Error(`QA sign-in failed: ${error.message}`);
  return [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
}

async function main() {
  const cookie = await sessionCookie();
  const headers: Record<string, string> = { cookie, origin: base, 'content-type': 'application/json' };
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) headers['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

  async function call(method: string, path: string, body?: unknown) {
    const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
    const text = await res.text();
    return { status: res.status, json: (() => { try { return JSON.parse(text); } catch { return text.slice(0, 200); } })() };
  }

  // The QA account is Free; a leftover list from a crashed run can put it at the cap.
  const before = await call('GET', '/api/watchlist/lists');
  assert.equal(before.status, 200, `list watchlists: ${before.status} ${JSON.stringify(before.json)}`);
  assert.ok(before.json.lists.length < MAX_FREE_WATCHLISTS, `QA account already has ${before.json.lists.length} lists; delete the "smoke-" ones`);

  const created = await call('POST', '/api/watchlist/lists', { name: `smoke-${Date.now()}`, color: '#10B981' });
  assert.equal(created.status, 201, `create watchlist: ${created.status} ${JSON.stringify(created.json)}`);
  const listId = created.json.list.id as string;
  try {
    const added = await call('POST', `/api/watchlist/lists/${listId}/items`, { symbol: 'AAPL' });
    assert.ok(added.status < 300, `add to watchlist: ${added.status} ${JSON.stringify(added.json)}`);
    const removed = await call('DELETE', `/api/watchlist/lists/${listId}/items?symbol=AAPL`);
    assert.ok(removed.status < 300, `remove from watchlist: ${removed.status} ${JSON.stringify(removed.json)}`);
  } finally {
    const deleted = await call('DELETE', `/api/watchlist/lists/${listId}`);
    assert.ok(deleted.status < 300, `delete watchlist: ${deleted.status} ${JSON.stringify(deleted.json)}`);
  }
  console.log(`ok  watchlist create / add / remove / delete against ${base}`);
}

main().catch((err) => {
  console.error(`FAIL ${err.message}`);
  process.exit(1);
});
