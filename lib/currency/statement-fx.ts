/**
 * Financial statements in US dollars, for companies that report in another
 * currency. TSM files in TWD, so its revenue came out as "$1.27T" when it is
 * about $40B.
 *
 * Every period is converted at ONE rate, the latest, not each period's own.
 * One rate keeps growth rates and margins exactly what the company reported
 * (a quarter-on-quarter change of +28% stays +28%, instead of mixing in a TWD
 * move), it costs one cached quote instead of a rate history, and the UI can
 * name the rate in a single line. The cost: an older quarter is shown at
 * today's rate, not at what it was worth in USD back then.
 *
 * Pure, so `npm run test-statement-fx` can run it without a server. The rate
 * lookup lives in lib/currency/latest-rates.ts (`statementsInUsd`).
 */

export interface StatementFx {
  /** The currency the company reports in, e.g. "TWD". */
  from: string;
  /** Units of `from` per 1 USD, e.g. 30.52. */
  rate: number;
  /** YYYY-MM-DD the rate was fetched. */
  date: string;
}

// Every number on a statement row is money (EPS included, which is money per
// share) except these. Ratios and growth rates are never stored on the rows;
// they are derived from converted numbers, so they come out unchanged.
const NOT_MONEY = new Set(['fiscal_quarter', 'fiscal_year']);

/** Divides every money field by `fx.rate` and marks the rows as USD. */
export function rowsToUsd<T extends object>(rows: T[], fx: StatementFx): T[] {
  return rows.map((row) => {
    const out = { ...row } as Record<string, unknown>;
    for (const [key, value] of Object.entries(out)) {
      if (typeof value === 'number' && !NOT_MONEY.has(key)) out[key] = value / fx.rate;
    }
    if ('reported_currency' in out) out.reported_currency = 'USD';
    return out as T;
  });
}
