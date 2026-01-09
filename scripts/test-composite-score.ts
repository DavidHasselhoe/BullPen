// Test Composite Score Calculation Script
// Run with: npx tsx scripts/test-composite-score.ts

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';
import { calculateFilingCompositeScore } from '../lib/scores/scores-orchestrator';

async function main() {
  console.log('📊 BullPen Composite Score Test\n');

  // Get filing ID from command line or use latest Apple filing with signals
  let filingId = process.argv[2];

  if (!filingId) {
    console.log('📊 Finding latest Apple filing with signals...\n');
    const supabase = createServerClient();

    // Find filing with signals
    const { data: filing } = await supabase
      .from('filings')
      .select(`
        id, 
        accession_number, 
        filing_type, 
        filing_date,
        company:companies(ticker, name)
      `)
      .eq('processing_status', 'completed')
      .order('filing_date', { ascending: false })
      .limit(1)
      .single();

    if (!filing) {
      console.error('❌ No completed filings found');
      console.log('\nUsage: npx tsx scripts/test-composite-score.ts [FILING_ID]');
      process.exit(1);
    }

    // Check if signals exist
    const { data: signals } = await supabase
      .from('signals')
      .select('id')
      .eq('filing_id', filing.id)
      .eq('is_active', true)
      .limit(1);

    if (!signals || signals.length === 0) {
      console.error('❌ No active signals found for this filing');
      console.log('\nRun signal generation first: npm run test-signals');
      process.exit(1);
    }

    filingId = filing.id;
    const company = (filing as any).company;
    console.log(`Found: ${company.name} (${company.ticker})`);
    console.log(`Filing: ${filing.filing_type} - ${filing.filing_date}`);
    console.log(`Accession: ${filing.accession_number}`);
    console.log(`Filing ID: ${filingId}`);
    console.log(`Active Signals: Found\n`);
  }

  console.log('🔄 Calculating composite score...\n');

  const result = await calculateFilingCompositeScore(filingId, {
    useStored: false, // Always recalculate for testing
    storeResult: true, // Store the result
    onProgress: (step, details) => {
      console.log(`  → ${step}`, details ? `(${JSON.stringify(details)})` : '');
    },
  });

  console.log('\n' + '='.repeat(60));

  if (result.success && result.score) {
    const score = result.score;
    const directionEmoji = 
      score.direction === 'bullish' ? '📈' :
      score.direction === 'bearish' ? '📉' : '➡️';

    console.log('✅ Composite Score calculated successfully!\n');
    console.log('Composite Score:');
    console.log(`  Score:      ${score.composite_score}/100 ${directionEmoji}`);
    console.log(`  Direction:  ${score.direction}`);
    console.log(`  Explanation: ${score.explanation}\n`);

    console.log('Calculation Details:');
    console.log(`  Baseline:              ${score.calculation_details.baseline}`);
    console.log(`  Bullish Contribution:  +${score.calculation_details.bullish_contribution.toFixed(2)}`);
    console.log(`  Bearish Contribution:  -${score.calculation_details.bearish_contribution.toFixed(2)}`);
    console.log(`  Neutral Contribution:  ${score.calculation_details.neutral_contribution >= 0 ? '+' : ''}${score.calculation_details.neutral_contribution.toFixed(2)}`);
    console.log(`  Raw Score:             ${score.calculation_details.raw_score.toFixed(2)}`);
    console.log(`  Capped Score:          ${score.calculation_details.capped_score}\n`);

    console.log(`Contributing Signals (${score.contributing_signals.length}):`);
    score.contributing_signals.forEach((cs, i) => {
      const emoji = cs.direction === 'bullish' ? '📈' : cs.direction === 'bearish' ? '📉' : '➡️';
      console.log(`  ${i + 1}. ${emoji} ${cs.signal_type} (${cs.direction})`);
      console.log(`     Strength: ${cs.strength}/100`);
      console.log(`     Contribution: ${cs.contribution >= 0 ? '+' : ''}${cs.contribution.toFixed(2)}`);
    });

    if (result.details?.stored) {
      console.log('\n✅ Score stored in filing metadata');
    }
  } else {
    console.log('❌ Composite score calculation failed!\n');
    if (result.errors) {
      console.log('Errors:');
      result.errors.forEach((error, i) => {
        console.log(`  ${i + 1}. ${error}`);
      });
    }
    process.exit(1);
  }

  console.log('\n📋 Verifying via SQL query...\n');
  console.log('Run this SQL to verify:');
  console.log('```sql');
  console.log(`SELECT`);
  console.log(`  f.accession_number,`);
  console.log(`  c.ticker,`);
  console.log(`  f.metadata->'composite_score'->>'composite_score' as score,`);
  console.log(`  f.metadata->'composite_score'->>'direction' as direction,`);
  console.log(`  f.metadata->'composite_score'->>'explanation' as explanation`);
  console.log(`FROM filings f`);
  console.log(`JOIN companies c ON c.id = f.company_id`);
  console.log(`WHERE f.id = '${filingId}';`);
  console.log('```\n');
}

main();
