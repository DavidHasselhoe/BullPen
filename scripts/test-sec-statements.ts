/**
 * SEC statement rows (lib/edgar/sec-statements.ts): merge rules, then the
 * mapping checked field by field against TwelveData's cached quarters.
 *
 *   npm run test-sec-statements            merge rules only
 *   npm run test-sec-statements -- --live  plus the Nasdaq-100 comparison (free:
 *                                          EDGAR + cached TwelveData rows, no credits)
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import assert from 'node:assert/strict';
import { buildRows, mergeSecRows, missingRequired } from '../lib/edgar/sec-statements';
import { fetchSubmissions } from '../lib/edgar/edgar-watch';
import { resolveCik } from '../lib/segments/cik';
import { getCachedStale } from '../lib/cache/market-data-cache';
import { NASDAQ100_TICKERS } from '../lib/market-data/nasdaq100';
import { sleep } from '../lib/utils';

type R = { fiscal_date: string; source?: 'sec' } & Record<string, unknown>;
const td = (fiscal_date: string, revenue: number | null, eps = 1): R => ({ fiscal_date, revenue, eps_diluted: eps, ebitda: 5 });
const sec = (fiscal_date: string, revenue: number, eps: number | null = 2): R => ({ fiscal_date, revenue, eps_diluted: eps, ebitda: null, source: 'sec' });

function mergeRules() {
  const base = [td('2026-06-30', 10), td('2026-03-31', 9), td('2025-12-31', 8), td('2025-09-30', 7)];

  // A newer quarter is added, the oldest drops, length stays.
  let out = mergeSecRows(base, [sec('2026-09-27', 11)], 'income');
  assert.deepEqual(out.map((r) => r.fiscal_date), ['2026-09-27', '2026-06-30', '2026-03-31', '2025-12-31']);
  assert.equal(out[0].source, 'sec');

  // TwelveData wins where it has the quarter (dates within a month are one quarter).
  out = mergeSecRows(base, [sec('2026-06-27', 99)], 'income');
  assert.equal(out[0].revenue, 10);

  // A stub row is filled, keeping TwelveData's own values and date.
  out = mergeSecRows([td('2026-06-30', null, 5.75), ...base.slice(1)], [sec('2026-06-30', 200)], 'income');
  assert.equal(out[0].revenue, 200);
  assert.equal(out[0].eps_diluted, 5.75);
  assert.equal(out[0].source, undefined);

  // A SEC row missing a field TwelveData's rows carry is not added (EBITDA exempt).
  out = mergeSecRows(base, [sec('2026-09-27', 11, null)], 'income');
  assert.equal(out[0].fiscal_date, '2026-06-30');

  // Older than TwelveData's newest: not ours to add.
  out = mergeSecRows(base.slice(0, 2), [sec('2025-12-31', 8)], 'income');
  assert.equal(out.length, 2);

  // Idempotent, and TwelveData catching up replaces the SEC row.
  const once = mergeSecRows(base, [sec('2026-09-27', 11)], 'income');
  assert.deepEqual(mergeSecRows(once, [sec('2026-09-27', 11)], 'income'), once);
  const caughtUp = mergeSecRows([td('2026-09-30', 12), ...once.filter((r) => r.source !== 'sec')], [sec('2026-09-27', 11)], 'income');
  assert.equal(caughtUp[0].revenue, 12);

  // Quarter from year-to-date: 9 months minus 6 months, and a 10-K's Q4 EPS is never derived.
  const f = (start: string, end: string, val: number, form = '10-Q') => ({ start, end, val, accn: 'a', form, filed: '2026-10-30', fy: 2026, fp: 'Q3' });
  const facts = {
    Revenues: { units: { USD: [f('2026-07-01', '2026-09-30', 30)] } },
    NetCashProvidedByUsedInOperatingActivities: { units: { USD: [f('2026-01-01', '2026-09-30', 90), f('2026-01-01', '2026-06-30', 55)] } },
    EarningsPerShareDiluted: { units: { 'USD/shares': [f('2025-01-01', '2025-12-31', 4, '10-K')] } },
  };
  const rows = buildRows(facts, ['2026-09-30']);
  assert.equal(rows.income[0].revenue, 30);
  assert.equal(rows.cashflow[0].operating_cash_flow, 35);
  assert.equal(buildRows(facts, ['2025-12-31']).income.length, 0);
  console.log('merge rules: ok');
}

const FIELDS = {
  income: ['revenue', 'gross_profit', 'operating_income', 'net_income', 'eps_basic', 'eps_diluted', 'r_and_d_expenses', 'selling_general_administrative_expenses', 'interest_expense', 'income_tax_expense'],
  balance: ['total_assets', 'total_current_assets', 'cash_and_equivalents', 'total_liabilities', 'total_current_liabilities', 'long_term_debt', 'total_stockholders_equity', 'retained_earnings', 'goodwill_and_intangible_assets'],
  cashflow: ['net_income', 'depreciation_and_amortization', 'operating_cash_flow', 'free_cash_flow', 'investing_activities_cash_flow', 'financing_activities_cash_flow', 'dividends_paid'],
} as const;

async function live() {
  const ua = process.env.SEC_EDGAR_USER_AGENT || 'BullPen contact@bullpeninvest.com';
  const stats = new Map<string, { same: number; differ: number; secNull: number; tdNull: number }>();
  const differs: string[] = [];
  const coverage = new Map<string, { pass: number; fail: number; blockedBy: Map<string, string[]> }>();
  const seen = new Set<string>();
  for (const ticker of NASDAQ100_TICKERS) {
    const cik = await resolveCik(ticker);
    if (!cik || seen.has(cik)) continue;
    seen.add(cik);
    const cached = Object.fromEntries(await Promise.all((['income', 'balance', 'cashflow'] as const).map(async (t) =>
      [t, ((await getCachedStale<R[]>(`financials:${ticker}:${t}:quarterly`)) ?? []).filter((r) => r.source !== 'sec')])));
    if (!cached.income.length) continue;
    const { filings } = await fetchSubmissions(cik);
    const ends = [...new Set(filings.filter((x) => /^10-[QK]/.test(x.form) && x.reportDate).map((x) => x.reportDate))];
    const res = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, { headers: { 'User-Agent': ua } });
    await sleep(250);
    if (!res.ok) continue;
    const facts = ((await res.json()) as { facts?: { 'us-gaap'?: Parameters<typeof buildRows>[0] } }).facts?.['us-gaap'];
    if (!facts) continue;
    for (const type of ['income', 'balance', 'cashflow'] as const) {
      // Coverage: pretend TwelveData lacks its newest quarter. Would the SEC row stand in?
      const rows = cached[type] as R[];
      const newestEnd = rows[0] && ends.find((e) => Math.abs(Date.parse(e) - Date.parse(rows[0].fiscal_date)) <= 31 * 86_400_000);
      if (newestEnd) {
        const s = buildRows(facts, [newestEnd])[type] as unknown as R[];
        const merged = mergeSecRows(rows.slice(1), s, type);
        const c = coverage.get(type) ?? { pass: 0, fail: 0, blockedBy: new Map<string, string[]>() };
        coverage.set(type, c);
        if (merged[0]?.source === 'sec') c.pass++;
        else {
          c.fail++;
          const t = rows.slice(1).find((r) => r[FIELDS[type][0]] != null);
          const missing = !s[0] ? ['(no row)'] : missingRequired(t, s[0], type);
          for (const m of missing) c.blockedBy.set(m, [...(c.blockedBy.get(m) ?? []), ticker]);
        }
      }
      for (const row of rows) {
        const end = ends.find((e) => Math.abs(Date.parse(e) - Date.parse(row.fiscal_date)) <= 31 * 86_400_000);
        if (!end) continue;
        const s = buildRows(facts, [end])[type][0] as unknown as R | undefined;
        for (const field of FIELDS[type]) {
          const k = `${type}.${field}`;
          const st = stats.get(k) ?? { same: 0, differ: 0, secNull: 0, tdNull: 0 };
          stats.set(k, st);
          const a = row[field] as number | null, b = (s?.[field] ?? null) as number | null;
          if (a == null) { st.tdNull++; continue; }
          if (b == null) { st.secNull++; continue; }
          const tol = field.startsWith('eps') ? 0.011 : Math.max(Math.abs(a) * 0.005, 1e6);
          if (Math.abs(a - b) <= tol) st.same++;
          else { st.differ++; differs.push(`${ticker} ${row.fiscal_date} ${k}: TD ${a} SEC ${b}`); }
        }
      }
    }
  }
  console.log('\nfield                                   same  differ  secNull  tdNull');
  for (const [k, s] of stats) console.log(`${k.padEnd(40)}${String(s.same).padStart(4)}${String(s.differ).padStart(8)}${String(s.secNull).padStart(9)}${String(s.tdNull).padStart(8)}`);
  console.log('\nWould stand in for a missing newest quarter:');
  for (const [type, c] of coverage) {
    console.log(`  ${type}: ${c.pass} of ${c.pass + c.fail}, blocked by:`);
    for (const [k, t] of [...c.blockedBy].sort((a, b) => b[1].length - a[1].length)) console.log(`    ${k} ${t.length}: ${t.join(' ')}`);
  }
  console.log(`\n${differs.length} differences:`);
  for (const d of differs) console.log('  ' + d);
}

mergeRules();
if (process.argv.includes('--live')) live().catch((e) => { console.error(e); process.exit(1); });
