/**
 * Plan entitlements — the single source of truth for what Free vs Pro get.
 *
 * Both the gates (server + UI) and the /upgrade pricing page read from here so
 * the offer and the marketing copy can never drift. AI quotas live in
 * `quotas.ts` (enforced by counting `ai_usage`); this module layers the non-AI
 * limits + Pro-only feature flags and derives the comparison table.
 */

import { QUOTAS } from './quotas';
import { isPro, type Tier } from './tier';
import { FREE_ACTIVE_ALERT_LIMIT } from '@/types/alerts';

// ── Non-AI free-tier limits ──────────────────────────────────────────────────
export const FREE_WATCHLISTS = 3;              // bumped from 1 — beats Koyfin's 2
export const FREE_ALERT_STOCKS = FREE_ACTIVE_ALERT_LIMIT; // 5 (source: types/alerts.ts)

// ── Pricing (structure only; Stripe wired later) ─────────────────────────────
export const PRICING = {
  currency: 'USD',
  proMonthly: 12,
  proAnnualPerMonth: 9,   // billed yearly → $108/yr (25% off)
  trialDays: 14,
  moneyBackDays: 30,
};

// ── Pro-only feature flags ───────────────────────────────────────────────────
export type ProFeature =
  | 'exports'               // CSV / PDF exports (screener, holdings, dividend)
  | 'insider'               // insider transactions (200-credit endpoint)
  | 'daily_brief'
  | 'why_today'
  | 'unlimited_alerts'
  | 'unlimited_watchlists'
  | 'dividend_hub'          // future flagship
  | 'portfolio_checkup'     // future flagship
  | 'brokerage'             // SnapTrade brokerage connection — costs us per connected user
  | 'academy_pro'           // intermediate/advanced Academy courses
  | 'weekly_pick_thesis';   // full thesis behind Bull's Weekly Pick (pick + track record stay free)

export interface Entitlements {
  tier: Tier;
  isPro: boolean;
  maxWatchlists: number | 'unlimited';
  maxAlertStocks: number | 'unlimited';
  /** Whether the tier unlocks a Pro-only feature. */
  can: (feature: ProFeature) => boolean;
}

/** Resolve limits/flags for a tier. All ProFeatures are Pro-only for now. */
export function entitlementsFor(tier: Tier): Entitlements {
  const pro = isPro(tier);
  return {
    tier,
    isPro: pro,
    maxWatchlists: pro ? 'unlimited' : FREE_WATCHLISTS,
    maxAlertStocks: pro ? 'unlimited' : FREE_ALERT_STOCKS,
    can: () => pro,
  };
}

// ── Comparison table (drives the /upgrade page) ──────────────────────────────
export interface ComparisonRow {
  label: string;
  free: string | boolean;
  pro: string | boolean;
  hint?: string;
}
export interface ComparisonGroup {
  title: string;
  rows: ComparisonRow[];
}

/** Rows where Pro actually differs from Free — used to count "N more benefits" upsells without hardcoding a number that drifts from the table. */
function isUpgradeRow(row: ComparisonRow): boolean {
  return row.free !== row.pro;
}

export const PLAN_COMPARISON: ComparisonGroup[] = [
  {
    title: 'Research',
    rows: [
      { label: 'Stock pages & advanced charts', free: 'Unlimited', pro: 'Unlimited', hint: 'Simply Wall St caps free at 5 reports/mo' },
      { label: 'Stock screener', free: true, pro: true, hint: 'A paid feature on Simply Wall St' },
      { label: 'Financials, statistics & health score', free: true, pro: true },
      { label: 'Compare companies side-by-side', free: true, pro: true },
      { label: 'Insider transactions', free: false, pro: true },
    ],
  },
  {
    title: 'AI analyst',
    rows: [
      { label: 'BullPen AI chat', free: `${QUOTAS.chat.count}/day`, pro: 'Unlimited' },
      { label: 'AI Deep Dive reports', free: `${QUOTAS.deep_dive.count}/month`, pro: `${QUOTAS.deep_dive.proCap}/month` },
      { label: 'AI Portfolio Builder', free: `${QUOTAS.portfolio_builder.count}/month`, pro: 'Unlimited' },
      { label: 'AI Portfolio Checkup', free: `${QUOTAS.risk_analysis.count}/month`, pro: 'Unlimited' },
      { label: '“Why Today?” move explanations', free: false, pro: true },
      { label: 'Daily Brief (AI market recap)', free: false, pro: true },
      {
        label: "Bull's Weekly Pick",
        free: 'Pick + track record',
        pro: 'Full thesis',
        hint: 'One AI stock pick every Monday. The pick and its full performance history are free — Pro unlocks the reasoning, evidence, and risks behind it.',
      },
    ],
  },
  {
    title: 'Alerts & tracking',
    rows: [
      { label: 'Price alerts', free: `${FREE_ALERT_STOCKS} stocks`, pro: 'Unlimited' },
      { label: 'Watchlists', free: `${FREE_WATCHLISTS}`, pro: 'Unlimited' },
      { label: 'Holdings tracking & CSV import', free: true, pro: true },
      { label: 'Automatic brokerage sync', free: false, pro: true, hint: 'Connect Robinhood, Schwab, Fidelity, IBKR, and 100+ more' },
      { label: 'In-app notifications & daily recap', free: true, pro: true },
    ],
  },
  {
    title: 'Data & learning',
    rows: [
      { label: 'CSV / PDF exports', free: false, pro: true },
      { label: 'Academy: beginner courses + daily challenge', free: true, pro: true },
      { label: 'Academy: intermediate & advanced courses', free: false, pro: true, hint: 'Valuation, financial statements, portfolio risk, and researching with AI' },
      { label: 'Community & leaderboards', free: true, pro: true },
      { label: 'Priority support', free: false, pro: true },
    ],
  },
];

/** Total count of genuine Pro upsells across the comparison table — the source
 *  of truth for any "+N more benefits" upsell copy, so it can't drift from
 *  what /upgrade actually lists. */
export const PLAN_COMPARISON_UPGRADE_COUNT =
  PLAN_COMPARISON.flatMap((g) => g.rows).filter(isUpgradeRow).length;
