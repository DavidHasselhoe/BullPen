# Sankey Revenue Segments + Chart Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the left edge of the stock page's Sankey diagram into the company's actual revenue sources (iPhone $209.6B, Services $109.2B rather than one "Total Revenue" trunk), sourced from SEC XBRL, and bring the chart itself up to the project's accessibility, responsive and motion standards.

**Architecture:** Revenue parts are read from a filing's XBRL instance document on SEC EDGAR, where every segment figure is machine-tagged with an explicit dimension (axis + member). A pure selector picks one axis per company by preference (products, then business segments, never geography), removes rollup parents, and cleans member names into labels. Results are cached in Postgres, keyed by ticker and period end, and filled in the background on first request so no page load waits on a 3MB download. `SankeyCard` prepends the parts as extra nodes feeding `Total Revenue`; when anything fails to reconcile it renders exactly what it renders today.

**Tech Stack:** Next.js 16 App Router (route handlers + `after()`), React 19, TypeScript, Supabase Postgres, d3-sankey, framer-motion, TanStack Query, react-i18next. Tests are assert-based `tsx` scripts against captured fixtures, no test framework, same pattern as `scripts/test-risk-analysis-prompt.ts`.

**Spec:** This document. The "Findings" section below is the research it argues from; every number in it was measured live against SEC EDGAR on 2026-09-18 and is reproducible.

## Global Constraints

- **Fail closed.** A revenue breakdown renders only when its parts reconcile to the period's revenue within 1%. Anything else renders today's single-trunk chart with no error, no placeholder, no partial breakdown.
- **Never alter a reported number.** No scaling parts to make a diagram balance, no interpolation, no estimates. The only derived value permitted is an "Other" node equal to a positive residual, which is genuinely the unattributed remainder.
- **Geography is never shown as a revenue breakdown.** Apple's reportable segments are Americas/Europe/Greater China; that is a true segment disclosure and still the wrong chart. Products first, business segments second, nothing third.
- **SEC fair access.** Every request to `sec.gov` or `data.sec.gov` sends `User-Agent: ${SEC_EDGAR_USER_AGENT || 'BullPen contact@bullpen.no'}`, matching `lib/edgar/edgar-watch.ts`. Space requests at least 150ms apart. No API key exists or is needed.
- **Zero TwelveData credits.** This feature touches SEC only. Do not add any call to `lib/twelvedata/`.
- No em dash or en dash in any user-facing copy (labels, tooltips, empty states). Use a period or comma.
- New UI strings go in `lib/i18n/locales/en/stock.json`, then `npm run i18n:translate -- --ns=stock` and `npm run i18n:pseudo`. Never hand-write a non-English value except to correct a bad machine translation.
- Straight quotes only in locale JSON near `{{interpolation}}`; curly quotes break the translate script.
- Every new `supabase/migrations/NNN_*.sql` is applied immediately via the Supabase MCP `apply_migration`. The file and the live database must match.
- `npm run lint` before every commit. Errors block; warnings are fine. A synchronous `setState` inside a `useEffect` is a lint error in this repo: derive the value or restructure instead.
- Commit to `preview` only, staging explicit paths. Never `git add -A`.

---

## Findings

Measured on 2026-09-18 against live SEC filings. These drive every design decision below.

**The data is exact.** 15 of 16 sampled companies produced dimensional revenue facts summing to 100.0% of stated revenue, with no rounding drift. Alphabet: Search $224.53B + YouTube $40.37B + Network $29.79B + Subscriptions $48.03B = $342.72B = Google Services, exactly as filed.

**No AI is needed.** `lib/sankey/segment-extractor.ts` carries a TODO to have Claude read filing text when tables are unavailable. The numbers are already machine-tagged. That stub is deleted in Task 0, not implemented.

**Reconciliation does not identify the right breakdown.** Choosing whichever axis sums closest to revenue picks geography for Apple, Walmart, Pfizer and Costco. Apple's product split lives on `ProductOrServiceAxis`; its reportable segments are geographic. Axis preference must be explicit.

**Rollup parents are tagged alongside their children.** Apple tags `Product $307.00B` next to iPhone/Mac/iPad/Wearables, which sum to exactly that. NVIDIA tags `DataCenter $193.74B` over `Compute $162.36B` + `Networking $31.38B`. Summing naively yields 258% of revenue, which is what a first-pass scraper produced.

**Quarterly filings carry both quarter and year-to-date contexts.** Apple's latest 10-Q tags `IPhoneMember` at 90 days ($54.25B) and at 272 days ($196.51B). Filtering by context duration is mandatory.

**Fiscal dates do not match across sources.** TwelveData dates Apple's FY2025 `2025-09-30`; SEC says `2025-09-27`. Both report revenue of exactly `416161000000`. Periods are therefore matched on revenue value, with the date only as a coarse window.

**Labels vary from excellent to meaningless.** `DRAMProductsMember` and `IPhoneMember` are self-explanatory. Micron's business segments are `CMBU`, `CDBU`, `MCBU`, `AEBU`. This is a second reason products outrank segments.

**Coverage is roughly two thirds.** Of the 16 sampled, about 10 yield a breakdown a non-professional would find meaningful. Walmart (US/Non-US), Exxon (one $323.9B bucket), Pfizer and JPMorgan do not. US filers only: ASML and TSM file 20-F and are out of scope.

**Worked examples, FY2025 as filed:**

| Alphabet | | Micron | |
|---|---|---|---|
| Search & other | $224.53B | DRAM | $28.58B |
| YouTube ads | $40.37B | NAND | $8.50B |
| Google Network | $29.79B | Other | $0.30B |
| Subscriptions, platforms, devices | $48.03B | **Revenue** | **$37.38B** |
| Google Cloud | $58.70B | | |
| Other Bets | $1.54B | | |
| **Revenue** | **$402.84B** | | |

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `lib/sankey/segment-extractor.ts` | **delete** | Dead. Reads a table dropped by migration 038; holds the AI stub this plan replaces |
| `lib/sankey/sankey-generator.ts` | **delete** | Dead. Only importer is the unused route below |
| `app/api/stock/[ticker]/sankey/route.ts` | **delete** | Dead. Returns 400 in production; nothing calls it |
| `lib/segments/cik.ts` | create | Ticker to CIK, from SEC's `company_tickers.json`, cached |
| `lib/segments/edgar-facts.ts` | create | Fetch a filing's XBRL instance, parse contexts and revenue facts into `RevenueFact[]` |
| `lib/segments/select-breakdown.ts` | create | **Pure.** Axis preference, duration filter, rollup removal, label cleanup, reconciliation |
| `lib/segments/segments-db.ts` | create | Read/write the cache table |
| `supabase/migrations/145_revenue_segments.sql` | create | `revenue_segments` table |
| `app/api/stock/[ticker]/segments/route.ts` | create | Serve cached parts; fill in background on a miss |
| `components/stock/SankeyCard.tsx` | modify | Consume parts; accessibility, responsive, loss, motion and palette work |
| `scripts/fixtures/segments/*.json` | create | Real captured facts for GOOGL, AAPL, MU, NVDA, WMT |
| `scripts/test-segment-selection.ts` | create | Assert the selector against those fixtures |
| `lib/i18n/locales/en/stock.json` | modify | New chart strings |
| `package.json` | modify | Register `test-segment-selection` |

