import type { Metadata } from 'next';
import { getEconomyPage, RESULT_KINDS, type EconomyPageData, type HistoryRow } from '@/lib/market-data/economic-results';
import { etDateOf, getEconomicEvents } from '@/lib/market-data/economic-calendar';
import { EXTREME_MIN_BACK, extremeSince } from '@/lib/market-data/economy-hub';
import type { EconomicEvent } from '@/lib/market-data/economic-kinds';
import { economyFacts, factsHash } from '@/lib/ai/economy-summary';
import { EconomyHubClient, type HubKind } from '@/components/economy/EconomyHubClient';
import { SITE_URL } from '@/lib/site';

// Results land a few times a week; the release-day cron fills them within ~15 minutes.
export const revalidate = 900;

const title = 'US economy: latest CPI, jobs, GDP and Fed rate';
const description = 'The latest results of the US economic releases that move markets: the Fed rate decision, CPI and PCE inflation, the jobs report, GDP and jobless claims.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/tools/economy` },
  openGraph: { title, description, url: `${SITE_URL}/tools/economy` },
};

/** Points in each sparkline: two years of months, three of quarters, half a year of weeks. */
const SPARK_POINTS = { cpi: 24, pce: 24, jobs: 24, gdp: 12, claims: 26 } as const;

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** The Fed's step series over the last five years, starting at the range in force then. */
function fedSpark(history: HistoryRow[], today: string): HistoryRow[] {
  const from = `${Number(today.slice(0, 4)) - 5}${today.slice(4)}`;
  const before = history.filter((r) => r.period < from).at(-1);
  return [...(before ? [{ ...before, period: from }] : []), ...history.filter((r) => r.period >= from)];
}

/** Periods in a year, for the past-year average that anchors jobs and claims ("is +29,000 a lot?"). */
const YEAR_POINTS = { jobs: 12, claims: 52 } as const;

function toHub(p: EconomyPageData, today: string): HubKind {
  const head = p.latest?.metrics[0]?.key;
  const n = p.kind === 'jobs' || p.kind === 'claims' ? YEAR_POINTS[p.kind] : 0;
  const year = head && n ? p.history.slice(-n).map((r) => r.values[head]).filter((v): v is number => v != null) : [];
  return {
    ...p,
    history: p.kind === 'fomc' ? fedSpark(p.history, today) : p.history.slice(-SPARK_POINTS[p.kind]),
    extreme: p.kind !== 'fomc' && head ? extremeSince(p.history, head, EXTREME_MIN_BACK[p.kind]) : null,
    yearAverage: n > 0 && year.length === n ? year.reduce((a, b) => a + b, 0) / n : null,
  };
}

export default async function EconomyPage() {
  const today = etDateOf(new Date().toISOString());
  const [pages, week] = await Promise.all([
    Promise.all(RESULT_KINDS.map((kind) => getEconomyPage(kind, today))),
    getEconomicEvents(today, addDays(today, 6)),
  ]);
  return (
    <EconomyHubClient
      kinds={pages.map((p) => toHub(p, today))}
      week={week.map(({ source: _s, ...e }) => e as EconomicEvent)}
      today={today}
      factsHash={factsHash(economyFacts(pages))}
    />
  );
}
