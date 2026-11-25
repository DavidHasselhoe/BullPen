import type { TFunction } from 'i18next';
import type { CompareCompany } from './fetch-compare-company';

/**
 * The plain-English answer at the top of Compare: one row per question a
 * beginner actually asks (is it healthy, how big, how profitable, growing,
 * expensive, does it pay me), naming the company ahead and every company's
 * value. Built only from real numbers, never from a model, so the server can
 * render it into the HTML of the crawlable /tools/compare/[pair] pages and
 * their meta description. A row with fewer than two values is left out
 * rather than guessed.
 */
export interface VerdictRow {
  key: string;
  label: string;
  headline: string;
  /** text is the figure (set in mono); unit is the words after it ("a year"), set in the body face. */
  values: Array<{ ticker: string; name: string; text: string; unit: string | null; leads: boolean }>;
}

type Def = {
  key: string;
  value: (c: CompareCompany) => number | null;
  better: 'higher' | 'lower';
  /** The figure as shown. Values that show the same are a tie, not a win. */
  text: (c: CompareCompany, v: number, t: TFunction) => string;
  /** i18n key of the words after the figure, when there are any for this value. */
  unit?: (v: number) => string | null;
};

const usd = (n: number): string => {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(0)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(0)}M`;
  return `${sign}$${abs.toFixed(0)}`;
};

const DEFS: Def[] = [
  {
    key: 'health',
    value: (c) => c.market?.healthScore ?? null,
    better: 'higher',
    text: (_c, v) => String(Math.round(v)),
    unit: () => 'compareVerdictUnit_health',
  },
  {
    key: 'size',
    value: (c) => c.metrics.revenue,
    better: 'higher',
    text: (_c, v) => usd(v),
    unit: () => 'compareVerdictUnit_year',
  },
  {
    key: 'profit',
    value: (c) => c.metrics.netMargin,
    better: 'higher',
    // Net margin read as cents: 41% is 41¢ of each $1 of sales. A loss shows as a negative.
    text: (_c, v) => `${Math.round(v)}¢`,
    unit: () => 'compareVerdictUnit_profit',
  },
  {
    key: 'growth',
    value: (c) => c.metrics.revenueGrowth,
    better: 'higher',
    text: (_c, v) => `${v >= 0 ? '+' : '-'}${Math.abs(v).toFixed(0)}%`,
  },
  {
    // P/E: a price of $25 for every $1 of a year's profit. Only meaningful for a profitable company.
    key: 'price',
    value: (c) => (c.market?.peRatio != null && c.market.peRatio > 0 ? c.market.peRatio : null),
    better: 'lower',
    text: (_c, v) => `$${Math.round(v)}`,
    unit: () => 'compareVerdictUnit_price',
  },
  {
    key: 'dividend',
    value: (c) => (c.market ? c.market.dividendYield ?? 0 : null),
    better: 'higher',
    text: (_c, v, t) => (v > 0 ? `${(v * 100).toFixed(1)}%` : t('compareVerdictDividendNone')),
    unit: (v) => (v > 0 ? 'compareVerdictUnit_year' : null),
  },
];

export function buildVerdict(companies: CompareCompany[], t: TFunction): VerdictRow[] {
  const context = companies.length === 2 ? 'pair' : 'group';
  const rows: VerdictRow[] = [];
  for (const d of DEFS) {
    const present = companies
      .map((c) => ({ c, v: d.value(c) }))
      .filter((x): x is { c: CompareCompany; v: number } => x.v != null && Number.isFinite(x.v));
    if (present.length < 2) continue;

    const withText = present.map((x) => ({ ...x, text: d.text(x.c, x.v, t) }));
    const ranked = [...withText].sort((a, b) => (d.better === 'higher' ? b.v - a.v : a.v - b.v));
    // Equal as shown is equal: "A 94" vs "A 94", or two companies that pay no dividend.
    const tie = ranked[0].text === ranked[1].text;
    // "Grew faster" / "keeps more as profit" would be false when every company shrank or lost money.
    const noneAhead =
      ((d.key === 'dividend' || d.key === 'profit') && ranked[0].v <= 0) || (d.key === 'growth' && ranked[0].v < 0);

    const headline = noneAhead
      ? t(`compareVerdictNoneAll_${d.key}`, { context, name: ranked[0].c.name })
      : tie
        ? t('compareVerdictTie')
        : t(`compareVerdict_${d.key}`, { name: ranked[0].c.name, context });

    rows.push({
      key: d.key,
      label: t(`compareVerdictLabel_${d.key}`),
      headline,
      values: companies.map((c) => {
        const hit = withText.find((x) => x.c === c);
        return {
          ticker: c.ticker,
          name: c.name,
          text: hit?.text ?? t('compareVerdictNoData'),
          unit: hit && d.unit?.(hit.v) ? t(d.unit(hit.v)!, { grade: c.market?.healthGrade ?? '?' }) : null,
          leads: !tie && !noneAhead && hit?.c === ranked[0].c,
        };
      }),
    });
  }
  return rows;
}
