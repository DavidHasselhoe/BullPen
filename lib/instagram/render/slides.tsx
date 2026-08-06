/**
 * Slide templates for the earnings-calendar Instagram carousel.
 *
 * Same rendering technique as app/api/og/share/[id]/route.tsx: next/og's
 * ImageResponse (Satori), Node runtime, brand colors resolved to literal
 * sRGB hex (Satori can't consume CSS custom properties or oklch at all).
 *
 * No mascot image is composited here (unlike the design brief's "bull
 * mascot mark" note) — every existing bull illustration in public/illustrations
 * is black line art on a transparent background, made visible on dark
 * surfaces via a CSS `dark:invert` filter at render time in the real app.
 * Satori does not support the `filter` CSS property, so that trick doesn't
 * work here, and there is no pre-inverted asset to load instead. Rather than
 * add a new image-processing dependency (e.g. sharp) or hand-export a new
 * static asset just for this, the CTA slide uses the same text-only brand
 * mark the existing share card already uses successfully. Swap in a real
 * light-variant mascot PNG later if one gets created.
 *
 * Colors: bg/fg/muted reused verbatim from the share card's own resolved
 * tokens. BMO/AMC tag colors match the sky-500/amber-500 pair
 * components/discover/EarningsCalendarWidget.tsx already uses for the same
 * BMO/AMC distinction in the live app, rather than a fresh derivation.
 */

import { loadGoogleFont } from '@/lib/render/google-fonts';
import type { EarningsSlideCompany } from '@/lib/instagram/content/schema';

export const SLIDE_WIDTH = 1080;
export const SLIDE_HEIGHT = 1350;

const BG = '#070b09';
const FG = '#fafafa';
const MUTED = '#a1a1a1';
const MUTED_DIM = 'rgba(161, 161, 161, 0.7)';
const BORDER = 'rgba(255, 255, 255, 0.1)';
const BRAND = '#34d399'; // Signal Emerald (emerald-400) — same hex the share card uses for a positive move
const BMO_COLOR = '#0ea5e9'; // Tailwind sky-500 — matches EarningsCalendarWidget's BMO tag
const AMC_COLOR = '#f59e0b'; // Tailwind amber-500 — matches EarningsCalendarWidget's AMC tag

/** Companies per list-page — keeps each slide readable, not cramped. */
export const COMPANIES_PER_LIST_SLIDE = 6;

export type SlideKind = 'hook' | 'list' | 'cta';

function listSlideCount(companyCount: number): number {
  return Math.max(1, Math.ceil(companyCount / COMPANIES_PER_LIST_SLIDE));
}

/** Total slide count for a given company count: hook + list page(s) + CTA. */
export function totalSlideCount(companyCount: number): number {
  return 1 + listSlideCount(companyCount) + 1;
}

/** Which kind of slide a given 0-indexed slide position is. */
export function slideKindAt(index: number, companyCount: number): SlideKind {
  const lists = listSlideCount(companyCount);
  if (index === 0) return 'hook';
  if (index === lists + 1) return 'cta';
  return 'list';
}

/** All fonts every slide kind might need — fetched once per render, cached across warm invocations by loadGoogleFont itself. */
export async function loadSlideFonts() {
  const [sans, sansBold, mono, serif] = await Promise.all([
    loadGoogleFont('Geist', 400),
    loadGoogleFont('Geist', 700),
    loadGoogleFont('Geist Mono', 500),
    loadGoogleFont('Instrument Serif', 400, true),
  ]);
  return [
    { name: 'Geist', data: sans, weight: 400 as const, style: 'normal' as const },
    { name: 'Geist', data: sansBold, weight: 700 as const, style: 'normal' as const },
    { name: 'Geist Mono', data: mono, weight: 500 as const, style: 'normal' as const },
    { name: 'Instrument Serif', data: serif, weight: 400 as const, style: 'italic' as const },
  ];
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

function Wordmark() {
  return (
    <div style={{ display: 'flex', fontSize: 22, letterSpacing: 6, color: MUTED, fontFamily: 'Geist' }}>
      BULLPEN
    </div>
  );
}

function TimeBadge({ time }: { time: 'BMO' | 'AMC' | null }) {
  if (!time) return null;
  const color = time === 'BMO' ? BMO_COLOR : AMC_COLOR;
  return (
    <div
      style={{
        display: 'flex', fontSize: 20, fontWeight: 500, color,
        fontFamily: 'Geist', padding: '6px 16px', borderRadius: 999,
        backgroundColor: `${color}22`,
      }}
    >
      {time === 'BMO' ? 'Before Open' : 'After Close'}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function HookSlide({ headline, weekLabel }: { headline: string; weekLabel: string }): any {
  return (
    <div
      style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', padding: 96, backgroundColor: BG, color: FG,
      }}
    >
      <Wordmark />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', fontFamily: 'Instrument Serif', fontStyle: 'italic', fontSize: 36, color: MUTED, marginBottom: 20 }}>
          This week&apos;s earnings
        </div>
        <div style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 88, lineHeight: 1.05, color: FG }}>
          {headline}
        </div>
      </div>
      <div style={{ display: 'flex', fontFamily: 'Geist Mono', fontSize: 30, color: MUTED }}>
        {weekLabel}
      </div>
    </div>
  );
}

