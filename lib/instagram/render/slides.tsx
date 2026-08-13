/**
 * Slide templates for the earnings-calendar Instagram carousel.
 *
 * Same rendering technique as app/api/og/share/[id]/route.tsx: next/og's
 * ImageResponse (Satori), Node runtime, brand colors resolved to literal
 * sRGB hex (Satori can't consume CSS custom properties or oklch at all).
 *
 * Light theme (white bg, near-black ink) across all three slide kinds,
 * not just the list slide — a carousel has to read as one designed object,
 * and a light background is also what actually fixes the real problem: on
 * a dark canvas, most third-party ticker logos (white/transparent-background
 * PNGs) need an isolated light circle behind them, which reads as a
 * floating badge with awkward padding. On a white canvas the same logos
 * sit directly on the page with just a thin ring, no boxed-in mismatch.
 *
 * Wordmark matches the real brand treatment in components/landing/Atoms.tsx
 * exactly (icon + lowercase "bullpen", bold, tight negative tracking) —
 * the previous version used plain letter-spaced-out uppercase text, which
 * isn't how BullPen's wordmark actually renders anywhere else in the app.
 *
 * The bull mascot (public/illustrations/bull-alert.png) appears on the hook
 * slide only, not every slide — reinforces brand identity at the one moment
 * that matters most for scroll-stopping (research: slide one carries ~80%
 * of a carousel's swipe-through weight) without turning into visual noise
 * across the whole carousel. It's usable directly here because it's already
 * black line art on transparent background — exactly right for a light
 * slide, unlike the app's own dark-mode usage which needs a CSS invert
 * Satori can't do.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { loadGoogleFont } from '@/lib/render/google-fonts';
import type { EarningsSlideCompany } from '@/lib/instagram/content/schema';

export const SLIDE_WIDTH = 1080;
export const SLIDE_HEIGHT = 1350;

const BG = '#ffffff';
const FG = '#0a0a0a';
const SURFACE = '#f7f7f7';
const MUTED = '#71717a';
const MUTED_DIM = '#a1a1aa';
const BORDER = '#e4e4e7';
const BRAND = '#34d399'; // Signal Emerald (emerald-400) — same hex used elsewhere (e.g. app/api/og/share/[id]/route.tsx)
const BRAND_INK = '#0a0a0a'; // text/icon color on top of BRAND — dark reads better on emerald-400 than white does
const BMO_COLOR = '#0ea5e9'; // Tailwind sky-500 — matches EarningsCalendarWidget's BMO tag
const AMC_COLOR = '#f59e0b'; // Tailwind amber-500 — matches EarningsCalendarWidget's AMC tag

/**
 * Companies per list-page. Set comfortably above MAX_COMPANIES
 * (lib/instagram/content/earnings-calendar.ts) so a week's full list always
 * fits on ONE slide — EarningsListSlide scales row size down as the count
 * grows (see rowMetrics below) rather than spilling into a second page for
 * a single leftover company, which read as an awkward near-empty slide.
 */
export const COMPANIES_PER_LIST_SLIDE = 30;

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

// ── Local brand assets, read once and cached as base64 data URIs ──────────
// More reliable than fetching our own deployed URL: no network round-trip,
// works identically in local dev and production without needing to know
// the app's own base URL.
let brandIconDataUri: string | null = null;
let mascotDataUri: string | null = null;

function loadLocalImageDataUri(relativePath: string): string {
  const buf = readFileSync(join(process.cwd(), 'public', relativePath));
  return `data:image/png;base64,${buf.toString('base64')}`;
}

function getBrandIcon(): string {
  if (!brandIconDataUri) brandIconDataUri = loadLocalImageDataUri('BullPenLogo.png');
  return brandIconDataUri;
}

