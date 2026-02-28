/**
 * Diagnostic script: Analyze SEC filing structure and extraction pipeline
 * 
 * 1. Query Supabase for NVDA current state
 * 2. Fetch actual 10-K and 10-Q content from SEC
 * 3. Analyze document structure (full .txt vs main document)
 * 4. Test table detection and column classification
 * 5. Identify what works and what doesn't
 * 
 * Run: npx tsx scripts/diagnose-sec-extraction.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

const NVDA_CIK = '0001045810';
const ACC_10K = '0001045810-24-000029';
const ACC_10Q = '0001045810-24-000316'; // Q3 FY2025 (Oct 27, 2024)
const ACC_10Q_ALT = '0001045810-24-000124'; // Q1 FY2025 (Apr 28, 2024)

async function fetchSEC(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'BullPen Analytics contact@bullpen.example.com', 'Accept': 'text/html,text/plain' },
  });
  if (!res.ok) throw new Error(`SEC fetch failed: ${res.status}`);
  return res.text();
}

async function main() {
  console.log('='.repeat(70));
  console.log('SEC EXTRACTION DIAGNOSTIC - NVIDIA (NVDA)');
  console.log('='.repeat(70));

  // STEP 1: Query Supabase for NVDA state
  console.log('\n--- STEP 1: Supabase state ---\n');
  try {
    const { createServerClient } = await import('../lib/supabase/client');
    const supabase = createServerClient();

    const { data: company } = await supabase.from('companies').select('id, name, ticker, fiscal_year_end_month, fiscal_year_end_day').eq('ticker', 'NVDA').single();
    if (!company) {
      console.log('NVDA not in companies table (run ingestion first)');
    } else {
      console.log('Company:', company.name, '| FYE:', company.fiscal_year_end_month ? `${company.fiscal_year_end_month}-${company.fiscal_year_end_day}` : 'NOT SET');
      
      const { data: filings } = await supabase.from('filings').select('id, filing_type, accession_number, period_end_date').eq('company_id', company.id).order('filing_date', { ascending: false }).limit(15);
      console.log('\nFilings:', filings?.length ?? 0);
      filings?.slice(0, 5).forEach(f => console.log(`  - ${f.filing_type} ${f.accession_number} period=${f.period_end_date}`));

      const { data: metrics } = await supabase.from('financial_metrics').select('metric_type, period_type, period_end_date, value').eq('company_id', company.id).order('period_end_date', { ascending: false }).limit(20);
      console.log('\nMetrics:', metrics?.length ?? 0);
      const byPeriod = (metrics || []).reduce((acc: Record<string, number>, m) => { acc[m.period_type] = (acc[m.period_type] || 0) + 1; return acc; }, {});
      console.log('  By period_type:', byPeriod);
      metrics?.slice(0, 5).forEach(m => console.log(`  - ${m.metric_type} ${m.period_type} ${m.period_end_date} = ${m.value}`));
    }
  } catch (e) {
    console.error('Supabase error:', e);
  }

  // STEP 2: Fetch 10-K content and analyze structure
  console.log('\n--- STEP 2: 10-K document structure ---\n');
  const url10KTxt = `https://www.sec.gov/Archives/edgar/data/1045810/000104581024000029/0001045810-24-000029.txt`;
  const url10KHtm = `https://www.sec.gov/Archives/edgar/data/1045810/000104581024000029/nvda-20240128.htm`;

  try {
    console.log('Fetching 10-K .txt (full submission)...');
    const txtContent = await fetchSEC(url10KTxt);
    console.log(`  Size: ${(txtContent.length / 1024).toFixed(1)} KB`);

    // Check structure
    const hasDoc = /<DOCUMENT>/i.test(txtContent);
    const hasType10K = /<TYPE>10-K/i.test(txtContent);
    const docMatch = txtContent.match(/<DOCUMENT>[\s\S]*?<TYPE>10-K(?:\/[A-Z])?[\s\S]*?<TEXT>([\s\S]*?)<\/TEXT>[\s\S]*?<\/DOCUMENT>/i);
    console.log('  Has <DOCUMENT>:', hasDoc);
    console.log('  Has <TYPE>10-K:', hasType10K);
    console.log('  Doc extraction match:', !!docMatch);
    if (docMatch) {
      console.log('  Extracted doc size:', (docMatch[1].length / 1024).toFixed(1), 'KB');
      console.log('  Would use extracted (>50KB):', docMatch[1].length > 50000);
    }

    // Count tables
    const tableCount = (txtContent.match(/<table/gi) || []).length;
    const tableCountExtracted = docMatch ? (docMatch[1].match(/<table/gi) || []).length : 0;
    console.log('  <table> count (full txt):', tableCount);
    console.log('  <table> count (extracted):', tableCountExtracted);

    // Check for income statement indicators
    const searchIn = docMatch && docMatch[1].length > 50000 ? docMatch[1] : txtContent;
    const hasRevenue = /revenue|revenues|net\s+sales/i.test(searchIn);
    const hasThreeMonths = /(?:three|3)[\s-]*months?\s*(?:ended|period)|quarter\s*ended/i.test(searchIn);
    const hasYearEnded = /year[s]?\s*ended|fiscal\s*year|twelve\s*months\s*ended/i.test(searchIn);
    console.log('  Has revenue:', hasRevenue);
    console.log('  Has "Three Months"/quarter:', hasThreeMonths);
    console.log('  Has "Year Ended"/fiscal year:', hasYearEnded);
  } catch (e) {
    console.error('10-K fetch error:', e);
  }

  // STEP 3: Fetch 10-Q content
  console.log('\n--- STEP 3: 10-Q document structure ---\n');
  const url10QTxt = `https://www.sec.gov/Archives/edgar/data/1045810/000104581024000316/0001045810-24-000316.txt`;

  try {
    console.log('Fetching 10-Q .txt...');
    const txt10Q = await fetchSEC(url10QTxt);
    console.log(`  Size: ${(txt10Q.length / 1024).toFixed(1)} KB`);

    const docMatch10Q = txt10Q.match(/<DOCUMENT>[\s\S]*?<TYPE>10-Q(?:\/[A-Z])?[\s\S]*?<TEXT>([\s\S]*?)<\/TEXT>[\s\S]*?<\/DOCUMENT>/i);
    console.log('  10-Q doc extraction:', !!docMatch10Q);
    if (docMatch10Q) {
      console.log('  Extracted size:', (docMatch10Q[1].length / 1024).toFixed(1), 'KB');
      console.log('  Would use extracted (>50KB):', docMatch10Q[1].length > 50000);
      const tables = (docMatch10Q[1].match(/<table/gi) || []).length;
      console.log('  <table> in extracted:', tables);
      const has3m = /(?:three|3)[\s-]*months?\s*(?:ended|period)|quarter\s*ended/i.test(docMatch10Q[1]);
      console.log('  Has Three Months/quarter:', has3m);
    }
  } catch (e) {
    console.error('10-Q fetch error:', e);
  }

  // STEP 4: Test pipeline logic (detectFinancialTables, classifyTableColumns)
  console.log('\n--- STEP 4: Test pipeline table detection ---\n');
  try {
    const { executeCanonicalPipeline } = await import('../lib/metrics/filing-first-pipeline');
    
    // Need a filing in DB - get or create minimal test
    const supabase = (await import('../lib/supabase/client')).createServerClient();
    const { data: company } = await supabase.from('companies').select('id').eq('ticker', 'NVDA').single();
    if (!company) {
      console.log('Cannot test pipeline: NVDA not in DB. Run ingestion first.');
    } else {
      const { data: filing } = await supabase.from('filings').select('id, filing_type').eq('company_id', company.id).eq('filing_type', '10-Q').eq('accession_number', ACC_10Q).single();
      const filingToUse = filing || (await supabase.from('filings').select('id, filing_type').eq('company_id', company.id).limit(1).single()).data;
      if (filingToUse) {
        console.log('Running canonical pipeline on filing:', filingToUse.id);
        const result = await executeCanonicalPipeline(filingToUse.id, {
          onProgress: (step, d) => console.log('  ', step, d ? JSON.stringify(d).slice(0, 80) : ''),
        });
        console.log('\nPipeline result:', {
          success: result.success,
          metricsExtracted: result.metricsExtracted,
          metricsStored: result.metricsStored,
          tablesProcessed: result.tablesProcessed,
          errors: result.errors?.slice(0, 3),
        });
      }
    }
  } catch (e) {
    console.error('Pipeline test error:', e);
  }

  // STEP 5: Analyze table structure, structured text, and AI extraction
  console.log('\n--- STEP 5: Table HTML structure & pipeline components ---\n');
  try {
    const txtContent = await fetchSEC(url10QTxt);
    const docMatch = txtContent.match(/<DOCUMENT>[\s\S]*?<TYPE>10-Q(?:\/[A-Z])?[\s\S]*?<TEXT>([\s\S]*?)<\/TEXT>[\s\S]*?<\/DOCUMENT>/i);
    const content = docMatch && docMatch[1].length > 50000 ? docMatch[1] : txtContent;

    // Extract tables the same way pipeline does
    const tablePattern = /<table[^>]*>[\s\S]*?<\/table>/gi;
    const allTables: string[] = [];
    let m;
    while ((m = tablePattern.exec(content)) !== null) allTables.push(m[0]);

    // Filter to income-statement-like tables (matching pipeline logic)
    const hasEPS = /(?:earnings\s*per\s*share|eps\s*(?:basic|diluted)|net\s*income\s*per\s*share)/i;
    const hasRevenue = /(?:revenue|revenues|net\s*sales|total\s*revenue)/i;
    const hasThreeMonths = /(?:three|3)[\s-]*months?\s*(?:ended|period)|quarter\s*ended/i;
    const hasDateContext = /(?:20\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;
    const tables = allTables.filter((tbl) => {
      const isIncomeStmt = hasEPS.test(tbl) || (hasRevenue.test(tbl) && /(?:net\s*income|operating\s*income)/i.test(tbl));
      return isIncomeStmt && hasThreeMonths.test(tbl) && hasDateContext.test(tbl);
    });

    console.log('Pipeline-like table count:', tables.length, '(from', allTables.length, 'total)');

    const { tableToStructuredText, extractMetricsFromTable } = await import('../lib/metrics/table-extractor');

    for (let i = 0; i < Math.min(tables.length, 3); i++) {
      const tbl = tables[i];
      const structured = tableToStructuredText(tbl);
      console.log(`\nTable ${i + 1}: html=${tbl?.length ?? 0} chars, structured=${structured?.length ?? 0} chars`);
      console.log('Structured text preview (first 800 chars):');
      console.log(structured?.slice(0, 800) || '(empty)');
      console.log('---');

      // Run AI extraction directly on first table
      if (i === 0 && structured && structured.length > 100 && process.env.OPENAI_API_KEY) {
        console.log('\nRunning AI extraction on Table 1 (quarterly)...');
        const aiResult = await extractMetricsFromTable(tbl, 'openai', structured, 'Q');
        console.log('AI result:', {
          metricsCount: aiResult.metrics?.length ?? 0,
          error: aiResult.error,
          rawPreview: aiResult.rawOutput?.slice(0, 350),
        });
        if (aiResult.metrics?.length) {
          aiResult.metrics.forEach((mx) => console.log(`  - ${mx.metric}: ${mx.value} (${mx.period_label})`));
        }
      }
    }

    // Raw structure of first income-stmt-like table
    for (let i = 0; i < Math.min(allTables.length, 25); i++) {
      const tbl = allTables[i];
      if (!/revenue|consolidated|income|earnings\s*per\s*share/i.test(tbl)) continue;
      const hasThead = /<thead/i.test(tbl);
      const hasTh = /<th[\s>]/i.test(tbl);
      const trs = tbl.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
      const firstRowCells = (() => {
        const row = trs[0];
        if (!row) return [];
        const cellPattern = /<(?:th|td)(?:\s[^>]*)?>([\s\S]*?)<\/(?:th|td)>/gi;
        const cells: string[] = [];
        let cellM;
        while ((cellM = cellPattern.exec(row)) !== null)
          cells.push(cellM[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim().slice(0, 60));
        return cells;
      })();
      console.log(`\nIncome-stmt-like table ${i}: hasThead=${hasThead} hasTh=${hasTh} rows=${trs.length}`);
      console.log('  First row cells:', firstRowCells.slice(0, 8));
      break;
    }
  } catch (e) {
    console.error('Table analysis error:', e);
  }

  console.log('\n' + '='.repeat(70));
  console.log('DIAGNOSTIC COMPLETE');
  console.log('Run with DEBUG_EXTRACTION=1 for full structured text dumps.');
  console.log('='.repeat(70));
}

main().catch(console.error);
