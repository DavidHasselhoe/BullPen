// Race check for reserve_ai_quota (migration 200, reserveQuota in
// lib/billing/quotas.ts): parallel reservations must never pass the limit.
// Free (no model calls). Writes ai_usage rows for the QA account under a test
// feature name and deletes them.
//   npm run test-quota-race
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import assert from 'assert';
import { createClient } from '@supabase/supabase-js';

const FEATURE = 'quota_race_test';
const LIMIT = 2;
const PARALLEL = 8;

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: user, error: userErr } = await db.from('users').select('id').eq('email', process.env.QA_TEST_EMAIL!).single();
  assert.ifError(userErr);
  const userId = (user as { id: string }).id;
  const windowStart = new Date(Date.now() - 60_000).toISOString();

  await db.from('ai_usage').delete().eq('user_id', userId).eq('feature', FEATURE);
  try {
    const results = await Promise.all(
      Array.from({ length: PARALLEL }, () =>
        db.rpc('reserve_ai_quota', {
          p_user_id: userId, p_feature: FEATURE, p_model: 'test', p_limit: LIMIT, p_window_start: windowStart,
        })
      )
    );
    for (const r of results) assert.ifError(r.error);
    const granted = results.filter((r) => (r.data as { reservation_id: string | null }[])[0]?.reservation_id).length;
    assert.equal(granted, LIMIT, `${PARALLEL} parallel reservations granted ${granted}, limit is ${LIMIT}`);
    const { count } = await db.from('ai_usage').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('feature', FEATURE);
    assert.equal(count, LIMIT, `expected ${LIMIT} rows, found ${count}`);
    console.log(`ok  ${PARALLEL} parallel reservations, ${granted} granted (limit ${LIMIT})`);
  } finally {
    await db.from('ai_usage').delete().eq('user_id', userId).eq('feature', FEATURE);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
