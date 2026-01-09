// Test Signal Generation Script
// Run with: npx tsx scripts/test-signals.ts

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';
import { generateSignalsForFiling } from '../lib/signals/signals-orchestrator';

async function main() {
  console.log('📊 BullPen Signal Generation Test\n');

  // Get filing ID from command line or use latest Apple filing with AI insights
  let filingId = process.argv[2];

  if (!filingId) {
    console.log('📊 Finding latest Apple filing with AI insights...\n');
    const supabase = createServerClient();

    // Find filing with AI insights
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
      console.log('\nUsage: npx tsx scripts/test-signals.ts [FILING_ID]');
      process.exit(1);
    }

    // Check if AI insights exist
    const { data: insights } = await supabase
      .from('ai_insights')
      .select('id')
      .eq('filing_id', filing.id)
      .limit(1);

    if (!insights || insights.length === 0) {
      console.error('❌ No AI insights found for this filing');
      console.log('\nRun AI analysis first: npm run test-ai');
      process.exit(1);
    }

    filingId = filing.id;
    const company = (filing as any).company;
    console.log(`Found: ${company.name} (${company.ticker})`);
    console.log(`Filing: ${filing.filing_type} - ${filing.filing_date}`);
    console.log(`Accession: ${filing.accession_number}`);
    console.log(`Filing ID: ${filingId}`);
    console.log(`AI Insights: ${insights.length} found\n`);
  }

  console.log('🔄 Starting signal generation...\n');

  const result = await generateSignalsForFiling(filingId, {
    replaceExisting: true,
    onProgress: (step, details) => {
      console.log(`  → ${step}`, details ? `(${JSON.stringify(details)})` : '');
    },
  });

  console.log('\n' + '='.repeat(60));

  if (result.success) {
    console.log('✅ Signal generation completed successfully!\n');
    console.log('Results:');
    console.log(`  Filing ID:        ${result.filingId}`);
    console.log(`  Company ID:       ${result.companyId}`);
    console.log(`  Signals Created:  ${result.signalsCreated}`);
    
    if (result.details?.summary) {
      const s = result.details.summary;
      console.log(`\nSignal Summary:`);
      console.log(`  Total:    ${s.total}`);
      console.log(`  Bullish:  ${s.bullish}`);
      console.log(`  Bearish:  ${s.bearish}`);
      console.log(`  Neutral:  ${s.neutral}`);
    }
  } else {
    console.log('❌ Signal generation failed!\n');
    if (result.errors) {
      console.log('Errors:');
      result.errors.forEach((error, i) => {
        console.log(`  ${i + 1}. ${error}`);
      });
    }
    process.exit(1);
  }

  console.log('\n📋 Fetching stored signals...\n');

  // Query signals from database
  const supabase = createServerClient();
  const { data: signals } = await supabase
    .from('signals')
    .select('*')
    .eq('filing_id', filingId)
    .order('strength', { ascending: false });

  if (signals && signals.length > 0) {
    console.log(`Found ${signals.length} signals:\n`);
    signals.forEach((signal, i) => {
      const directionEmoji = 
        signal.direction === 'bullish' ? '📈' :
        signal.direction === 'bearish' ? '📉' : '➡️';
      
      console.log(`${i + 1}. ${directionEmoji} ${signal.title}`);
      console.log(`   Type:     ${signal.signal_type}`);
      console.log(`   Direction: ${signal.direction}`);
      console.log(`   Strength: ${signal.strength}/100`);
      console.log(`   ${signal.description}`);
      console.log('');
    });
  } else {
    console.log('No signals found in database');
  }
}

main();
