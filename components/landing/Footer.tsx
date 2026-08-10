'use client';

import { Logo } from './Atoms';
import { Icon, type IconName } from './Icon';

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'Pricing', href: '#pricing' },
      { label: 'Daily Brief', href: '#daily-brief' },
      { label: 'Ask Bull', href: '#bullpen-ai' },
      { label: 'Screener', href: '#screener' },
      { label: 'Roadmap', href: '/roadmap' },
      { label: 'Changelog', href: '/changelog' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Help center', href: '/help' },
      { label: 'Glossary', href: '/glossary' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Terms', href: '/terms' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Cookies', href: '/cookies' },
      { label: 'Accessibility', href: '/accessibility' },
      { label: 'Disclosures', href: '/disclosures' },
      { label: 'Security', href: '/security' },
    ],
  },
];

const SOCIALS: { icon: IconName; label: string; href: string }[] = [
  { icon: 'discord', label: 'Discord', href: 'https://discord.gg/RkTFXyjZSY' },
];

export function Footer() {
  return (
    <footer style={{ borderTop: '1px solid var(--border)', padding: '60px 0 32px', position: 'relative', background: 'var(--bg-2)' }}>
      <div className="wrap">
        <div className="footer-grid" style={{ display: 'grid', gridTemplateColumns: '2fr repeat(4, 1fr)', gap: 40, marginBottom: 48 }}>
          <div style={{ maxWidth: 320 }}>
            <Logo />
            <p style={{ margin: '16px 0 20px', fontSize: 14, color: 'var(--fg-muted)', lineHeight: 1.55 }}>
              The stock research app for beginners who don&apos;t want to stay beginners.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              {SOCIALS.map((s) => (
                <a
                  key={s.icon}
                  href={s.href}
                  aria-label={s.label}
                  target={s.href.startsWith('http') ? '_blank' : undefined}
                  rel={s.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--fg-muted)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 200ms',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--accent-soft)';
                    e.currentTarget.style.color = 'var(--accent)';
                    e.currentTarget.style.borderColor = 'var(--accent)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--surface)';
                    e.currentTarget.style.color = 'var(--fg-muted)';
                    e.currentTarget.style.borderColor = 'var(--border)';
                  }}
                >
                  <Icon name={s.icon} size={15} />
                </a>
              ))}
            </div>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--fg)',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  marginBottom: 14,
                }}
              >
                {col.title}
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      style={{ fontSize: 13, color: 'var(--fg-muted)', transition: 'color 150ms' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = 'var(--fg)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'var(--fg-muted)';
                      }}
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div
          style={{
            borderTop: '1px solid var(--border)',
            paddingTop: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
            fontSize: 12,
            color: 'var(--fg-dim)',
          }}
        >
          <span>© 2026 Hasselø BullPen. All rights reserved.</span>
          <span style={{ maxWidth: 600, textAlign: 'right' }}>
            BullPen is not a registered investment advisor. Content is informational only and not financial advice. Markets data delayed up
            to 15s on Free plan.
          </span>
        </div>
      </div>
    </footer>
  );
}
