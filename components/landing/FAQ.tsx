'use client';

import { useState } from 'react';
import { Reveal, SectionHeading } from './Atoms';
import { Icon } from './Icon';

const FAQ_ITEMS = [
  {
    q: 'Is BullPen actually free?',
    a: 'Yes. The Free plan stays free forever — real-time quotes, charts, portfolio tracking, screener, and 20 AI chat messages a month. Pro unlocks the Daily Brief, unlimited AI, filing alerts, and brokerage sync.',
  },
  {
    q: 'Do I have to connect a brokerage?',
    a: 'Never. You can use BullPen without connecting anything — just track holdings manually or follow a watchlist. If you want live portfolio sync, we partner with SnapTrade (Schwab, Fidelity, Robinhood, IBKR, and 20+ more) — all opt-in, OAuth-only.',
  },
  {
    q: 'How fresh is the market data?',
    a: "Real-time via TwelveData's WebSocket stream for stocks and ETFs. Crypto and commodity prices update every few seconds. We also surface extended-hours pricing for premarket and after-hours.",
  },
  {
    q: 'Is the AI just summarizing news?',
    a: 'No. BullPen AI uses a 15-tool agent that can call live market data, read SEC filings, run screeners, and pull from your portfolio. "Why Today?" uses Claude with web search to explain price moves, and every answer cites its sources.',
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
    a: 'Yes. Cancel from your account settings in two clicks. You keep Pro access until the end of your billing period, then revert to Free with no data loss.',
  },
  {
    q: 'Which markets do you cover?',
    a: 'US equities (NYSE, NASDAQ, AMEX), all major ETFs, top crypto (BTC, ETH, SOL and 50+ more), commodities (gold, silver, oil), and forex pairs. International equity coverage is coming in 2026.',
  },
];

function FAQItem({ q, a, open, onToggle }: { q: string; a: string; open: boolean; onToggle: () => void }) {
  return (
    <div style={{ borderBottom: '1px solid var(--border)', transition: 'background 200ms' }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: '22px 0',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          color: 'var(--fg)',
        }}
      >
        <span style={{ flex: 1, fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em', textWrap: 'balance' }}>{q}</span>
        <span
          style={{
            flexShrink: 0,
            width: 32,
            height: 32,
            borderRadius: 99,
            background: open ? 'var(--accent)' : 'var(--surface)',
            color: open ? 'var(--accent-ink)' : 'var(--fg-muted)',
            border: open ? 'none' : '1px solid var(--border)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 250ms',
            transform: open ? 'rotate(45deg)' : 'rotate(0)',
          }}
        >
          <Icon name="plus" size={14} stroke={2.2} />
        </span>
      </button>
      <div
        style={{
          display: 'grid',
          gridTemplateRows: open ? '1fr' : '0fr',
          transition: 'grid-template-rows 350ms cubic-bezier(.22,1,.36,1)',
        }}
      >
        <div style={{ overflow: 'hidden' }}>
          <p style={{ margin: '0 60px 22px 0', fontSize: 15, lineHeight: 1.6, color: 'var(--fg-muted)', textWrap: 'pretty' }}>{a}</p>
        </div>
      </div>
    </div>
  );
}

export function FAQ() {
  const [open, setOpen] = useState<number>(0);

  return (
    <section id="faq" style={{ padding: '120px 0 80px' }}>
      <div className="wrap">
        <SectionHeading
          eyebrow="FAQ"
          title={
            <>
              Questions, answered{' '}
              <span className="accent-serif" style={{ color: 'var(--accent)' }}>
                straight.
              </span>
            </>
          }
        />

        <Reveal>
          <div style={{ maxWidth: 800, margin: '0 auto' }}>
            {FAQ_ITEMS.map((item, i) => (
              <FAQItem key={i} q={item.q} a={item.a} open={open === i} onToggle={() => setOpen(open === i ? -1 : i)} />
            ))}
          </div>
        </Reveal>

        <Reveal delay={1}>
          <div style={{ marginTop: 56, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: 'var(--fg-muted)' }}>Still have questions?</div>
            <a href="mailto:hello@bullpen.app" className="btn btn-ghost" style={{ fontSize: 14, padding: '11px 18px' }}>
              <Icon name="chat" size={14} />
              Chat with the team
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
