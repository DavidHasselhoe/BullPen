/**
 * npx tsx scripts/test-compare-verdict.ts
 *
 * Compare's plain-English verdict and the crawlable pair list. Fails on: a
 * verdict that crowns a company it shouldn't (all shrank, all lost money,
 * a tie, P/E where lower wins), and a curated pair whose ticker the cron does
 * not keep warm (a crawl of it would hit a cold cache and redirect).
 */
import assert from 'node:assert/strict';
import type { TFunction } from 'i18next';
import { buildVerdict } from '../lib/compare/verdict';
import { POPULAR_PAIRS, parsePairSlug, curatedOrder, pairSlug } from '../lib/compare/popular-pairs';
import { SIGNIFICANT_TICKERS } from '../lib/market-data/significant-tickers';
import type { CompareCompany } from '../lib/compare/fetch-compare-company';

// Echo the key and its name/context, so assertions read which sentence was picked.
const t = ((key: string, o?: { name?: string; context?: string }) =>
  [key, o?.context, o?.name].filter(Boolean).join('|')) as unknown as TFunction;

function company(ticker: string, m: Partial<CompareCompany['metrics']>, market: Partial<NonNullable<CompareCompany['market']>> = {}): CompareCompany {
  return {
    ticker, name: ticker, sector: null, industry: null, description: null, logo_url: null, employee_count: null,
    fiscal_year_end: null, sic_code: null, incorporation_location: null, fx: null, metricsBasis: null, growthYear: null,
    market: { healthScore: null, healthGrade: null, peRatio: null, dividendYield: null, marketCap: null, ...market },
    metrics: {
      revenue: null, grossProfit: null, grossMargin: null, operatingIncome: null, operatingMargin: null, netIncome: null,
      netMargin: null, epsDiluted: null, freeCashFlow: null, totalAssets: null, shareholdersEquity: null, revenueGrowth: null, ...m,
    },
    history: [],
  };
}
const row = (rows: ReturnType<typeof buildVerdict>, key: string) => rows.find((r) => r.key === key);

// Lower P/E wins; higher margin wins; leader is marked.
let v = buildVerdict([company('A', { netMargin: 28 }, { peRatio: 39 }), company('B', { netMargin: 41 }, { peRatio: 25 })], t);
assert.equal(row(v, 'price')?.headline, 'compareVerdict_price|pair|B');
assert.equal(row(v, 'profit')?.headline, 'compareVerdict_profit|pair|B');
assert.deepEqual(row(v, 'profit')?.values.map((x) => x.leads), [false, true]);

// Everyone shrank: nobody "grew faster".
v = buildVerdict([company('A', { revenueGrowth: -3 }), company('B', { revenueGrowth: -9 })], t);
assert.equal(row(v, 'growth')?.headline, 'compareVerdictNoneAll_growth|pair|A');
assert.ok(row(v, 'growth')!.values.every((x) => !x.leads));

// Everyone lost money: nobody "keeps more as profit".
v = buildVerdict([company('A', { netMargin: -5 }), company('B', { netMargin: -20 }), company('C', { netMargin: -1 })], t);
assert.ok(row(v, 'profit')?.headline.startsWith('compareVerdictNoneAll_profit|group'));

// Same as shown is a tie (93.4 and 92.6 both read 93).
v = buildVerdict([company('A', {}, { healthScore: 93.4, healthGrade: 'A' }), company('B', {}, { healthScore: 92.6, healthGrade: 'A' })], t);
assert.equal(row(v, 'health')?.headline, 'compareVerdictTie');

// One value is not a comparison: the row is left out, not guessed.
v = buildVerdict([company('A', { revenue: 5e9 }), company('B', {})], t);
assert.equal(row(v, 'size'), undefined);

// Pair slugs.
assert.deepEqual(parsePairSlug('aapl-vs-msft'), ['AAPL', 'MSFT']);
assert.deepEqual(parsePairSlug('brk.b-vs-aig'), ['BRK.B', 'AIG']);
assert.equal(parsePairSlug('aapl-vs-aapl'), null);
assert.equal(parsePairSlug('nonsense'), null);
assert.deepEqual(curatedOrder('MSFT', 'AAPL'), ['AAPL', 'MSFT']);
assert.equal(pairSlug('AAPL', 'MSFT'), 'aapl-vs-msft');

// Every curated ticker is one the cron keeps warm, and no pair is listed twice.
const missing = POPULAR_PAIRS.flat().filter((tk) => !SIGNIFICANT_TICKERS.has(tk));
assert.deepEqual(missing, [], `not in S&P 500 / Nasdaq 100: ${missing.join(', ')}`);
const keys = POPULAR_PAIRS.map(([a, b]) => [a, b].sort().join('-'));
assert.equal(new Set(keys).size, keys.length, 'a pair is listed twice');

console.log(`ok - verdict cases and ${POPULAR_PAIRS.length} curated pairs`);