interface EarningsListSlideProps {
  companies: EarningsSlideCompany[];
  pageIndex: number;
  totalPages: number;
  /** Only shown on the final list page, if the real week had more companies than fit across all pages. */
  overflowCount?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function EarningsListSlide({ companies, pageIndex, totalPages, overflowCount = 0 }: EarningsListSlideProps): any {
  const isLastPage = pageIndex === totalPages - 1;
  return (
    <div
      style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        padding: 80, backgroundColor: BG, color: FG,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 48 }}>
        <Wordmark />
        {totalPages > 1 && (
          <div style={{ display: 'flex', fontFamily: 'Geist Mono', fontSize: 20, color: MUTED }}>
            {pageIndex + 1} / {totalPages}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 20 }}>
        {companies.length === 0 ? (
          <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ display: 'flex', fontFamily: 'Instrument Serif', fontStyle: 'italic', fontSize: 44, color: FG, marginBottom: 20 }}>
              No confirmed reports yet
            </div>
            <div style={{ display: 'flex', fontFamily: 'Geist', fontSize: 24, color: MUTED, maxWidth: 640 }}>
              Big companies usually confirm their earnings date 3 to 6 weeks ahead. Check back on BullPen as the week gets closer.
            </div>
          </div>
        ) : companies.map((c) => (
          <div
            key={c.symbol}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '24px 28px', borderRadius: 20, border: `1px solid ${BORDER}`,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
                <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 34, color: FG }}>
                  {c.symbol}
                </span>
                <span style={{ display: 'flex', fontFamily: 'Geist', fontSize: 22, color: MUTED_DIM }}>
                  {c.name}
                </span>
              </div>
              <span style={{ display: 'flex', fontFamily: 'Geist Mono', fontSize: 20, color: MUTED }}>
                {formatDate(c.date)}
              </span>
            </div>
            <TimeBadge time={c.time} />
          </div>
        ))}
      </div>

      {isLastPage && overflowCount > 0 && (
        <div style={{ display: 'flex', fontFamily: 'Geist Mono', fontSize: 22, color: MUTED, marginTop: 24 }}>
          +{overflowCount} more this week on BullPen
        </div>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function CTASlide(): any {
  return (
    <div
      style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: 96,
        backgroundColor: BG, color: FG, textAlign: 'center',
      }}
    >
      <div style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 30, letterSpacing: 4, color: FG, marginBottom: 28 }}>
        BULLPEN
      </div>
      <div style={{ display: 'flex', fontFamily: 'Instrument Serif', fontStyle: 'italic', fontSize: 52, color: FG, marginBottom: 20, maxWidth: 780 }}>
        Never miss a report again
      </div>
      <div style={{ display: 'flex', fontFamily: 'Geist', fontSize: 26, color: MUTED, marginBottom: 48, maxWidth: 700, textAlign: 'center' }}>
        Track earnings, prices, and your whole portfolio in one place.
      </div>
      <div
        style={{
          display: 'flex', fontFamily: 'Geist Mono', fontSize: 24, fontWeight: 500, color: BG,
          backgroundColor: BRAND, padding: '18px 44px', borderRadius: 999,
        }}
      >
        bullpen.no
      </div>
    </div>
  );
}
