// Test Trend Detection v1
// Run trend analysis for a company and display results

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';
import { analyzeTrendsForCompany } from '../lib/trends/trends-orchestrator';
import { getCompanyTrends } from '../lib/trends/trends-db';

async function main() {
  const ticker = process.argv[2]?.toUpperCase() || 'AAPL';

  console.log(`📊 Running Trend Detection v1 for ${ticker}...\n`);

  const supabase = createServerClient();

  // Get company
  const { data: company } = await supabase
    .from('companies')
    .select('id, name, ticker')
    .eq('ticker', ticker)
    .single();

  if (!company) {
    console.error(`❌ Company ${ticker} not found`);
    console.log('\nPlease ingest the company first.');
    process.exit(1);
  }

  console.log(`Found: ${company.name} (${company.ticker})`);
  console.log(`Company ID: ${company.id}\n`);

  // Run trend analysis
  console.log('🔍 Analyzing trends...\n');
  
  const result = await analyzeTrendsForCompany(company.id, {
    replaceExisting: true,
    onProgress: (step, details) => {
      if (details) {
        console.log(`  ${step}:`, details);
      } else {
        console.log(`  ${step}`);
      }
    },
  });

  if (!result.success) {
    console.error('\n❌ Trend analysis failed:');
    result.errors?.forEach((error) => console.error(`  - ${error}`));
    process.exit(1);
  }

  console.log(`\n✅ Analysis complete!`);
  console.log(`  Trends created: ${result.trendsCreated || 0}`);
  console.log(`  Metrics analyzed: ${result.details?.metricsAnalyzed || 0}\n`);

  // Fetch and display trends
  const trendsResult = await getCompanyTrends(company.id);

  if (!trendsResult.success || !trendsResult.data || trendsResult.data.length === 0) {
    console.log('⚠️  No trends detected.');
    process.exit(0);
  }

  console.log('📈 Detected Trends:\n');
  console.log('='.repeat(80));

  // Group by metric type
  const trendsByMetric: Record<string, typeof trendsResult.data> = {};
  trendsResult.data.forEach((trend) => {
    if (!trendsByMetric[trend.metric_type]) {
      trendsByMetric[trend.metric_type] = [];
    }
    trendsByMetric[trend.metric_type].push(trend);
  });

  Object.entries(trendsByMetric).forEach(([metricType, trends]) => {
    console.log(`\n${metricType.toUpperCase()}:`);
    console.log('-'.repeat(80));

    trends.forEach((trend) => {
      const directionEmoji = 
        trend.direction === 'positive' ? '📈' :
        trend.direction === 'negative' ? '📉' : '➡️';

      console.log(`  ${directionEmoji} ${trend.trend_type} (${trend.direction})`);
      console.log(`     Strength: ${trend.strength}/100`);
      console.log(`     Periods analyzed: ${trend.periods_analyzed}`);
      console.log(`     Explanation: ${trend.explanation}`);
      console.log('');
    });
  });

  console.log('='.repeat(80));
  console.log(`\n✅ Total trends: ${trendsResult.data.length}`);

  // SQL query for verification
  console.log('\n📋 SQL Query to verify trends:');
  console.log('```sql');
  console.log(`SELECT`);
  console.log(`  metric_type,`);
  console.log(`  trend_type,`);
  console.log(`  direction,`);
  console.log(`  strength,`);
  console.log(`  explanation,`);
  console.log(`  periods_analyzed,`);
  console.log(`  metadata`);
  console.log(`FROM trends`);
  console.log(`WHERE company_id = '${company.id}'`);
  console.log(`ORDER BY strength DESC;`);
  console.log('```\n');
}

main();
