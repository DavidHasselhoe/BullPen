/**
 * Recompute every stock's Financial Health Score with the current method, from
 * data already in the database: screener_stats for the /statistics fields and
 * market_data_cache for the quarterly statements. Zero TwelveData credits.
 *
 *   npm run rescore-health -- --dry-run            distribution + spot checks, writes nothing
 *   npm run rescore-health -- --dry-run --show=KO,JPM
 *   npm run rescore-health                         write scores, no notifications
 *
 * Writes go straight to screener_stats and the current quarter's history
 * snapshot, bypassing notifyHealthScoreChanges on purpose: a grade that moved
 * because the method changed is not news about the company.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { computeHealthScore, healthColumns, HEALTH_SCORE_METHOD, type HealthScore } from '../lib/finance/health-score';
import type { CompanyStatistics, IncomeStatementPeriod, BalanceSheetPeriod, CashFlowPeriod } from '../lib/twelvedata/twelvedata-client';

const DRY = process.argv.includes('--dry-run');
const SHOW = (process.argv.find((a) => a.startsWith('--show='))?.slice(7) ??
  'AAPL,MSFT,NVDA,GOOGL,AMZN,META,BRK.B,JPM,BAC,GS,V,MA,KO,PEP,PG,WMT,COST,MCD,HD,LOW,SBUX,JNJ,MRK,PFE,ABBV,LLY,UNH,XOM,CVX,NEE,DUK,T,VZ,INTC,BA,F,GM,TSLA,PLTR,AMD,MU,ORCL,CRM,NFLX,DIS,NKE,B,AU,AEM,INCY,BLK').split(',');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

type Row = {
  ticker: string; name: string; sector: string | null; market_cap: number | null;
  pe_ratio: number | null; pb_ratio: number | null; ev_to_ebitda: number | null; beta: number | null;
  profit_margin: number | null; revenue_growth_yoy: number | null; earnings_growth_yoy: number | null;
  dividend_yield: number | null; health_score: number | null; health_score_grade: string | null;
};

async function allRows(): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('screener_stats')
      .select('ticker, name, sector, market_cap, pe_ratio, pb_ratio, ev_to_ebitda, beta, profit_margin, revenue_growth_yoy, earnings_growth_yoy, dividend_yield, health_score, health_score_grade')
      .order('ticker')
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as Row[]));
    if ((data ?? []).length < 1000) return out;
  }
}

async function statements(tickers: string[]) {
  const map = new Map<string, unknown[]>();
  const keys = tickers.flatMap((t) => ['income', 'balance', 'cashflow'].map((s) => `financials:${t}:${s}:quarterly`));
  for (let i = 0; i < keys.length; i += 300) {
    const { data, error } = await supabase.from('market_data_cache').select('cache_key, payload').in('cache_key', keys.slice(i, i + 300));
    if (error) throw new Error(error.message);
    for (const r of data ?? []) if (Array.isArray(r.payload)) map.set(r.cache_key as string, r.payload as unknown[]);
  }
  return (t: string, s: 'income' | 'balance' | 'cashflow') => (map.get(`financials:${t}:${s}:quarterly`) ?? []) as never[];
}

function statsFrom(r: Row): CompanyStatistics {
  return {
    symbol: r.ticker, marketCap: r.market_cap, enterpriseValue: null,
    peRatioTTM: r.pe_ratio, peRatioForward: null, pbRatio: r.pb_ratio, evToEbitda: r.ev_to_ebitda, psRatio: null,
    beta: r.beta, week52High: null, week52Low: null, avgVolume: null, sharesFloat: null, shortRatio: null,
    dividendYield: r.dividend_yield, profitMargin: r.profit_margin,
    // stored as percent in screener_stats, fractions in /statistics
    revenueGrowthTTM: r.revenue_growth_yoy != null ? r.revenue_growth_yoy / 100 : null,
    epsGrowthTTM: r.earnings_growth_yoy != null ? r.earnings_growth_yoy / 100 : null,
  };
}

function hist(label: string, xs: { grade: string }[]) {
  const c: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const x of xs) c[x.grade] = (c[x.grade] ?? 0) + 1;
  const n = xs.length || 1;
  console.log(`${label.padEnd(26)} n=${String(xs.length).padStart(4)}  ` + Object.entries(c).map(([g, k]) => `${g} ${String(Math.round((k / n) * 100)).padStart(2)}%`).join('  '));
}

async function main() {
  const rows = await allRows();
  const get = await statements(rows.map((r) => r.ticker));
  const results: { row: Row; hs: HealthScore; income: IncomeStatementPeriod[]; hasStatements: boolean }[] = [];
  for (const row of rows) {
    const income = get(row.ticker, 'income') as IncomeStatementPeriod[];
    const balance = get(row.ticker, 'balance') as BalanceSheetPeriod[];
    const cashflow = get(row.ticker, 'cashflow') as CashFlowPeriod[];
    const hs = computeHealthScore(statsFrom(row), income, balance, cashflow, { sector: row.sector });
    results.push({ row, hs, income, hasStatements: income.length >= 4 && balance.length > 0 });
  }

  const big = (r: (typeof results)[number]) => (r.row.market_cap ?? 0) >= 10e9;
  const scored = results.filter((r) => !r.hs.insufficientData);
  console.log(`\nMethod ${HEALTH_SCORE_METHOD}: ${results.length} stocks, ${results.filter((r) => r.hasStatements).length} with statements, ${scored.length} scored (${results.length - scored.length} left unscored: no balance sheet or cash flow)\n`);
  hist('old, all', rows.filter((r) => r.health_score_grade).map((r) => ({ grade: r.health_score_grade! })));
  hist('new, scored', scored.map((r) => ({ grade: r.hs.grade })));
  hist('old, >$10B', results.filter(big).filter((r) => r.row.health_score_grade).map((r) => ({ grade: r.row.health_score_grade! })));
  hist('new, >$10B scored', scored.filter(big).map((r) => ({ grade: r.hs.grade })));
  const avg = (xs: number[]) => (xs.reduce((a, b) => a + b, 0) / (xs.length || 1)).toFixed(1);
  console.log(`\navg old ${avg(rows.filter((r) => r.health_score != null).map((r) => r.health_score!))}  avg new ${avg(scored.map((r) => r.hs.score))}  avg new >$10B ${avg(scored.filter(big).map((r) => r.hs.score))}`);
  console.log(`>= 70 (Bull's "financially healthy"): ${scored.filter((r) => r.hs.score >= 70).length}, of which >$10B ${scored.filter(big).filter((r) => r.hs.score >= 70).length}`);

  const line = (r: (typeof results)[number]) => {
    const c = Object.fromEntries(r.hs.categories.map((x) => [x.name, x.dataAvailable === false ? ' -' : String(x.score).padStart(2)]));
    return `${r.row.ticker.padEnd(6)} ${String(r.row.health_score ?? '-').padStart(3)}${(r.row.health_score_grade ?? ' ').padStart(2)} -> ${r.hs.insufficientData ? '  - -' : `${String(r.hs.score).padStart(3)} ${r.hs.grade}`}prof ${c['Profitability']}/30  str ${c['Financial Strength']}/25  cash ${c['Cash Flow']}/20  grw ${c['Growth']}/15  risk ${c['Market Risk']}/10  ${r.hasStatements ? '' : '(stats only)'}`;
  };
  console.log('\nSpot checks (old -> new):');
  for (const t of SHOW) { const r = results.find((x) => x.row.ticker === t); if (r) console.log('  ' + line(r)); }
  const sorted = scored.filter(big).sort((a, b) => b.hs.score - a.hs.score);
  console.log('\nTop 15 over $10B:');
  for (const r of sorted.slice(0, 15)) console.log('  ' + line(r));
  console.log('\nBottom 15 over $10B:');
  for (const r of sorted.slice(-15)) console.log('  ' + line(r));

  if (DRY) { console.log('\n--dry-run: nothing written'); return; }

  let written = 0;
  const today = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < results.length; i += 500) {
    const batch = results.slice(i, i + 500);
    const { error } = await supabase.from('screener_stats').upsert(
      // An upsert inserts first, so NOT NULL columns must ride along; name is unchanged.
      batch.map(({ row, hs }) => ({ ticker: row.ticker, name: row.name, ...healthColumns(hs) })),
      { onConflict: 'ticker' },
    );
    if (error) throw new Error(error.message);
    written += batch.length;
    const snaps = batch
      .filter((r) => r.income[0]?.fiscal_date && !r.hs.insufficientData)
      .map(({ row, hs, income }) => ({ ticker: row.ticker, fiscal_date: income[0].fiscal_date, snapshot_date: today, score: hs.score, grade: hs.grade, categories: hs.categories, method: HEALTH_SCORE_METHOD }));
    if (snaps.length > 0) {
      const { error: hErr } = await supabase.from('health_score_history').upsert(snaps, { onConflict: 'ticker,fiscal_date' });
      if (hErr) throw new Error(hErr.message);
    }
  }
  console.log(`\nwrote ${written} scores (method ${HEALTH_SCORE_METHOD}), no notifications sent`);
}

main().catch((e) => { console.error(e); process.exit(1); });