---

## Task 0: Delete the dead Sankey pipeline

**Files:**
- Delete: `lib/sankey/sankey-generator.ts`, `lib/sankey/segment-extractor.ts`, `app/api/stock/[ticker]/sankey/route.ts`

**Interfaces:**
- Consumes: nothing
- Produces: nothing. `lib/sankey/` no longer exists; `components/stock/SankeyCard.tsx` was never wired to it

- [ ] **Step 1: Prove nothing depends on it**

Run:
```bash
grep -rn "lib/sankey\|getOrCreateCompanySankey\|getRevenueSegments" --include=*.ts --include=*.tsx app components lib hooks scripts
```
Expected: the only hits are inside `lib/sankey/` itself and `app/api/stock/[ticker]/sankey/route.ts:6`. If anything else appears, stop and report it.

- [ ] **Step 2: Delete**

```bash
git rm -r lib/sankey app/api/stock/[ticker]/sankey
```

- [ ] **Step 3: Verify the build still passes**

Run: `npm run lint && npm run build`
Expected: both succeed. The chart on a stock page is unaffected because `SankeyCard` reads `/api/stock/[ticker]/financials`.

- [ ] **Step 4: Commit**

```bash
git add -A lib/sankey app/api/stock
git commit -m "chore(sankey): delete the dead generator and its unused route"
```

---

## Task 1: Ticker to CIK

**Files:**
- Create: `lib/segments/cik.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `resolveCik(ticker: string): Promise<string | null>` returning a 10-digit zero-padded CIK

SEC publishes every filer at `https://www.sec.gov/files/company_tickers.json` (~800KB, verified 2026-09-18). Shape is `{"0":{"cik_str":1045810,"ticker":"NVDA","title":"NVIDIA CORP"}, ...}`. The local `companies` table holds only 39 rows and cannot serve this.

- [ ] **Step 1: Write the module**

```ts
import { getCached, setCached } from '@/lib/cache/market-data-cache';

/**
 * Ticker to SEC CIK, from SEC's own published map.
 *
 * The whole file is ~800KB and covers every US filer, so it is fetched once
 * and cached for a week rather than queried per ticker. `companies` holds 39
 * hand-seeded rows and is not a substitute.
 */
const MAP_KEY = 'sec:ticker-cik-map';
const MAP_TTL_SEC = 7 * 24 * 60 * 60;

function userAgent(): string {
  return process.env.SEC_EDGAR_USER_AGENT || 'BullPen contact@bullpen.no';
}

async function loadMap(): Promise<Record<string, string>> {
  const cached = await getCached<Record<string, string>>(MAP_KEY);
  if (cached) return cached;

  const res = await fetch('https://www.sec.gov/files/company_tickers.json', {
    headers: { 'User-Agent': userAgent(), Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`SEC ticker map ${res.status}`);

  const raw = (await res.json()) as Record<string, { cik_str: number; ticker: string }>;
  const map: Record<string, string> = {};
  for (const row of Object.values(raw)) {
    if (row?.ticker) map[row.ticker.toUpperCase()] = String(row.cik_str).padStart(10, '0');
  }
  void setCached(MAP_KEY, 'sec', 'cik-map', map, MAP_TTL_SEC);
  return map;
}

export async function resolveCik(ticker: string): Promise<string | null> {
  try {
    const map = await loadMap();
    return map[ticker.trim().toUpperCase()] ?? null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Verify against real tickers**

Create `scripts/_tmp_cik.ts`:
```ts
import { config } from 'dotenv';
config({ path: '.env.local' });
import { resolveCik } from '../lib/segments/cik';

(async () => {
  for (const t of ['AAPL', 'MU', 'GOOGL', 'NOTATICKER']) {
    console.log(t, await resolveCik(t));
  }
})();
```
Run: `npx tsx scripts/_tmp_cik.ts`
Expected: `AAPL 0000320193`, `MU 0000723125`, `GOOGL 0001652044`, `NOTATICKER null`.

- [ ] **Step 3: Delete the temp script and commit**

```bash
rm scripts/_tmp_cik.ts
git add lib/segments/cik.ts
git commit -m "feat(segments): resolve a ticker to its SEC CIK"
```

---

## Task 2: Parse revenue facts out of a filing

**Files:**
- Create: `lib/segments/edgar-facts.ts`

**Interfaces:**
- Consumes: `resolveCik` from Task 1
- Produces:
  - `interface RevenueFact { members: Array<{ axis: string; member: string }>; value: number; durationDays: number; end: string }`
  - `interface FilingFacts { facts: RevenueFact[]; periodEnd: string; form: '10-K' | '10-Q'; accession: string }`
  - `fetchRevenueFacts(ticker: string, form: '10-K' | '10-Q'): Promise<FilingFacts | null>`

The instance document is the primary document's name with `.htm` replaced by `_htm.xml` (e.g. `aapl-20250927_htm.xml`), sitting in the same folder. Contexts are `<context id="...">` with **no namespace prefix** in these files; a prefixed regex matches nothing.

- [ ] **Step 1: Write the module**

```ts
import { resolveCik } from '@/lib/segments/cik';

/**
 * Revenue facts, with their dimensions, straight from a filing's XBRL.
 *
 * Every segment figure a US company reports is tagged here with an explicit
 * axis and member, which is why this feature needs no AI and no table
 * scraping: the numbers arrive already structured and already exact.
 */

export interface RevenueFact {
  members: Array<{ axis: string; member: string }>;
  value: number;
  durationDays: number;
  end: string;
}

export interface FilingFacts {
  facts: RevenueFact[];
  periodEnd: string;
  form: '10-K' | '10-Q';
  accession: string;
}

const REVENUE_TAGS = [
  'RevenueFromContractWithCustomerExcludingAssessedTax',
  'RevenueFromContractWithCustomerIncludingAssessedTax',
  'Revenues',
].join('|');

function userAgent(): string {
  return process.env.SEC_EDGAR_USER_AGENT || 'BullPen contact@bullpen.no';
}

