/**
 * Filing Freshness Checker
 *
 * Performs a lightweight check (one SEC API call) to determine whether a
 * company has filed any new 10-K, 10-Q, or 20-F reports since the last time
 * the app ingested its data.
 *
 * Used by:
 *  - lazy-ingestion.ts (staleness guard on user page visits)
 *  - /api/cron/update-stale-companies (daily autonomous sweep)
 */

import { formatCIK } from './sec-edgar';

/** Form types we consider "new data" worth re-ingesting for */
const TRACKED_FORMS = new Set(['10-K', '10-K/A', '10-Q', '10-Q/A', '20-F', '20-F/A']);

export interface FilingFreshnessResult {
  /** True if SEC has a filing newer than lastIngestedAt */
  hasNewFilings: boolean;
  /** Filing date of the most recent tracked report on SEC (YYYY-MM-DD) */
  latestFilingDate: string | null;
  /** Form type of that most recent report */
  latestFormType: string | null;
}

/**
 * Checks whether the SEC has any 10-K / 10-Q / 20-F filings for the given
 * company that are newer than `lastIngestedAt`.
 *
 * This is intentionally lightweight: it only parses the parallel arrays in
 * the submissions JSON header — no downloading of actual filing documents.
 *
 * @param cik           Company CIK (any format — will be zero-padded internally)
 * @param lastIngestedAt ISO timestamp of our last successful ingestion, or null
 */
export async function checkForNewFilings(
  cik: string,
  lastIngestedAt: string | null,
): Promise<FilingFreshnessResult> {
  const notFound: FilingFreshnessResult = {
    hasNewFilings: false,
    latestFilingDate: null,
    latestFormType: null,
  };

  try {
    const paddedCik = formatCIK(cik);
    const url = `https://data.sec.gov/submissions/CIK${paddedCik}.json`;

    // Respect SEC rate limit (10 req/sec)
    await new Promise((r) => setTimeout(r, 110));

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'david@hasselo.no',
        'Accept':     'application/json',
      },
    });

    if (!response.ok) return notFound;

    const data = await response.json();
    const recent = data.filings?.recent;
    if (!recent?.form || !recent?.filingDate) return notFound;

    // Scan the parallel arrays for the most recently filed tracked report
    let latestDate: string | null = null;
    let latestForm: string | null = null;

    for (let i = 0; i < recent.form.length; i++) {
      const form = (recent.form[i] || '').toUpperCase().trim();
      const date = recent.filingDate[i] || '';

      if (!TRACKED_FORMS.has(form) || !date) continue;

      if (!latestDate || date > latestDate) {
        latestDate = date;
        latestForm = recent.form[i];
      }
    }

    if (!latestDate) return notFound;

    // Determine if the latest SEC filing is newer than our last ingestion
    let hasNew = false;
    if (!lastIngestedAt) {
      // Never ingested — always consider it new
      hasNew = true;
    } else {
      // Compare YYYY-MM-DD date string against ISO timestamp
      // Slice to date-only for a fair comparison
      const lastDate = lastIngestedAt.substring(0, 10);
      hasNew = latestDate > lastDate;
    }

    return {
      hasNewFilings:   hasNew,
      latestFilingDate: latestDate,
      latestFormType:   latestForm,
    };
  } catch {
    // Network / parse errors are non-fatal — treat as "no new filings"
    return notFound;
  }
}
