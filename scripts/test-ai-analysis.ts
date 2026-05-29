// Test AI Analysis Script
// Run with: npx tsx scripts/test-ai-analysis.ts

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';
import { analyzeFilingSections } from '../lib/ai/ai-orchestrator';

async function main() {
  console.log('🤖 BullPen AI Analysis Test\n');

  // Get filing ID from command line or use latest Apple filing
  let filingId = process.argv[2];

  if (!filingId) {
    console.log('📊 Finding latest completed Apple filing...\n');
    const supabase = createServerClient();

    const { data: filing } = await supabase
      .from('filings')
      .select('id, accession_number, filing_type, filing_date, company:companies(ticker, name)')
      .eq('processing_status', 'completed')
      .order('filing_date', { ascending: false })
      .limit(1)
      .single();

    if (!filing) {
      console.error('❌ No completed filings found');
      console.log('\nUsage: npx tsx scripts/test-ai-analysis.ts [FILING_ID]');
      process.exit(1);
    }

    filingId = filing.id;
    const company = (filing as Record<string, unknown>).company as { name: string; ticker: string };
    console.log(`Found: ${company.name} (${company.ticker})`);
    console.log(`Filing: ${filing.filing_type} - ${filing.filing_date}`);
    console.log(`Accession: ${filing.accession_number}`);
    console.log(`Filing ID: ${filingId}\n`);
  }

  console.log('🔄 Starting AI analysis...\n');

  const result = await analyzeFilingSections(filingId, {
    skipExisting: true,
    onProgress: (step, details) => {
      console.log(`  → ${step}`, details ? `(${JSON.stringify(details)})` : '');
    },
  });

  console.log('\n' + '='.repeat(60));

  if (result.success) {
    console.log('✅ AI Analysis completed successfully!\n');
    console.log('Results:');
    console.log(`  Filing ID:         ${result.filingId}`);
    console.log(`  Sections Analyzed: ${result.sectionsAnalyzed}`);
    console.log(`  Insights Created:  ${result.insightsCreated}`);
    
    if (result.details) {
      console.log(`\nDetails:`);
      console.log(`  Company:      ${result.details.companyName}`);
      console.log(`  Filing Type:  ${result.details.filingType}`);
      
      if (result.details.sectionResults) {
        console.log(`\nSection Results:`);
        result.details.sectionResults.forEach((sr, i) => {
          const status = sr.success ? '✅' : '❌';
          console.log(`  ${i + 1}. ${status} ${sr.sectionType}${sr.error ? ` - ${sr.error}` : ''}`);
        });
      }
    }
  } else {
    console.log('❌ AI Analysis failed!\n');
    if (result.errors) {
      console.log('Errors:');
      result.errors.forEach((error, i) => {
        console.log(`  ${i + 1}. ${error}`);
      });
    }
    process.exit(1);
  }

  console.log('\n📋 Fetching stored insights...\n');

  // Query insights from database
  const supabase = createServerClient();
  const { data: insights } = await supabase
    .from('ai_insights')
    .select('*')
    .eq('filing_id', filingId)
    .order('created_at', { ascending: true });

  if (insights && insights.length > 0) {
    console.log(`Found ${insights.length} AI insights:\n`);
    insights.forEach((insight, i) => {
      console.log(`${i + 1}. ${insight.title}`);
      console.log(`   Type: ${insight.insight_type}`);
      console.log(`   Model: ${insight.model_version}`);
      console.log(`   Confidence: ${insight.confidence_score}`);
      
      const content = insight.content as Record<string, unknown> | null;
      if (content) {
        console.log(`   Sentiment: ${content.sentiment}`);
        console.log(`   Summary: ${content.summary?.substring(0, 100)}...`);
        console.log(`   Key Points: ${content.key_points?.length || 0}`);
        console.log(`   Risk Flags: ${content.risk_flags?.length || 0}`);
      }
      console.log('');
    });
  } else {
    console.log('No insights found in database');
  }
}

main();