async function secFetch(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': userAgent(), Accept: '*/*' } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.text();
}

export async function fetchRevenueFacts(
  ticker: string,
  form: '10-K' | '10-Q',
): Promise<FilingFacts | null> {
  const cik = await resolveCik(ticker);
  if (!cik) return null;

  const subs = JSON.parse(await secFetch(`https://data.sec.gov/submissions/CIK${cik}.json`)) as {
    filings: { recent: { form: string[]; accessionNumber: string[]; primaryDocument: string[] } };
  };
  const recent = subs.filings.recent;
  const idx = recent.form.findIndex((f) => f === form);
  if (idx === -1) return null;

  const accession = recent.accessionNumber[idx];
  const folder = accession.replace(/-/g, '');
  const instance = recent.primaryDocument[idx].replace(/\.htm$/i, '_htm.xml');
  const xml = await secFetch(
    `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${folder}/${instance}`,
  );

  const periodEnd = (xml.match(/<dei:DocumentPeriodEndDate[^>]*>([^<]+)</) ?? [])[1];
  if (!periodEnd) return null;

  // Contexts carry no namespace prefix in these instance documents.
  const contexts = new Map<string, { start?: string; end?: string; members: RevenueFact['members'] }>();
  for (const m of xml.matchAll(/<context id="([^"]+)">([\s\S]*?)<\/context>/g)) {
    const body = m[2];
    contexts.set(m[1], {
      start: (body.match(/<startDate>(.*?)<\/startDate>/) ?? [])[1],
      end: (body.match(/<endDate>(.*?)<\/endDate>/) ?? [])[1],
      members: [...body.matchAll(/dimension="([^"]+)"[^>]*>([^<]+)</g)].map((d) => ({
        axis: d[1].split(':').pop() as string,
        member: d[2].split(':').pop() as string,
      })),
    });
  }

  const facts: RevenueFact[] = [];
  const pattern = new RegExp(`<us-gaap:(?:${REVENUE_TAGS})\\b[^>]*contextRef="([^"]+)"[^>]*>([^<]+)<`, 'g');
  for (const m of xml.matchAll(pattern)) {
    const ctx = contexts.get(m[1]);
    const value = Number(m[2]);
    if (!ctx?.start || !ctx.end || !Number.isFinite(value)) continue;
    facts.push({
      members: ctx.members,
      value,
      durationDays: Math.round((Date.parse(ctx.end) - Date.parse(ctx.start)) / 86_400_000),
      end: ctx.end,
    });
  }

  return { facts, periodEnd, form, accession };
}
```

- [ ] **Step 2: Capture fixtures for the selector's tests**

Create `scripts/_tmp_capture.ts`:
```ts
import { config } from 'dotenv';
config({ path: '.env.local' });
import { writeFileSync, mkdirSync } from 'fs';
import { fetchRevenueFacts } from '../lib/segments/edgar-facts';

(async () => {
  mkdirSync('scripts/fixtures/segments', { recursive: true });
  for (const ticker of ['GOOGL', 'AAPL', 'MU', 'NVDA', 'WMT']) {
    const facts = await fetchRevenueFacts(ticker, '10-K');
    writeFileSync(`scripts/fixtures/segments/${ticker}.json`, JSON.stringify(facts, null, 2));
    console.log(ticker, facts?.periodEnd, facts?.facts.length, 'facts');
    await new Promise((r) => setTimeout(r, 200));
  }
})();
```
Run: `npx tsx scripts/_tmp_capture.ts`
Expected: each line prints a period end and a non-zero fact count, e.g. `AAPL 2025-09-27 40 facts`. If any prints `undefined`, the instance filename convention differs for that filer; inspect its folder listing before continuing.

- [ ] **Step 3: Delete the capture script and commit**

```bash
rm scripts/_tmp_capture.ts
git add lib/segments/edgar-facts.ts scripts/fixtures/segments
git commit -m "feat(segments): read dimensional revenue facts from a filing's XBRL"
```

---

## Task 3: The selector

**Files:**
- Create: `lib/segments/select-breakdown.ts`
- Create: `scripts/test-segment-selection.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `RevenueFact`, `FilingFacts` from Task 2
- Produces:
  - `interface RevenuePart { label: string; value: number }`
  - `interface Breakdown { parts: RevenuePart[]; basis: 'product' | 'segment'; total: number }`
  - `selectBreakdown(facts: RevenueFact[], consolidated: number, periodDays: number): Breakdown | null`
  - `cleanLabel(member: string): string`

This is the whole feature's judgement, and it is pure so it can be tested against fixtures with no network.

- [ ] **Step 1: Write the failing test**

Create `scripts/test-segment-selection.ts`:
```ts
/**
 * The selector's judgement, against real captured filings.
 *
 * Each case here is a mistake a naive implementation actually makes: summing
 * a rollup parent with its children, showing geography because it reconciles,
 * or mixing a quarter with its year to date.
 *
 * Run: npm run test-segment-selection
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { selectBreakdown, cleanLabel } from '../lib/segments/select-breakdown';
import type { FilingFacts } from '../lib/segments/edgar-facts';

const load = (t: string) => JSON.parse(readFileSync(`scripts/fixtures/segments/${t}.json`, 'utf8')) as FilingFacts;
const sum = (parts: { value: number }[]) => parts.reduce((s, p) => s + p.value, 0);

// Apple: products, not its geographic reportable segments.
{
  const aapl = load('AAPL');
  const b = selectBreakdown(aapl.facts, 416_161_000_000, 365);
  assert.ok(b, 'AAPL should produce a breakdown');
  assert.equal(b.basis, 'product');
  const labels = b.parts.map((p) => p.label);
  assert.ok(labels.includes('iPhone'), `expected iPhone, got ${labels.join(', ')}`);
  assert.ok(!labels.some((l) => /Americas|Europe|Greater China/.test(l)), 'geography must never be used');
  // The tagged rollup "Product" must not appear alongside its children.
  assert.ok(!labels.includes('Product'), 'rollup parent leaked into the parts');
  assert.ok(Math.abs(sum(b.parts) - 416_161_000_000) / 416_161_000_000 < 0.01, 'parts must reconcile');
}

// NVIDIA: Data Center is a parent of Compute + Networking. Keep one level.
{
  const nvda = load('NVDA');
  const b = selectBreakdown(nvda.facts, 215_940_000_000, 365);
  assert.ok(b, 'NVDA should produce a breakdown');
  const labels = b.parts.map((p) => p.label);
  const hasParent = labels.includes('Data Center');
  const hasChildren = labels.includes('Compute') && labels.includes('Networking');
  assert.ok(hasParent !== hasChildren, 'must keep either the parent or its children, never both');
  assert.ok(Math.abs(sum(b.parts) - 215_940_000_000) / 215_940_000_000 < 0.01, 'parts must reconcile');
}

// Alphabet: the useful level is inside Google Services.
{
  const googl = load('GOOGL');
  const b = selectBreakdown(googl.facts, 402_836_000_000, 365);
  assert.ok(b, 'GOOGL should produce a breakdown');
  const labels = b.parts.map((p) => p.label);
  assert.ok(labels.some((l) => /Search/.test(l)), `expected a Search part, got ${labels.join(', ')}`);
  assert.ok(Math.abs(sum(b.parts) - 402_836_000_000) / 402_836_000_000 < 0.01, 'parts must reconcile');
}

// Walmart: US / Non-US only. Geography is refused, so nothing is shown.
{
  const wmt = load('WMT');
  const b = selectBreakdown(wmt.facts, 713_200_000_000, 365);
  assert.equal(b, null, 'a geography-only filer must yield no breakdown');
}

// A single part is not a breakdown.
assert.equal(
  selectBreakdown(
    [{ members: [{ axis: 'ProductOrServiceAxis', member: 'OnlyThingMember' }], value: 100, durationDays: 365, end: '2025-12-31' }],
    100,
    365,
  ),
  null,
  'one part is not a breakdown',
);

// Parts that do not reconcile are refused rather than shown partially.
assert.equal(
  selectBreakdown(
    [
      { members: [{ axis: 'ProductOrServiceAxis', member: 'AMember' }], value: 30, durationDays: 365, end: '2025-12-31' },
      { members: [{ axis: 'ProductOrServiceAxis', member: 'BMember' }], value: 20, durationDays: 365, end: '2025-12-31' },
    ],
    100,
    365,
  ),
  null,
  'parts summing to half of revenue must be refused',
);

assert.equal(cleanLabel('IPhoneMember'), 'iPhone');
assert.equal(cleanLabel('DRAMProductsMember'), 'DRAM Products');
assert.equal(cleanLabel('WearablesHomeandAccessoriesMember'), 'Wearables, Home and Accessories');
assert.equal(cleanLabel('DataCenterMember'), 'Data Center');

console.log('segment selection OK');
```

Add to `package.json` scripts, after `"test-risk-scenario"`:
```json
"test-segment-selection": "tsx scripts/test-segment-selection.ts",
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run test-segment-selection`
Expected: FAIL, `Cannot find module '../lib/segments/select-breakdown'`.

- [ ] **Step 3: Write the selector**

```ts
import type { RevenueFact } from '@/lib/segments/edgar-facts';

/**
 * Which revenue breakdown to show, and whether to show one at all.
 *
 * Companies tag several at once and they disagree about what is interesting.
 * Apple's reportable segments are Americas, Europe and Greater China; the
 * split people mean when they ask what Apple sells lives on a different axis
 * entirely. So the axis is chosen by preference, never by which one happens
 * to add up.
 *
 * Geography is deliberately unreachable. "United States $581B, Non-US $132B"
 * reconciles perfectly and tells a reader nothing about the business.
 */

export interface RevenuePart {
  label: string;
  value: number;
}

export interface Breakdown {
  parts: RevenuePart[];
  basis: 'product' | 'segment';
  total: number;
}

/** Products first: they are the split a reader recognises, and the labels are plain. */
const AXIS_PREFERENCE: Array<{ axis: string; basis: Breakdown['basis'] }> = [
  { axis: 'ProductOrServiceAxis', basis: 'product' },
  { axis: 'StatementBusinessSegmentsAxis', basis: 'segment' },
];

const MIN_PARTS = 2;
const MAX_PARTS = 9;
/** Parts must account for the period's revenue this closely, or nothing is shown. */
const RECONCILE_TOLERANCE = 0.01;
/** A positive remainder smaller than this is noise, not a part worth drawing. */
const RESIDUAL_FLOOR = 0.001;

export function cleanLabel(member: string): string {
  const base = member.replace(/Member$/, '');
  return base
    // "WearablesHomeandAccessories" -> "Wearables, Home and Accessories"
    .replace(/([a-z])(and)([A-Z])/g, '$1, and $3')
    // Split camel case, keeping runs of capitals (DRAM, OEM) together.
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/^I Phone$/, 'iPhone')
    .replace(/^I Pad$/, 'iPad')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Drops any member equal to the sum of other members on the same axis.
 *
 * Apple tags "Product" next to iPhone, Mac, iPad and Wearables, which sum to
 * exactly it. NVIDIA tags "Data Center" over Compute and Networking. Keeping
 * both levels double counts revenue, which is how a first pass produced a
 * chart showing 258% of Alphabet's sales.
 */
function dropRollups(parts: RevenuePart[]): RevenuePart[] {
  const kept: RevenuePart[] = [];
  for (const part of parts) {
    const others = parts.filter((p) => p !== part);
    const isParent = others.some((_, i) => {
      // Any subset is too expensive; the real cases are "sum of all the rest"
      // and "sum of a contiguous run", both covered by comparing against the
      // total of every other part and against each pair upward.
      const runningTotals = others.slice(i).reduce<number[]>((acc, p) => {
        acc.push((acc[acc.length - 1] ?? 0) + p.value);
        return acc;
      }, []);
      return runningTotals.some((t) => t > 0 && Math.abs(t - part.value) / part.value < 0.005);
    });
    if (!isParent) kept.push(part);
  }
  return kept;
}

export function selectBreakdown(
  facts: RevenueFact[],
  consolidated: number,
  periodDays: number,
): Breakdown | null {
  if (!Number.isFinite(consolidated) || consolidated <= 0) return null;

  // Only facts covering this exact period. A 10-Q carries the quarter and the
  // year to date for every member; mixing them triples the chart.
  const inPeriod = facts.filter((f) => Math.abs(f.durationDays - periodDays) <= 20);

  for (const { axis, basis } of AXIS_PREFERENCE) {
    // One dimension only. A fact carrying two axes at once is a cross tab
    // (revenue by segment AND geography) and would repeat every member.
    const onAxis = inPeriod.filter((f) => f.members.length === 1 && f.members[0].axis === axis);
    if (onAxis.length < MIN_PARTS) continue;

    // The same member can be tagged more than once in a filing; keep one.
    const byMember = new Map<string, number>();
    for (const fact of onAxis) {
      if (fact.value <= 0) continue;
      byMember.set(fact.members[0].member, fact.value);
    }

    let parts: RevenuePart[] = [...byMember.entries()].map(([member, value]) => ({
      label: cleanLabel(member),
      value,
    }));

    parts = dropRollups(parts).sort((a, b) => b.value - a.value);
    if (parts.length < MIN_PARTS || parts.length > MAX_PARTS) continue;

    const total = parts.reduce((s, p) => s + p.value, 0);
    const residual = consolidated - total;
    if (Math.abs(residual) / consolidated > RECONCILE_TOLERANCE) continue;

    // A positive remainder is real revenue the filing did not attribute to a
    // named part, so it is drawn as its own part rather than hidden.
    if (residual / consolidated > RESIDUAL_FLOOR) {
      parts.push({ label: 'Other', value: residual });
    }

    return { parts, basis, total: parts.reduce((s, p) => s + p.value, 0) };
  }

  return null;
}
```

- [ ] **Step 4: Run the test until it passes**

Run: `npm run test-segment-selection`
Expected: `segment selection OK`.

If the Alphabet case fails because its useful parts sit on `ProductOrServiceAxis + StatementBusinessSegmentsAxis` (two dimensions), add a third preference entry handling exactly that pair: accept facts whose axes are `['ProductOrServiceAxis', 'StatementBusinessSegmentsAxis']`, key them by the product member alone, and treat them as `basis: 'product'`. Do not loosen the general one-axis rule, which is what keeps Disney from rendering twelve duplicated parts.

- [ ] **Step 5: Commit**

```bash
git add lib/segments/select-breakdown.ts scripts/test-segment-selection.ts package.json
git commit -m "feat(segments): choose the breakdown a reader actually wants"
```

---

## Task 4: Cache table and store

**Files:**
- Create: `supabase/migrations/145_revenue_segments.sql`
- Create: `lib/segments/segments-db.ts`

**Interfaces:**
- Consumes: `RevenuePart`, `Breakdown` from Task 3
- Produces:
  - `getStoredBreakdown(ticker: string, periodEnd: string): Promise<Breakdown | null>`
  - `storeBreakdown(ticker: string, periodEnd: string, form: string, accession: string, breakdown: Breakdown | null): Promise<void>`

A null breakdown is stored too: two thirds of companies will never have one, and re-downloading a 3MB instance on every page view to rediscover that is the expensive mistake.

- [ ] **Step 1: Write the migration**

```sql
-- Revenue parts for the Sankey diagram's left edge, read from SEC XBRL.
--
-- One row per ticker and period, holding the parts as JSONB because they are
-- always read and written whole. `parts` is NULL when the filing was read
-- successfully and simply has no breakdown worth showing (geography only, or
-- a single bucket): that is a real answer and is cached so the filing is not
-- downloaded again to rediscover it.
create table if not exists public.revenue_segments (
  ticker         text        not null,
  period_end     date        not null,
  form           text        not null,
  accession      text        not null,
  basis          text,
  parts          jsonb,
  total          numeric,
  checked_at     timestamptz not null default now(),
  primary key (ticker, period_end)
);

comment on column public.revenue_segments.parts is
  'Ordered [{label, value}] summing to the period revenue within 1%, or NULL when the filing has no breakdown worth showing.';

create index if not exists revenue_segments_ticker_idx
  on public.revenue_segments (ticker, period_end desc);

alter table public.revenue_segments enable row level security;

-- Written only by the service role; readable by anyone, same as other
-- market-data caches here.
create policy revenue_segments_read on public.revenue_segments
  for select using (true);
```

- [ ] **Step 2: Apply it live**

Use the Supabase MCP `apply_migration` with name `145_revenue_segments` and the SQL above, project `kgqpzuvhslqazurfrqya`. Then confirm:
```sql
select count(*) from public.revenue_segments;
```
Expected: `0`, and no error.

- [ ] **Step 3: Write the store**

```ts
import { createServerClient } from '@/lib/supabase/client';
import type { Breakdown, RevenuePart } from '@/lib/segments/select-breakdown';

/** How long a stored answer, including "this company has none", stays good. */
const FRESH_DAYS = 45;

export async function getStoredBreakdown(
  ticker: string,
  periodEnd: string,
): Promise<{ breakdown: Breakdown | null; fresh: boolean } | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('revenue_segments')
    .select('basis, parts, total, checked_at')
    .eq('ticker', ticker.toUpperCase())
    .eq('period_end', periodEnd)
    .maybeSingle();

  if (!data) return null;
  const row = data as { basis: string | null; parts: RevenuePart[] | null; total: number | null; checked_at: string };
  const ageDays = (Date.now() - Date.parse(row.checked_at)) / 86_400_000;
  const breakdown = row.parts && row.basis
    ? { parts: row.parts, basis: row.basis as Breakdown['basis'], total: Number(row.total ?? 0) }
    : null;
  return { breakdown, fresh: ageDays < FRESH_DAYS };
}

