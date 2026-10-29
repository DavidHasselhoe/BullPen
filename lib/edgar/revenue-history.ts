import { resolveCik } from '@/lib/segments/cik';

/**
 * Revenue growth vs a year earlier for a company's last few quarters, from
 * SEC's companyconcept API (consolidated totals, free, no AI).
 *
 * Feeds the deep dive's growth-trend row: "+19% YoY" means one thing after
 * +25% and the opposite after +12%, and the release itself only gives the
 * quarter it reports. This returns the quarters BEFORE the one being
 * reported; that quarter's own growth comes from the release.
 *
 * Two traps:
 * - Q4 is rarely tagged as a three-month fact. It is the 10-K's full year
 *   minus the three quarters inside it.
 * - Companies switch revenue tags over the years, and the tags don't always
 *   total the same thing. Each tag is tried on its own, never mixed, and the
 *   first one that yields a complete recent run wins.
 */

const REVENUE_TAGS = [
  'RevenueFromContractWithCustomerExcludingAssessedTax',
  'Revenues',
  'RevenueFromContractWithCustomerIncludingAssessedTax',
  'SalesRevenueNet',
];

const DAY = 86_400_000;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

interface ConceptFact { start?: string; end: string; val: number; filed: string }

function userAgent(): string {
  return process.env.SEC_EDGAR_USER_AGENT || 'BullPen contact@bullpeninvest.com';
}

async function fetchConcept(cik: string, tag: string): Promise<ConceptFact[]> {
  const res = await fetch(`https://data.sec.gov/api/xbrl/companyconcept/CIK${cik}/us-gaap/${tag}.json`, {
    headers: { 'User-Agent': userAgent(), Accept: 'application/json' },
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`SEC companyconcept ${tag} -> ${res.status}`);
  const json = (await res.json()) as { units?: { USD?: ConceptFact[] } };
  return json.units?.USD ?? [];
}

/** Three-month revenue by period end, with Q4 derived from the full year. */
export function quarterlySeries(facts: ConceptFact[]): Map<string, number> {
  // The same period is re-reported in later filings (comparatives, restatements): keep the latest filed.
  const latest = new Map<string, ConceptFact>();
  for (const f of facts) {
    if (!f.start || !Number.isFinite(f.val)) continue;
    const key = `${f.start}|${f.end}`;
    const prev = latest.get(key);
    if (!prev || f.filed > prev.filed) latest.set(key, f);
  }

  const quarters = new Map<string, number>();
  const annuals: ConceptFact[] = [];
  for (const f of latest.values()) {
    const days = daysBetween(f.start as string, f.end);
    if (days >= 80 && days <= 100) quarters.set(f.end, f.val);
    else if (days >= 350 && days <= 380) annuals.push(f);
  }

  for (const y of annuals) {
    if (quarters.has(y.end)) continue;
    const inside = [...quarters.entries()].filter(([end]) => end > (y.start as string) && end < y.end);
    if (inside.length !== 3) continue;
    quarters.set(y.end, y.val - inside.reduce((s, [, v]) => s + v, 0));
  }
  return quarters;
}

/** YoY growth for the `count` consecutive quarters ending just before the reported one, oldest first. */
export function growthBefore(
  quarters: Map<string, number>,
  reportDate: string,
  count: number,
): { periodEnd: string; yoyPercent: number }[] | null {
  // A quarter ending within ~95 days of the report is the one being reported
  // (some companies file the 10-Q the same morning, a late one up to ~90 days
  // after quarter end). The quarter before it ends 110+ days back. Its growth
  // comes from the release.
  const ends = [...quarters.keys()].filter((e) => daysBetween(e, reportDate) >= 95).sort();
  const recent = ends.slice(-count);
  if (recent.length < count) return null;

  // The newest must be the quarter right before the reported one, and the run unbroken.
  if (daysBetween(recent[recent.length - 1], reportDate) > 165) return null;
  for (let i = 1; i < recent.length; i++) {
    const gap = daysBetween(recent[i - 1], recent[i]);
    if (gap < 80 || gap > 100) return null;
  }

  const out: { periodEnd: string; yoyPercent: number }[] = [];
  for (const end of recent) {
    const yearAgo = [...quarters.keys()].find((e) => Math.abs(daysBetween(e, end) - 365) <= 12);
    const prior = yearAgo != null ? quarters.get(yearAgo) : undefined;
    if (prior == null || prior <= 0) return null;
    out.push({ periodEnd: end, yoyPercent: ((quarters.get(end) as number) / prior - 1) * 100 });
  }
  return out;
}

export async function fetchRevenueGrowthHistory(
  ticker: string,
  reportDate: string,
  count = 4,
): Promise<{ periodEnd: string; yoyPercent: number }[] | null> {
  const cik = await resolveCik(ticker);
  if (!cik) return null;
  for (const tag of REVENUE_TAGS) {
    const history = growthBefore(quarterlySeries(await fetchConcept(cik, tag)), reportDate, count);
    if (history) return history;
  }
  return null;
}
