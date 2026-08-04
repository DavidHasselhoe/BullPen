import { QUOTAS } from '@/lib/billing/quotas';
import { PRICING, FREE_WATCHLISTS } from '@/lib/billing/entitlements';

export const FAQ_ITEMS = [
  {
    // Quota figures are read from the enforcing modules rather than written by
    // hand — this answer previously claimed "20 AI chat messages a month"
    // against a real limit of 15 per day.
    q: 'Is BullPen actually free?',
    a: `Yes. The Free plan stays free forever — live quotes, charts, unlimited stock pages, the full screener, holdings tracking, ${FREE_WATCHLISTS} watchlists and ${QUOTAS.chat.count} AI chat messages a day. Pro unlocks the Daily Brief, "Why Today?" explanations, unlimited AI, and automatic brokerage sync.`,
  },
  {
    q: 'Do I have to connect a brokerage?',
    a: 'Never. You can use BullPen without connecting anything — just track holdings manually or follow a watchlist. If you want live portfolio sync, we partner with SnapTrade (Schwab, Fidelity, Robinhood, IBKR and 100+ more) — all opt-in, OAuth-only.',
  },
  {
    q: 'How fresh is the market data?',
    a: "Real-time via TwelveData's WebSocket stream for stocks and ETFs. Crypto and commodity prices update every few seconds. We also surface extended-hours pricing for premarket and after-hours.",
  },
  {
    // Deliberately no tool count: the previous "15-tool agent" was accurate when
    // written and silently wrong the next time a tool was added or removed.
    q: 'Is the AI just summarizing news?',
    a: 'No. BullPen AI is a tool-using agent — it calls live market data, reads SEC filings, runs screeners, and can reference your own holdings if you let it. "Why Today?" uses Claude with web search to explain price moves, and every answer cites its sources.',
  },
  {
    q: 'Is my financial data safe?',
    a: "All connections go through bank-level OAuth — we never see your brokerage password. Data is encrypted in transit and at rest. We don't sell data and we don't serve ads.",
  },
  {
    q: 'Is BullPen an SEC-registered advisor?',
    a: "No — BullPen is a research and analytics tool. We don't give personalized financial advice or execute trades. Everything on the platform is for informational purposes.",
  },
  {
    q: 'Can I cancel anytime?',
    a: `Yes. Cancel from your account settings in two clicks. You keep Pro access until the end of your billing period, then revert to Free with no data loss. Pro also starts with a ${PRICING.trialDays}-day free trial and is covered by a ${PRICING.moneyBackDays}-day money-back guarantee.`,
  },
  {
    // Was "International equity coverage is coming in 2026" — a dated promise
    // that has now arrived without the feature, which is worse than no promise.
    // Replaced with what is true today.
    q: 'Which markets do you cover?',
    a: 'US equities (NYSE, NASDAQ, AMEX) and major ETFs in real time, plus crypto, commodities and forex. Global equities are covered at end-of-day rather than live.',
  },
];
