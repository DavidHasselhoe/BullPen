'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { Reveal, SectionHeading } from './Atoms';
import { Icon } from './Icon';
import type { Shot } from '@/lib/landing/screenshots';

/**
 * Real product screenshots.
 *
 * This section previously showed hand-built HTML recreations of the app —
 * invented holdings, invented health scores, an AI answer citing "Reuters,
 * Bloomberg, MS Research" (none of which BullPen integrates) — plus two tabs
 * pointing at /screenshots/*.png, a directory that did not exist, so those two
 * rendered as broken images in production.
 *
 * A recreation is worse than a photograph here: it takes real effort to keep in
 * sync with the product, drifts silently the moment the UI changes, and shows
 * prospective users something they will never actually see. So the recreations
 * are gone. Drop real captures into /public/screenshots (see the README there)
 * and each one appears automatically.
 *
 * `shots` is resolved on the server (lib/landing/screenshots.ts), so a missing
 * capture is never requested by the browser and the section renders nothing at
 * all until at least one exists.
 */

const ROTATE_MS = 5000;

function BrowserChrome({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 40px 100px -30px oklch(0 0 0 / 0.55), 0 0 0 1px var(--border)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 14px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-2)',
        }}
      >
        <div style={{ display: 'flex', gap: 6 }} aria-hidden>
          {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
            <span key={c} style={{ width: 11, height: 11, borderRadius: 99, background: c, opacity: 0.85 }} />
          ))}
        </div>
        <div
          style={{
            flex: 1,
            maxWidth: 480,
            margin: '0 auto',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '5px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            color: 'var(--fg-muted)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <Icon name="shield" size={11} style={{ color: 'var(--up)' }} />
          {/* Was "bullpen.app" — not a domain we own. */}
          <span style={{ color: 'var(--fg-dim)' }}>bullpen.no</span>
          <span style={{ color: 'var(--fg)' }}>{url}</span>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }} aria-hidden>
          {[1, 2, 3].map((i) => (
            <span key={i} style={{ width: 14, height: 2, background: 'var(--fg-dim)', opacity: 0.4, borderRadius: 2 }} />
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}

export function Peek({ shots }: { shots: Shot[] }) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || shots.length < 2) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % shots.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [paused, shots.length]);

  // No captures yet — render nothing rather than an empty frame.
  if (shots.length === 0) return null;

  const active = shots[Math.min(idx, shots.length - 1)];

  return (
    <section id="peek" style={{ padding: '120px 0 60px', position: 'relative' }}>
      <div className="wrap">
        <SectionHeading
          title={
            <>
              Powerful, but never{' '}
              <span className="accent-serif" style={{ color: 'var(--accent)' }}>
                overwhelming.
              </span>
            </>
          }
          sub="Every screen is built around one job: helping you make a better decision in the next 30 seconds."
        />

        {shots.length > 1 && (
          <Reveal>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
              <div
                role="tablist"
                aria-label="Product screenshots"
                style={{
                  display: 'inline-flex',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  gap: 3,
                  padding: 4,
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 99,
                }}
              >
                {shots.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-selected={i === idx}
                    onClick={() => {
                      setIdx(i);
                      setPaused(true);
                    }}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 99,
                      border: 'none',
                      background: i === idx ? 'var(--accent)' : 'transparent',
                      color: i === idx ? 'var(--accent-ink)' : 'var(--fg-muted)',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'background 200ms, color 200ms',
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </Reveal>
        )}

        <Reveal delay={1}>
          <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
            <BrowserChrome url={active.url}>
              <div key={active.id} style={{ animation: 'bp-fade-up 0.4s ease-out', background: 'var(--bg)' }}>
                <Image
                  src={`/screenshots/${active.file}`}
                  alt={active.alt}
                  width={1600}
                  height={1000}
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                />
              </div>
            </BrowserChrome>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