function getMascot(): string {
  if (!mascotDataUri) mascotDataUri = loadLocalImageDataUri('illustrations/bull-alert.png');
  return mascotDataUri;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

/** "$1.58" / "-$0.30" — sign goes before the dollar sign, not after it like a raw toFixed() would produce. */
function formatEps(v: number): string {
  const sign = v < 0 ? '-' : '';
  return `${sign}$${Math.abs(v).toFixed(2)}`;
}

/** Icon + "bullpen" wordmark, matching components/landing/Atoms.tsx's Logo
 *  component exactly (bold, -0.02em tracking, lowercase) rather than the
 *  spaced-out uppercase text used before — that treatment doesn't match
 *  the brand mark anywhere else in the app. */
function Wordmark({ size = 36 }: { size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={getBrandIcon()} alt="" width={size} height={size} />
      <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, letterSpacing: '-0.02em', fontSize: size * 0.8, color: FG }}>
        bullpen
      </span>
    </div>
  );
}

interface RowMetrics {
  badgeSize: number;
  rowPaddingV: number;
  rowPaddingH: number;
  rowGap: number;
  rowRadius: number;
  symbolFontSize: number;
  nameFontSize: number;
  dateFontSize: number;
  timeFontSize: number;
  timePaddingV: number;
  timePaddingH: number;
  headerMarginBottom: number;
}

/** Linear interpolation from a "spacious" value (<=6 companies, today's
 *  typical week) down to a "compact" value (>=18, a busy peak-earnings
 *  week), clamped outside that range. */
function lerp(n: number, spacious: number, compact: number): number {
  const t = Math.min(1, Math.max(0, (n - 6) / (18 - 6)));
  return spacious + (compact - spacious) * t;
}

/**
 * Row sizing scales down smoothly as the week's company count grows, so
 * every week fits on ONE list slide (see COMPANIES_PER_LIST_SLIDE above)
 * instead of spilling a single leftover company onto an awkward
 * near-empty second page. Tuned against SLIDE_HEIGHT (1350px) minus the
 * fixed page padding and header: comfortable at <=6 companies, still
 * legible down to ~18-20.
 */
function rowMetrics(n: number): RowMetrics {
  return {
    badgeSize: Math.round(lerp(n, 56, 40)),
    rowPaddingV: Math.round(lerp(n, 20, 8)),
    rowPaddingH: Math.round(lerp(n, 28, 18)),
    rowGap: Math.round(lerp(n, 20, 8)),
    rowRadius: Math.round(lerp(n, 20, 14)),
    symbolFontSize: Math.round(lerp(n, 34, 22)),
    nameFontSize: Math.round(lerp(n, 22, 15)),
    dateFontSize: Math.round(lerp(n, 20, 14)),
    timeFontSize: Math.round(lerp(n, 20, 13)),
    timePaddingV: Math.round(lerp(n, 6, 4)),
    timePaddingH: Math.round(lerp(n, 16, 10)),
    headerMarginBottom: Math.round(lerp(n, 48, 28)),
  };
}

/** Circular company mark for a list row. Real logo when logoUrl resolved
 *  (see resolveLogoUrl in earnings-calendar.ts), else ticker initials —
 *  same two-state idea as components/company/CompanyLogo.tsx, just without
 *  the onError swap (Satori has no such event; the fallback decision is
 *  already made at generation time). Just a thin ring, no fill — on a white
 *  slide, a logo (almost always itself on a white/transparent background)
 *  sits directly on the page with no boxed-in mismatch. */
function CompanyBadge({ symbol, logoUrl, size }: { symbol: string; logoUrl: string | null; size: number }) {
  return (
    <div
      style={{
        display: 'flex', width: size, height: size, borderRadius: 999,
        border: `1px solid ${BORDER}`, backgroundColor: BG,
        alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0,
      }}
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={`${symbol} logo`} width={size - 14} height={size - 14} style={{ objectFit: 'contain' }} />
      ) : (
        <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: Math.round(size * 0.32), color: MUTED }}>
          {symbol.slice(0, 2)}
        </span>
      )}
    </div>
  );
}

