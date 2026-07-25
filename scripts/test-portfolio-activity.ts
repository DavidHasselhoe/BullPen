// Verifies recordPortfolioActivity: inserts one row per action type against a
// real existing user (FK-constrained to auth.users), confirms percent_change
// is set for increased/trimmed and null for opened/closed, then cleans up.

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';
import { recordPortfolioActivity } from '../lib/holdings/portfolio-activity';

const TEST_SYMBOL = 'ZZZTEST';

async function main() {
  const supabase = createServerClient();

  const { data: anyUser, error: userErr } = await supabase
    .from('users')
    .select('id')
    .limit(1)
    .single();

  if (userErr || !anyUser) {
    console.error('❌ Could not find any user to test against:', userErr?.message);
    process.exit(1);
  }
  const testUserId = anyUser.id;

  // Clean slate
  await supabase.from('portfolio_activity').delete().eq('symbol', TEST_SYMBOL);

  console.log('1) Recording "opened"...');
  await recordPortfolioActivity(testUserId, TEST_SYMBOL, 'Test Co', 'opened');

  console.log('2) Recording "increased" (+50%)...');
  await recordPortfolioActivity(testUserId, TEST_SYMBOL, 'Test Co', 'increased', 50);

  console.log('3) Recording "trimmed" (-25%)...');
  await recordPortfolioActivity(testUserId, TEST_SYMBOL, 'Test Co', 'trimmed', 25);

  console.log('4) Recording "closed"...');
  await recordPortfolioActivity(testUserId, TEST_SYMBOL, 'Test Co', 'closed');

  const { data, error } = await supabase
    .from('portfolio_activity')
    .select('action, percent_change')
    .eq('symbol', TEST_SYMBOL)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('❌ Query failed:', error.message);
    process.exit(1);
  }

  console.log('\nRows for', TEST_SYMBOL, ':', JSON.stringify(data, null, 2));

  const pass =
    data?.length === 4 &&
    data[0].action === 'opened' && data[0].percent_change === null &&
    data[1].action === 'increased' && data[1].percent_change === 50 &&
    data[2].action === 'trimmed' && data[2].percent_change === 25 &&
    data[3].action === 'closed' && data[3].percent_change === null;

  console.log(pass
    ? '\n✅ PASS — 4 rows in order with correct action/percent_change values.'
    : '\n❌ FAIL — see rows above.');

  // Clean up (only this test's rows — never touches the real user's own data)
  await supabase.from('portfolio_activity').delete().eq('symbol', TEST_SYMBOL);
  console.log('Cleaned up test rows.');

  process.exit(pass ? 0 : 1);
}

main();
