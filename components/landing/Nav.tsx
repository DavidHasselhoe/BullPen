'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Logo } from './Atoms';
import { Icon } from './Icon';

interface Props {
  onSignIn: () => void;
  onSignUp: () => void;
}

export function Nav({ onSignIn, onSignUp }: Props) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  const links = [
    { label: 'Features', href: '#features' },
    { label: 'How it works', href: '#how' },
    { label: 'Pricing', href: '#pricing' },
    { label: 'FAQ', href: '#faq' },
  ];

  return (
    <nav
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        padding: '14px 0',
        background: scrolled ? 'oklch(from var(--bg) l c h / 0.72)' : 'transparent',
        backdropFilter: scrolled ? 'blur(16px) saturate(140%)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(16px) saturate(140%)' : 'none',
        borderBottom: scrolled ? '1px solid var(--border)' : '1px solid transparent',
        transition: 'background 200ms, border-color 200ms, backdrop-filter 200ms',
      }}
    >
      <div className="wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <a href="#top" style={{ display: 'inline-flex' }}>
          <Logo />
        </a>

        <div
          className="nav-links"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            padding: 4,
            borderRadius: 999,
          }}
        >
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              style={{
                padding: '8px 14px',
                borderRadius: 99,
                fontSize: 14,
                fontWeight: 500,
                color: 'var(--fg-muted)',
                transition: 'background 150ms, color 150ms',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--surface-2)';
                e.currentTarget.style.color = 'var(--fg)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--fg-muted)';
              }}
            >
              {l.label}
            </a>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link
            href="/dashboard"
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--fg-muted)',
              padding: '8px 12px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            Open dashboard
            <Icon name="arrowRight" size={13} />
          </Link>
          <button
            type="button"
            onClick={onSignIn}
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--fg-muted)',
              padding: '8px 12px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={onSignUp}
            className="btn btn-primary"
            style={{ padding: '10px 18px', fontSize: 14 }}
          >
            Sign up free
            <Icon name="arrowRight" size={14} />
          </button>
        </div>
      </div>
    </nav>
  );
}
