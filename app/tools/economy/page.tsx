import type { Metadata } from 'next';
import { getEconomyPage, RESULT_KINDS } from '@/lib/market-data/economic-results';
import { EconomyHubClient } from '@/components/economy/EconomyHubClient';
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

export default async function EconomyPage() {
  const pages = await Promise.all(RESULT_KINDS.map((kind) => getEconomyPage(kind)));
  // The chart history isn't shown on the hub; keep it out of the page payload.
  return <EconomyHubClient pages={pages.map((p) => ({ ...p, history: [] }))} />;
}
