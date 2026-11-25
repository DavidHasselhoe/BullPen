import { QUOTAS } from '@/lib/billing/quotas';
import { PRICING, FREE_WATCHLISTS } from '@/lib/billing/entitlements';

export const FAQ_ITEMS = [
  {
    // Quota figures are read from the enforcing modules rather than written by
    // hand — this answer previously claimed "20 AI chat messages a month"
    // against a real limit of 15 per day.
    q: 'Is BullPen actually free?',
    a: `Yes. The Free plan stays free forever: quotes, charts, unlimited stock pages, the full screener, holdings tracking, ${FREE_WATCHLISTS} watchlists and ${QUOTAS.chat.count} AI chat messages a day, plus "Why Today?" for your biggest mover each day. Pro adds the Daily Brief, "Why Today?" for any stock, up to ${QUOTAS.chat.proCap} Bull messages a day, full fund holdings and automatic brokerage sync.`,
  },
  {
    q: 'Do I have to connect a brokerage?',
    a: 'Never. You can use BullPen without connecting anything. Just track holdings manually or follow a watchlist. If you want live portfolio sync, we partner with SnapTrade (Schwab, Fidelity, Robinhood, IBKR and 100+ more), all opt-in and OAuth-only.',
  },
  {
    q: 'How fresh is the market data?',
    a: 'S&P 500 stocks update in real time. Other stocks and ETFs can be up to 15 minutes behind. Crypto and commodity prices update every few seconds, and pre-market and after-hours prices are included.',
  },
  {
    // Deliberately no tool count: the previous "15-tool agent" was accurate when
    // written and silently wrong the next time a tool was added or removed.
    q: 'What can Bull, your research assistant, do?',
    a: 'Bull answers questions about stocks from real data, not headlines. Before it replies it looks up live prices, financial statements, health scores, earnings dates and what the big funds hold, and it can look at your own holdings if you turn that on. It can also run the screener, set an alert or update your holdings, and it asks you to confirm before anything changes. It explains and compares, but it won\'t tell you what to buy or sell. "Why Today?" is separate: it reads the day\'s news and filings with web search before it explains a price move.',
  },
  {
    q: 'Is my financial data safe?',
    a: "Brokerage sync is optional and goes through SnapTrade, so BullPen never sees your brokerage password. Your data is encrypted in transit and at rest. We don't sell data and we don't show ads.",
  },
  {
    q: 'Is BullPen an SEC-registered advisor?',
    a: "No. BullPen is a research and analytics tool. We don't give personalized financial advice or execute trades. Everything on the platform is for informational purposes.",
  },
  {
    q: 'Can I cancel anytime?',
    // Same path as renewalTerms().cancelLine (lib/billing/trial-copy.ts), which
    // names the real account-menu item; this said "account settings" before.
    a: `Yes. Cancel from the account menu, under Manage subscription. You keep Pro access until the end of your billing period, then revert to Free with no data loss. Pro also starts with a ${PRICING.trialDays}-day free trial and is covered by a ${PRICING.moneyBackDays}-day money-back guarantee.`,
  },
  {
    // Was "International equity coverage is coming in 2026" — a dated promise
    // that has now arrived without the feature, which is worse than no promise.
    // Replaced with what is true today.
    q: 'Which markets do you cover?',
    // Freshness wording matches "How fresh is the market data?" above: this one
    // said all US equities were real time while that one said only the S&P 500.
    a: 'US stocks and ETFs (NYSE, NASDAQ, AMEX), plus crypto, commodities and forex. S&P 500 stocks update in real time and other US stocks can be up to 15 minutes behind. Stocks listed outside the US are covered at end of day.',
  },
];
