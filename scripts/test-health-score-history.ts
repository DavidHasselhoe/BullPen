// Test Financial Health Score History
// Verifies recordHealthScoreSnapshot: inserts a snapshot, re-inserts the same
// fiscal quarter with a new score (must overwrite in place, not duplicate),
// inserts a second distinct quarter (must add a new row), then prints +
// cleans up the test rows.

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';
import { recordHealthScoreSnapshot } from '../lib/finance/health-score-history';
import type { HealthScore } from '../lib/finance/health-score';

const TEST_TICKER = 'ZZZTEST';

function fakeScore(score: number, grade: HealthScore['grade']): HealthScore {
  return {
    score,
    grade,
    label: 'Test',
    summary: 'Test summary',
    categories: [
      { name: 'Profitability', score: score * 0.3, max: 30, label: 'Test' },
    ],
    metricSignals: {},
  };
}

async function main() {
  const supabase = createServerClient();

  // Clean slate
  await supabase.from('health_score_history').delete().eq('ticker', TEST_TICKER);

  console.log('1) Inserting Q1 snapshot (score 60)...');
  await recordHealthScoreSnapshot(TEST_TICKER, fakeScore(60, 'C'), '2026-03-31');

  console.log('2) Re-inserting the SAME Q1 quarter with a different score (80) — must overwrite in place, not add a row...');
  await recordHealthScoreSnapshot(TEST_TICKER, fakeScore(80, 'B'), '2026-03-31');

  console.log('3) Inserting a distinct Q2 quarter (score 75)...');
  await recordHealthScoreSnapshot(TEST_TICKER, fakeScore(75, 'B'), '2026-06-30');

  const { data, error } = await supabase
    .from('health_score_history')
    .select('fiscal_date, snapshot_date, score, grade')
    .eq('ticker', TEST_TICKER)
    .order('fiscal_date', { ascending: true });

  if (error) {
    console.error('❌ Query failed:', error.message);
    process.exit(1);
  }

  console.log('\nRows for', TEST_TICKER, ':', JSON.stringify(data, null, 2));

  const pass = data?.length === 2 && data[0].score === 80 && data[1].score === 75;
  console.log(pass
    ? '\n✅ PASS — exactly 2 rows, first quarter\'s score was overwritten in place (60 → 80).'
    : '\n❌ FAIL — expected exactly 2 rows with scores [80, 75].');

  // Clean up
  await supabase.from('health_score_history').delete().eq('ticker', TEST_TICKER);
  console.log('Cleaned up test rows.');

  process.exit(pass ? 0 : 1);
}

main();
