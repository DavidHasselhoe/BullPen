'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Reveal, SectionHeading } from './Atoms';
import { Icon } from './Icon';
import { FAQ_ITEMS } from './faq-data';

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
            <Link href="/contact" className="btn btn-ghost" style={{ fontSize: 14, padding: '11px 18px' }}>
              <Icon name="chat" size={14} />
              Chat with the team
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export { FAQ_ITEMS };
