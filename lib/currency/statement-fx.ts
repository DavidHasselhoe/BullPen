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

interface IncomeLike { revenue: number | null; ebitda: number | null }
interface BalanceLike {
  total_stockholders_equity: number | null;
  long_term_debt: number | null;
  cash_and_equivalents: number | null;
}

/** TwelveData /statistics fields, in its own names, that mix a USD price with statement values. */
export interface StatementValuation {
  price_to_sales_ttm: number | null;
  price_to_book_mrq: number | null;
  enterprise_value: number | null;
  enterprise_to_ebitda: number | null;
}

/**
 * P/S, P/B, EV and EV/EBITDA from a USD market cap and statements already in
 * USD (newest first). For foreign filers TwelveData's own values are wrong:
 * TSM's P/S came back 0.45 (USD market cap over TWD revenue) where 14.5 is
 * right, and ASML's EV was 62x its market cap off a share count 55x too high.
 * Market cap itself is right, so everything is built from totals, never from
 * per-share figures. Null where the statements can't support a value: four
 * quarters for TTM, positive revenue and EBITDA.
 */
export function valuationFromStatements(
  marketCap: number | null | undefined,
  income: IncomeLike[],
  balance: BalanceLike[],
): StatementValuation {
  const ttm = (pick: (q: IncomeLike) => number | null) => {
    const vals = income.slice(0, 4).map(pick);
    return vals.length === 4 && vals.every((v) => v != null) ? (vals as number[]).reduce((a, b) => a + b, 0) : null;
  };
  const revenue = ttm((q) => q.revenue);
  const ebitda = ttm((q) => q.ebitda);
  const b = balance[0];
  const equity = b?.total_stockholders_equity ?? null;
  // ponytail: long-term debt only; the balance rows carry no short-term debt or investments.
  const ev = marketCap != null && b ? marketCap + (b.long_term_debt ?? 0) - (b.cash_and_equivalents ?? 0) : null;
  return {
    price_to_sales_ttm: marketCap != null && revenue != null && revenue > 0 ? marketCap / revenue : null,
    price_to_book_mrq: marketCap != null && equity ? marketCap / equity : null,
    enterprise_value: ev,
    enterprise_to_ebitda: ev != null && ebitda != null && ebitda > 0 ? ev / ebitda : null,
  };
}
