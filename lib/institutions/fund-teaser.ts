import { loadFundHoldings, type LoadHoldingsResult } from '@/lib/institutions/load-holdings';
import { allocationHeadline, buildAllocation, friendlyIssuerName, quarterHeadline } from '@/lib/institutions/allocation';
import { getServerT } from '@/lib/i18n/server';

const TEASER_HOLDINGS = 3;

export interface FundTeaser {
  headline: string | null;
  top: { symbol: string | null; name: string; pct: number }[];
}

export type FundTeaserResult =
  | { ok: true; teaser: FundTeaser; fund: { slug: string; displayName: string }; filing: { periodOfReport: string; filedDate: string } }
  | Extract<LoadHoldingsResult, { ok: false }>;

/**
 * The free sample of a fund's latest 13F: its headline sentence, in the
 * reader's language, and its three largest holdings. What a free visitor sees
 * above the Pro lock on the fund page, and what the Feed shows for a followed
 * fund. The diff it is built from never leaves the server.
 */
export async function buildFundTeaser(slug: string, lang: string): Promise<FundTeaserResult> {
  const result = await loadFundHoldings(slug, null);
  if (!result.ok) return result;

  const { holdings, diff, sharesHistory, fund, filing } = result.data;
  const allocation = buildAllocation(holdings);
  const t = await getServerT(lang, '/discover');
  const tr = { t: (key: string, opts?: Record<string, unknown>) => t(key, { ns: 'discover', ...opts }), lang };

  return {
    ok: true,
    fund: { slug: fund.slug, displayName: fund.displayName },
    filing: { periodOfReport: filing.periodOfReport, filedDate: filing.filedDate },
    teaser: {
      headline: quarterHeadline(diff, allocation, sharesHistory, tr) ?? allocationHeadline(allocation, tr),
      top: allocation.top.slice(0, TEASER_HOLDINGS).map((h) => ({
        symbol: h.symbol,
        name: friendlyIssuerName(h.name),
        pct: h.pct,
      })),
    },
  };
}
