'use client';

import Image from 'next/image';
import type { ReactNode } from 'react';

// ── Brand mark ────────────────────────────────────────────────────────────────
// The marketing landing page always renders on its own dark background
// (landing-styles.css — "the only theme we ship publicly"), independent of the
// app-wide theme toggle, so the white/inverted variant is used unconditionally here.
export function BullPenMark({ size = 28 }: { size?: number }) {
  // BullPenLogo-dark.png is the pale mark drawn FOR dark backgrounds — nearly
  // invisible on light (this is the bug the light-preview screenshot caught).
  // BullPenLogo.png (no suffix) is the black mark for light backgrounds.
  // NOT Tailwind's dark: variant — that's driven by <html class="dark">
  // (ThemeProvider, app-wide default for guests), which is a different
  // ancestor than this page's own local .landing-light-preview toggle and
  // doesn't react to it. Plain classes + the scoped rules in
  // landing-styles.css (.landing-light-preview .logo-mark-*) mirror the same
  // block/hidden swap without depending on that outer element.
  return (
    <>
      <Image
        src="/BullPenLogo.png"
        alt=""
        width={size}
        height={size}
        priority
        style={{ objectFit: 'contain' }}
        aria-hidden="true"
        className="logo-mark-light"
      />
      <Image
        src="/BullPenLogo-dark.png"
        alt=""
        width={size}
        height={size}
        priority
        style={{ objectFit: 'contain' }}
        aria-hidden="true"
        className="logo-mark-dark"
      />
    </>
  );
}

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const px = size === 'sm' ? 22 : size === 'lg' ? 36 : 28;
  const fs = size === 'sm' ? 17 : size === 'lg' ? 26 : 21;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <BullPenMark size={px} />
      <span style={{ fontWeight: 700, letterSpacing: '-0.02em', fontSize: fs, color: 'var(--fg)' }}>
        bullpen
      </span>
    </div>
  );
}

// ── Section heading ──────────────────────────────────────────────────────────
export function SectionHeading({ title, sub }: { title: ReactNode; sub?: string }) {
  return (
    <div className="section-heading">
      <h2 className="headline">{title}</h2>
      {sub && <p>{sub}</p>}
    </div>
  );
}
