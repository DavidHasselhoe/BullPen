'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Logo } from './Atoms';
import { Icon } from './Icon';
import { useAuth } from '@/hooks/use-auth';
import { UserMenu } from '@/components/navigation/UserMenu';

interface Props {
  onSignIn: () => void;
  onSignUp: () => void;
  // Whether the landing page is currently showing its dark (?theme=dark
  // escape hatch) or light (default) variant — passed through to UserMenu so
  // its portaled dropdown forces the matching shadcn tokens. See
  // LandingClient's isDarkLanding.
  isDarkLanding: boolean;
}

export function Nav({ onSignIn, onSignUp, isDarkLanding }: Props) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { isAuthenticated, isLoading } = useAuth();

  // Not a `window` scroll listener: this page's app shell scrolls an inner
  // wrapper div, not the window, so `window.scrollY` never changes here and a
  // scroll listener on `window` never fires. A 1px sentinel pinned to the true
  // top of the page, watched with IntersectionObserver, detects the scroll
  // regardless of which ancestor actually owns it.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting));
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  const links = [
    { label: 'Features', href: '#features' },
    { label: 'How it works', href: '#how' },
    { label: 'Pricing', href: '#pricing' },
    { label: 'FAQ', href: '#faq' },
  ];

  return (
    <>
      {/* Absolutely positioned against `.content-layer` (the nearest
          `position: relative` ancestor), so it marks the page's true top
          regardless of the nav's own `position: sticky`. */}
      <div
        ref={sentinelRef}
        aria-hidden
        style={{ position: 'absolute', top: 0, left: 0, width: 1, height: 1, pointerEvents: 'none' }}
      />
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
          {/* Below 880px the pill of section links is hidden (landing-styles.css).
              Until now nothing replaced it, so a phone visitor had no way to
              reach Pricing or the FAQ except by scrolling the entire page —
              12,758px of it at 390px wide. This button is that way. */}
          <button
            type="button"
            className="nav-menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="landing-mobile-menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span className="nav-menu-bar" data-open={menuOpen ? 'true' : undefined} />
            <span className="nav-menu-bar" data-open={menuOpen ? 'true' : undefined} />
          </button>
          {isLoading ? (
            // Reserve space while auth resolves — avoids a flash of the wrong CTAs.
            <div style={{ width: 40, height: 40 }} aria-hidden />
          ) : isAuthenticated ? (
            <>
              <Link
                href="/dashboard"
                className="btn btn-primary"
                style={{ padding: '10px 18px', fontSize: 14 }}
              >
                Open dashboard
                <Icon name="arrowRight" size={14} />
              </Link>
              <UserMenu forceDark={isDarkLanding} forceLight={!isDarkLanding} />
            </>
          ) : (
            <>
              {/* Hidden below 560px, where the menu toggle plus both auth
                  buttons squeeze the wordmark down to "bullpe". Sign in moves
                  into the mobile menu at that width; the primary CTA and the
                  logo are what stay in the bar. */}
              <button
                type="button"
                onClick={onSignIn}
                className="nav-signin"
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: 'var(--fg-muted)',
                  padding: '8px 12px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  // Without this the label breaks to "Sign / in" at 390px,
                  // where it collides with the wordmark.
                  whiteSpace: 'nowrap',
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
                Start for free
                <Icon name="arrowRight" size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {menuOpen && (
        <div id="landing-mobile-menu" className="nav-mobile-menu">
          {links.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)}>
              {l.label}
            </a>
          ))}
          {!isLoading && !isAuthenticated && (
            <button
              type="button"
              className="nav-mobile-signin"
              onClick={() => {
                setMenuOpen(false);
                onSignIn();
              }}
            >
              Sign in
            </button>
          )}
        </div>
      )}
      </nav>
    </>
  );
}