function TimeBadge({ time, fontSize, paddingV, paddingH }: { time: 'BMO' | 'AMC' | null; fontSize: number; paddingV: number; paddingH: number }) {
  if (!time) return null;
  const color = time === 'BMO' ? BMO_COLOR : AMC_COLOR;
  return (
    <div
      style={{
        display: 'flex', fontSize, fontWeight: 500, color,
        fontFamily: 'Geist', padding: `${paddingV}px ${paddingH}px`, borderRadius: 999,
        backgroundColor: `${color}1a`,
      }}
    >
      {time === 'BMO' ? 'Before Open' : 'After Close'}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function HookSlide({ headline, weekLabel, companyCount }: { headline: string; weekLabel: string; companyCount: number }): any {
  return (
    <div
      style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', padding: 96, backgroundColor: BG, color: FG,
        position: 'relative', overflow: 'hidden',
      }}
    >
      {/* Mascot bleeds off the bottom-right corner — a hero moment for the
          one slide where it counts most, not repeated across the carousel. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={getMascot()}
        alt=""
        width={520}
        height={520}
        style={{ position: 'absolute', bottom: -70, right: -90, opacity: 0.9 }}
      />

      <Wordmark />

      <div style={{ display: 'flex', flexDirection: 'column', zIndex: 1 }}>
        <div
          style={{
            display: 'flex', alignSelf: 'flex-start', fontFamily: 'Geist', fontWeight: 700, fontSize: 22,
            letterSpacing: '0.02em', color: BRAND_INK, backgroundColor: BRAND,
            padding: '10px 20px', borderRadius: 999, marginBottom: 28,
          }}
        >
          {companyCount} {companyCount === 1 ? 'COMPANY' : 'COMPANIES'} REPORTING
        </div>
        <div style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 84, lineHeight: 1.05, color: FG, maxWidth: 820 }}>
          {headline}
        </div>
      </div>

      <div style={{ display: 'flex', fontFamily: 'Geist Mono', fontSize: 28, color: MUTED, zIndex: 1 }}>
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
  const m = rowMetrics(companies.length);
  return (
    <div
      style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        padding: 80, backgroundColor: BG, color: FG,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: m.headerMarginBottom }}>
        <Wordmark />
        {totalPages > 1 && (
          <div style={{ display: 'flex', fontFamily: 'Geist Mono', fontSize: 20, color: MUTED }}>
            {pageIndex + 1} / {totalPages}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: m.rowGap }}>
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
              padding: `${m.rowPaddingV}px ${m.rowPaddingH}px`, borderRadius: m.rowRadius, backgroundColor: SURFACE,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <CompanyBadge symbol={c.symbol} logoUrl={c.logoUrl} size={m.badgeSize} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
                  <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: m.symbolFontSize, color: FG }}>
                    {c.symbol}
                  </span>
                  <span style={{ display: 'flex', fontFamily: 'Geist', fontSize: m.nameFontSize, color: MUTED }}>
                    {c.name}
                  </span>
                </div>
                <span style={{ display: 'flex', fontFamily: 'Geist Mono', fontSize: m.dateFontSize, color: MUTED_DIM }}>
                  {formatDate(c.date)}
                  {c.epsEstimate != null ? ` · Est. EPS ${formatEps(c.epsEstimate)}` : ''}
                </span>
              </div>
            </div>
            <TimeBadge time={c.time} fontSize={m.timeFontSize} paddingV={m.timePaddingV} paddingH={m.timePaddingH} />
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
      <div style={{ display: 'flex', marginBottom: 32 }}>
        <Wordmark size={44} />
      </div>
      <div style={{ display: 'flex', fontFamily: 'Instrument Serif', fontStyle: 'italic', fontSize: 52, color: FG, marginBottom: 20, maxWidth: 780 }}>
        Never miss a report again
      </div>
      <div style={{ display: 'flex', fontFamily: 'Geist', fontSize: 26, color: MUTED, marginBottom: 48, maxWidth: 700, textAlign: 'center' }}>
        Track earnings, prices, and your whole portfolio in one place.
      </div>
      <div
        style={{
          display: 'flex', fontFamily: 'Geist Mono', fontSize: 24, fontWeight: 500, color: BRAND_INK,
          backgroundColor: BRAND, padding: '18px 44px', borderRadius: 999,
        }}
      >
        bullpen.no
      </div>
    </div>
  );
}