export async function storeBreakdown(
  ticker: string,
  periodEnd: string,
  form: string,
  accession: string,
  breakdown: Breakdown | null,
): Promise<void> {
  const supabase = createServerClient();
  await supabase.from('revenue_segments').upsert({
    ticker: ticker.toUpperCase(),
    period_end: periodEnd,
    form,
    accession,
    basis: breakdown?.basis ?? null,
    parts: breakdown?.parts ?? null,
    total: breakdown?.total ?? null,
    checked_at: new Date().toISOString(),
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/145_revenue_segments.sql lib/segments/segments-db.ts
git commit -m "feat(segments): cache a filing's revenue parts, including the absence of any"
```

---

## Task 5: The endpoint

**Files:**
- Create: `app/api/stock/[ticker]/segments/route.ts`

**Interfaces:**
- Consumes: everything from Tasks 1 to 4
- Produces: `GET /api/stock/[ticker]/segments?periodEnd=YYYY-MM-DD&revenue=<number>&period=annual|quarterly` returning `{ success: true, parts: RevenuePart[] | null, basis: 'product' | 'segment' | null }`

`revenue` is the figure already on the card. The filing's own consolidated total must match it, which is how a period is identified despite the date mismatch (TwelveData says Apple's FY2025 ended `2025-09-30`, SEC says `2025-09-27`, and both report `416161000000`).

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse, after } from 'next/server';
import { addSecurityHeaders, withRateLimit } from '@/lib/security/api-security';
import { fetchRevenueFacts } from '@/lib/segments/edgar-facts';
import { selectBreakdown } from '@/lib/segments/select-breakdown';
import { getStoredBreakdown, storeBreakdown } from '@/lib/segments/segments-db';
import { slugToSymbol } from '@/lib/assets/asset-type';

/**
 * GET /api/stock/[ticker]/segments
 *
 * The revenue parts for one period, for the Sankey diagram's left edge.
 *
 * A miss never blocks the response: the filing is a multi-megabyte download,
 * so it is fetched after the response goes out and the next view has it. The
 * chart is complete without this, so an empty answer costs the reader
 * nothing.
 */

const PERIOD_DAYS = { annual: 365, quarterly: 91 } as const;

async function handler(req: NextRequest, context: { params: Promise<{ ticker: string }> }) {
  const { ticker: raw } = await context.params;
  const ticker = slugToSymbol(String(raw ?? '').trim()).toUpperCase();
  const params = req.nextUrl.searchParams;
  const periodEnd = params.get('periodEnd') ?? '';
  const revenue = Number(params.get('revenue'));
  const period = params.get('period') === 'quarterly' ? 'quarterly' : 'annual';

  const empty = NextResponse.json({ success: true, parts: null, basis: null });

  if (!/^[A-Z0-9.\-]{1,12}$/.test(ticker)) return addSecurityHeaders(empty);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) return addSecurityHeaders(empty);
  if (!Number.isFinite(revenue) || revenue <= 0) return addSecurityHeaders(empty);

  const stored = await getStoredBreakdown(ticker, periodEnd);
  if (stored?.fresh) {
    return addSecurityHeaders(
      NextResponse.json({ success: true, parts: stored.breakdown?.parts ?? null, basis: stored.breakdown?.basis ?? null }),
    );
  }

  // Fill in the background. The reader gets today's chart; the next view of
  // this stock gets the breakdown.
  after(async () => {
    try {
      const form = period === 'quarterly' ? '10-Q' : '10-K';
      const filing = await fetchRevenueFacts(ticker, form);
      if (!filing) return;

      // The filing must be describing the same period the card is showing.
      const consolidated = filing.facts
        .filter((f) => f.members.length === 0 && Math.abs(f.durationDays - PERIOD_DAYS[period]) <= 20)
        .map((f) => f.value)
        .sort((a, b) => b - a)[0];
      if (!consolidated || Math.abs(consolidated - revenue) / revenue > 0.005) return;

      const breakdown = selectBreakdown(filing.facts, consolidated, PERIOD_DAYS[period]);
      await storeBreakdown(ticker, periodEnd, filing.form, filing.accession, breakdown);
    } catch (err) {
      console.error('[segments] background fill failed:', err);
    }
  });

  return addSecurityHeaders(stored
    ? NextResponse.json({ success: true, parts: stored.breakdown?.parts ?? null, basis: stored.breakdown?.basis ?? null })
    : empty);
}

export const GET = withRateLimit(handler, { windowMs: 60_000, maxRequests: 60 });
```

- [ ] **Step 2: Verify against a running dev server**

Do not run `npm run build` while the dev server is live; they share `.next` and every dynamic route starts returning 500 until the dev server restarts.

```bash
npm run dev
# first call primes the background fill and returns nulls
curl -s "http://localhost:3000/api/stock/AAPL/segments?periodEnd=2025-09-30&revenue=416161000000&period=annual"
# wait ~10s for the filing download, then call again
curl -s "http://localhost:3000/api/stock/AAPL/segments?periodEnd=2025-09-30&revenue=416161000000&period=annual"
```
Expected: the first returns `{"success":true,"parts":null,"basis":null}`; the second returns `basis: "product"` and parts including `iPhone` at `209...`. Confirm the row landed:
```sql
select ticker, period_end, basis, jsonb_array_length(parts) from revenue_segments;
```

- [ ] **Step 3: Verify a company with no breakdown caches its absence**

```bash
curl -s "http://localhost:3000/api/stock/WMT/segments?periodEnd=2026-01-31&revenue=713200000000&period=annual"
```
Call twice, then confirm a row exists for WMT with `parts` NULL. This is the check that stops a 3MB download repeating on every view.

- [ ] **Step 4: Commit**

```bash
git add "app/api/stock/[ticker]/segments/route.ts"
git commit -m "feat(segments): serve a period's revenue parts, filling the cache in the background"
```

---

## Task 6: Draw the parts

**Files:**
- Modify: `components/stock/SankeyCard.tsx`
- Modify: `lib/i18n/locales/en/stock.json`

**Interfaces:**
- Consumes: the endpoint from Task 5
- Produces: no new exports. `buildGraph(row, parts)` gains a second parameter

Parts become extra nodes on the far left feeding `Total Revenue`. Everything downstream of `Total Revenue` is untouched.

- [ ] **Step 1: Widen `buildGraph`**

In `components/stock/SankeyCard.tsx`, change the signature and prepend the inflows. The existing body is unchanged below the insert.

```ts
function buildGraph(
  row: IncomeStatementPeriod,
  parts?: RevenuePart[] | null,
): { nodes: RawNode[]; links: RawLink[] } | null {
  const rev = row.revenue;
  if (!rev || rev <= 0) return null;

  const nodes: RawNode[] = [{ id: 'Total Revenue' }];
  const links: RawLink[] = [];

  const push = (src: string, tgt: string, val: number) => {
    if (val <= 0) return;
    if (!nodes.find((n) => n.id === tgt)) nodes.push({ id: tgt });
    links.push({ source: src, target: tgt, value: val });
  };

  // Revenue sources feed the trunk. Node ids are prefixed so a part named
  // "Other" can never collide with the income statement's own "Other OpEx"
  // wiring or its palette entry.
  if (parts && parts.length >= 2) {
    for (const part of parts) {
      if (part.value <= 0) continue;
      const id = `src:${part.label}`;
      if (!nodes.find((n) => n.id === id)) nodes.push({ id });
      links.push({ source: id, target: 'Total Revenue', value: part.value });
    }
  }
  // ... existing body from `const gp = row.gross_profit;` onward, unchanged
}
```

- [ ] **Step 2: Label and colour the new nodes**

`nodeLabel` must strip the prefix, and `pickColor` must give sources their own ramp rather than the grey fallback. Add below `pickColor`:

```ts
// Revenue sources are one family, shaded by size, so they read as "where the
// money came from" rather than as unrelated categories. The income statement
// keeps its own semantic colours downstream.
const SOURCE_RAMP = {
  light: ['#4f46e5', '#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#e0e7ff'],
  dark:  ['#818cf8', '#6366f1', '#5b57e8', '#4f46e5', '#4338ca', '#3730a3'],
};

function isSource(id: string): boolean {
  return id.startsWith('src:');
}

function sourceColor(id: string, order: string[], isDark: boolean): string {
  const i = Math.max(0, order.indexOf(id));
  const ramp = SOURCE_RAMP[isDark ? 'dark' : 'light'];
  return ramp[Math.min(i, ramp.length - 1)];
}
```

Update `nodeLabel`:
```ts
function nodeLabel(id: string, t: TFunction): string {
  if (isSource(id)) return id.slice(4);
  const key = NODE_LABEL_KEYS[id];
  return key ? t(key) : id;
}
```

In `SankeyChart`, build `order` once from the graph's source ids in descending link value, and use `isSource(node.id) ? sourceColor(node.id, order, isDark) : pickColor(node.id, isDark)` everywhere a colour is taken, including the gradient `defs`.

- [ ] **Step 3: Fetch the parts**

Inside `SankeyCard`, after the existing `financials` query:

```ts
const { data: segmentData } = useQuery<{ parts: RevenuePart[] | null; basis: string | null }>({
  queryKey: ['stock-segments', ticker, row?.fiscal_date, period],
  queryFn: () =>
    fetch(
      `/api/stock/${ticker}/segments?periodEnd=${row!.fiscal_date}&revenue=${row!.revenue}&period=${period}`,
    ).then((r) => r.json()),
  enabled: !!ticker && !!row?.fiscal_date && !!row?.revenue,
  staleTime: 24 * 60 * 60 * 1000,
  gcTime: 48 * 60 * 60 * 1000,
  refetchOnWindowFocus: false,
  retry: false,
});

const graph = useMemo(
  () => (row ? buildGraph(row, segmentData?.parts) : null),
  [row, segmentData],
);
```

Delete the old `graph` memo. The card must render identically when `segmentData` is undefined, which is every first view of a stock.

- [ ] **Step 4: Say where the split came from**

Add to `lib/i18n/locales/en/stock.json`:
```json
"sankeySourceNoteProduct": "Revenue split by product, as reported to the SEC.",
"sankeySourceNoteSegment": "Revenue split by business segment, as reported to the SEC.",
```
Render it under the legend when `segmentData?.basis` is set. Then run `npm run i18n:translate -- --ns=stock` and `npm run i18n:pseudo`.

- [ ] **Step 5: Verify both example cases in a browser**

```bash
npm run dev
```
Open `/stock/GOOGL` and `/stock/MU`, annual. Confirm: Alphabet shows Search, YouTube, Network, subscriptions, Cloud and Other Bets flowing into Total Revenue; Micron shows DRAM, NAND and Other; both left edges sum visually to the trunk; the right-hand side is unchanged. Open `/stock/WMT` and confirm it looks exactly as it does today.

- [ ] **Step 6: Commit**

```bash
git add components/stock/SankeyCard.tsx lib/i18n/locales
git commit -m "feat(sankey): show where the revenue actually came from"
```

---

## Task 7: Accessibility

**Files:**
- Modify: `components/stock/SankeyCard.tsx`
- Modify: `lib/i18n/locales/en/stock.json`

**Interfaces:**
- Consumes: Task 6's graph
- Produces: no new exports

The chart is currently invisible to a screen reader and its values are unreachable without a mouse: the tooltip fires on `onMouseMove` only, so on a phone there is no way to read a flow. This is Priority 1 in CLAUDE.md.

- [ ] **Step 1: Describe the chart**

Give the `<svg>` `role="img"` and an `aria-labelledby` pointing at a `<title>` and `<desc>` inside it. The title is the company and period; the description lists each flow as a sentence, built from the same `graph.links` the chart draws, so the two can never disagree.

```tsx
<title id={`${ticker}-sankey-title`}>{t('sankeyA11yTitle', { ticker, period: periodLabel })}</title>
<desc id={`${ticker}-sankey-desc`}>
  {graph.links.map((l) => t('sankeyA11yFlow', {
    from: nodeLabel(l.source, t),
    to: nodeLabel(l.target, t),
    value: fmtVal(l.value),
    pct: fmtPct(l.value, revenue),
  })).join(' ')}
</desc>
```

New strings:
```json
"sankeyA11yTitle": "{{ticker}} revenue flow for {{period}}",
"sankeyA11yFlow": "{{from}} to {{to}}, {{value}}, {{pct}} of revenue.",
"sankeyA11yNode": "{{label}}, {{value}}, {{pct}} of revenue"
```

- [ ] **Step 2: Make every node reachable**

Give each node `<g>` `tabIndex={0}`, `role="button"`, an `aria-label` from `sankeyA11yNode`, and `onFocus`/`onBlur` handlers that set and clear the same tooltip state `onMouseMove` uses. Position a focus tooltip from the node's own rect via `getBoundingClientRect()` rather than a pointer position, since focus has no coordinates.

Add a visible focus ring: `stroke="var(--ring)" strokeWidth={2}` on the rect when focused.

- [ ] **Step 3: Make it work on touch**

Add `onPointerDown` alongside `onMouseMove`, reading `e.clientX`/`e.clientY`. Dismiss on the next `pointerdown` outside the chart, using a listener added to `document` while a tooltip is open.

- [ ] **Step 4: Keep the tooltip on screen**

The tooltip is positioned `left: tip.x + 10, top: tip.y - 40` and runs off the right edge on a wide node near the viewport edge. Flip it when it would overflow:

```ts
const TIP_W = 180;
const left = tip.x + TIP_W + 20 > window.innerWidth ? tip.x - TIP_W - 10 : tip.x + 10;
const top = Math.max(8, tip.y - 40);
```

- [ ] **Step 5: Verify with a keyboard and a screen reader**

Tab into the chart: every node takes focus in order, shows a visible ring, and announces its label and value. Confirm the tooltip appears on focus and disappears on blur. Run through the chart at 320px width with touch emulation and confirm tapping a node shows its values.

- [ ] **Step 6: Commit**

```bash
git add components/stock/SankeyCard.tsx lib/i18n/locales
git commit -m "fix(sankey): make the chart readable by keyboard, screen reader and touch"
```

---

## Task 8: Responsive layout

**Files:**
- Modify: `components/stock/SankeyCard.tsx`

**Interfaces:**
- Consumes: nothing new
- Produces: no new exports

`PAD.right` is a fixed 172px for labels and `CHART_H` a fixed 420px. On a 360px phone that leaves 182px of actual chart, and adding revenue sources makes it worse by adding a column.

- [ ] **Step 1: Scale the padding and height to the width**

```ts
// Labels sit outside the nodes, so on a narrow screen they take more room
// than the chart itself. Below this width they go above the nodes instead.
const NARROW_BREAKPOINT = 560;

function chartMetrics(width: number, nodeCount: number) {
  const narrow = width < NARROW_BREAKPOINT;
  return {
    narrow,
    height: Math.max(320, Math.min(520, nodeCount * 46)),
    pad: narrow
      ? { top: 14, right: 8, bottom: 14, left: 8 }
      : { top: 10, right: 172, bottom: 10, left: 6 },
  };
}
```

- [ ] **Step 2: Move labels inside on narrow screens**

When `narrow`, draw the label above its node rect (`y = node.y0 - 4`, `textAnchor="start"`, `x = node.x0`) and drop the value sub-label, which the tooltip and the aria-label already carry.

- [ ] **Step 3: Let the period picker scroll**

The picker renders up to five period buttons in a row. Wrap it in `overflow-x-auto` with `scrollbar-none` and `shrink-0` buttons so it scrolls instead of wrapping into a second line that pushes the chart down.

- [ ] **Step 4: Verify at three widths**

Check 360px, 768px and 1440px on `/stock/GOOGL` with the segment breakdown present, which is the densest case. Confirm no label clipping, no horizontal page scroll, and that the chart still reads at 360px.

- [ ] **Step 5: Commit**

```bash
git add components/stock/SankeyCard.tsx
git commit -m "fix(sankey): make the chart usable on a phone"
```

---

## Task 9: Losses, currency and motion

**Files:**
- Modify: `components/stock/SankeyCard.tsx`
- Modify: `lib/i18n/locales/en/stock.json`

**Interfaces:**
- Consumes: nothing new
- Produces: no new exports

Three separate correctness problems in the current chart.

- [ ] **Step 1: Draw a loss instead of dropping it**

`push()` returns early on any value `<= 0`, so a company with negative operating income silently loses its profit branch and the chart shows costs with nothing to compare against. Micron's FY2023 gross margin was negative, and the chart for it is misleading today.

When `oi != null && oi <= 0`, push a `'Operating Loss'` node carrying `Math.abs(oi)` and give it the red family in `NODE_PALETTE`. Same for `'Net Loss'`. Add `sankeyNodeOperatingLoss` and `sankeyNodeNetLoss` to `NODE_LABEL_KEYS` and the locale file.

- [ ] **Step 2: Stop labelling every company in dollars**

`fmtVal` hardcodes `$`. A filer reporting in another currency gets its revenue labelled as USD, which is simply wrong. Read the currency the financials endpoint returns and pass it into `fmtVal(n, currency)`, formatting with `Intl.NumberFormat(undefined, { style: 'currency', currency, notation: 'compact' })` and falling back to the current behaviour when no currency is given.

Verify with a non-USD filer before committing; if the endpoint does not return a currency field, add it there rather than guessing in the component.

- [ ] **Step 3: Respect reduced motion, and stop re-animating on resize**

The `<motion.svg>` has `key={`${ticker}-${width}`}`, so every ResizeObserver tick remounts it and replays the 0.35s fade, which flickers continuously while a window is dragged. Change the key to `ticker` alone.

Gate the animation:
```ts
const prefersReducedMotion = useReducedMotion(); // from framer-motion
// ...
initial={prefersReducedMotion ? false : { opacity: 0 }}
animate={prefersReducedMotion ? undefined : { opacity: 1 }}
transition={{ duration: 0.35 }}
```

- [ ] **Step 4: Verify**

Find a loss-making period (Micron annual, FY2023) and confirm the chart shows an operating loss branch rather than a truncated diagram. Drag the window and confirm no flicker. Set "reduce motion" in the OS and confirm the chart appears without a fade.

- [ ] **Step 5: Commit**

```bash
git add components/stock/SankeyCard.tsx lib/i18n/locales
git commit -m "fix(sankey): show losses, label the real currency, respect reduced motion"
```

---

## Task 10: Rename confidence, and ship

**Files:**
- Modify: `components/stock/SankeyCard.tsx`
- Modify: `lib/i18n/locales/en/stock.json`
- Modify: `content/changelog.json`

**Interfaces:**
- Consumes: everything above
- Produces: nothing

- [ ] **Step 1: Say what the dot means**

`deriveConfidence` measures how many income statement fields the filing gave us, then labels it "confidence", which reads as confidence in the numbers themselves. Rename the displayed label to data completeness: `sankeyDetailFull`, `sankeyDetailPartial`, `sankeyDetailLimited`, with a tooltip explaining that a partial chart means the filing did not break out those lines. Keep the function name and the dot colours.

- [ ] **Step 2: Run the whole gate**

```bash
npm run lint
npm run test-segment-selection
npm run build
```
All three must pass. Do not run the build while the dev server is running.

- [ ] **Step 3: Check the two worked examples one final time**

`/stock/AAPL`, `/stock/GOOGL`, `/stock/MU` with segments; `/stock/WMT` and `/stock/XOM` without. The second pair must look exactly as they do today.

- [ ] **Step 4: Add the changelog entry**

Append to `content/changelog.json`, newest first, dated by the UTC day of the commits:
```json
{
  "type": "improved",
  "title": "See where a company's revenue actually comes from",
  "description": "The revenue flow chart on a stock page now splits revenue into the products and segments the company reports, so you can see that iPhone brings in more than every other Apple product combined. The chart also reads properly on a phone and with a screen reader."
}
```
Match the surrounding entries' exact field names before writing. Then `npm run post-changelog-discord`.

- [ ] **Step 5: Commit and push**

```bash
git add components/stock/SankeyCard.tsx lib/i18n/locales content/changelog.json
git commit -m "feat(sankey): polish pass and changelog for revenue segments"
git push origin preview
```

---

## Self-Review

**Spec coverage.** Products-over-segments preference (Task 3), geography refused (Task 3, asserted for WMT), rollup parents (Task 3, asserted for AAPL and NVDA), quarterly duration trap (Task 3's `periodDays` filter and Task 5's `PERIOD_DAYS`), fiscal date mismatch (Task 5 matches on revenue value), label cleanup (Task 3 `cleanLabel`), two-thirds coverage handled by caching a null result (Task 4), no AI (Task 0 deletes the stub), both worked examples verified (Tasks 6 and 10). Polish: accessibility (7), responsive (8), losses and currency and motion (9), confidence wording (10).

**Placeholders.** None. Every code step carries the code; the one conditional branch, Alphabet's two-axis case in Task 3 Step 4, states the exact rule to add and the exact rule not to loosen.

**Type consistency.** `RevenuePart { label, value }` is defined in Task 3 and used unchanged in Tasks 4, 5 and 6. `Breakdown { parts, basis, total }` likewise. `fetchRevenueFacts` returns `FilingFacts` in Task 2 and is consumed as such in Task 5. `selectBreakdown(facts, consolidated, periodDays)` keeps that signature everywhere. `buildGraph(row, parts?)` is widened once in Task 6 and its callers updated in the same task.

**Known risk carried deliberately.** `dropRollups` detects a parent arithmetically rather than reading the filing's presentation linkbase. A company whose two segments happen to have equal values could see one wrongly dropped. The reconciliation gate then fails and the chart falls back to today's single trunk, so the failure mode is a missing breakdown, never a wrong one.
