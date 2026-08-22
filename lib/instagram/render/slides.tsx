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
 * COLOR SYSTEM (deliberately restrained): emerald is the only brand/CTA
 * accent; sky/amber differentiate Before Open vs After Close, matching
 * EarningsCalendarWidget's tags elsewhere in the app. No per-company or
 * per-badge color coding — DESIGN.md's One Signal Rule reserves emerald/red
 * for gain/loss only, and red specifically would risk a ticker badge
 * reading as "this company's earnings are bad." Company identity is
 * already carried by real logos, not a color-coded initial badge.
 *
 * The bull mascot (public/illustrations/bull-alert.png) appears on the hook
 * and CTA slides — the two moments built to earn a scroll-stop and a tap,
 * respectively — not the data-dense list slide, which gets its own small
 * corner accent (bull-chalkboard.png) instead so it never competes with
 * the actual company rows.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { loadGoogleFont } from '@/lib/render/google-fonts';
import type {
  EarningsSlideCompany,
  EarningsCalendarSlides,
  EarningsResultCompany,
  EarningsResultsSlides,
} from '@/lib/instagram/content/schema';

export const SLIDE_WIDTH = 1080;
export const SLIDE_HEIGHT = 1350;

const BG = '#ffffff';
const FG = '#0a0a0a';
const SURFACE = '#f7f7f7';
const MUTED = '#71717a';
const MUTED_DIM = '#a1a1aa';
const BORDER = '#e4e4e7';
const BORDER_STRONG = '#d4d4d8';
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

/**
 * Per-slide alt text for the Instagram carousel item container (`alt_text`
 * on the Graph API's /media call, is_carousel_item=true — supported for
 * image children since March 2025). Not just an accessibility nicety: Meta
 * uses it to understand image content for search/recommendation surfacing,
 * so an image-only carousel (no real on-image text Meta can OCR reliably)
 * was previously invisible to that signal entirely. Ticker-only in the list
 * text (not full company names) to stay well under Meta's alt text length
 * cap even at MAX_COMPANIES.
 */
export function altTextForSlide(
  content: EarningsCalendarSlides | EarningsResultsSlides,
  slideIndex: number
): string {
  const kind = slideKindAt(slideIndex, content.companies.length);
  const isResults = content.contentType === 'earnings_results';
  if (kind === 'hook') {
    return isResults
      ? `${content.headline} Earnings results for the week of ${content.weekLabel} on BullPen.`
      : `${content.headline} Earnings calendar for the week of ${content.weekLabel} on BullPen.`;
  }
  if (kind === 'cta') {
    return isResults
      ? 'Open the BullPen app to see the full earnings results recap and track these stocks.'
      : 'Open the BullPen app to see the full earnings calendar and set alerts for these stocks.';
  }
  const tickers = content.companies.map((c) => c.symbol).join(', ');
  return isResults
    ? `Earnings results for the week of ${content.weekLabel}: ${tickers}.`
    : `Companies reporting earnings the week of ${content.weekLabel}: ${tickers}.`;
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
let chalkboardMascotDataUri: string | null = null;

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

function getChalkboardMascot(): string {
  if (!chalkboardMascotDataUri) chalkboardMascotDataUri = loadLocalImageDataUri('illustrations/bull-chalkboard.png');
  return chalkboardMascotDataUri;
}

function formatDateHeader(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  }).toUpperCase();
}

/** "$1.58" / "-$0.30" — sign goes before the dollar sign, not after it like a raw toFixed() would produce. */
function formatEps(v: number): string {
  const sign = v < 0 ? '-' : '';
  return `${sign}$${Math.abs(v).toFixed(2)}`;
}

/** Groups companies by report date, in chronological order — robust to
 *  whatever primary sort the caller used (earnings-calendar.ts currently
 *  sorts Nasdaq-100 names first, then date), since it buckets by date
 *  across the WHOLE list rather than assuming same-day entries are already
 *  consecutive. Within a date, original relative order is preserved. */
function groupByDate(companies: EarningsSlideCompany[]): { date: string; items: EarningsSlideCompany[] }[] {
  const map = new Map<string, EarningsSlideCompany[]>();
  for (const c of companies) {
    const arr = map.get(c.date) ?? [];
    arr.push(c);
    map.set(c.date, arr);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, items]) => ({ date, items }));
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

/** "N / total" — shown on every slide (not just multi-page lists) so a
 *  viewer mid-scroll on Explore recognizes it's one carousel and knows
 *  how much is left, per the cross-slide consistency feedback. */
function SlideIndicator({ index, total }: { index: number; total: number }) {
  return (
    <div style={{ display: 'flex', fontFamily: 'Geist Mono', fontSize: 20, color: MUTED, letterSpacing: '0.02em' }}>
      {index + 1} / {total}
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
  epsLabelFontSize: number;
  epsValueFontSize: number;
  headerMarginBottom: number;
  dateHeaderFontSize: number;
}

/** Linear interpolation from a "spacious" value (<=6 companies, today's
 *  typical week) down to a "compact" value (>=15, a busy peak-earnings
 *  week), clamped outside that range. */
function lerp(n: number, spacious: number, compact: number): number {
  const t = Math.min(1, Math.max(0, (n - 6) / (15 - 6)));
  return spacious + (compact - spacious) * t;
}

/**
 * Row sizing scales down smoothly as the week's company count grows, so
 * every week fits on ONE list slide (see COMPANIES_PER_LIST_SLIDE above)
 * instead of spilling a single leftover company onto an awkward
 * near-empty second page.
 *
 * The original "compact" endpoint (n>=18) was hand-picked and never
 * actually verified against real content — the first real week to reach
 * this range (12 companies, 2026-08-17, once the hybrid Nasdaq+Claude
 * source started finding more companies than the old Claude-only search
 * ever did) overflowed the 1350px canvas, cutting off the last 1-2 rows
 * with the mascot crowding into the row above them. Retuned from an actual
 * height budget (SLIDE_HEIGHT minus padding, header, and footer) rather
 * than eyeballing it, and the saturation point moved from 18 to 15 so a
 * realistic 12-company week already gets most of the compaction instead of
 * sitting at the spacious half of the curve. Verified live against the
 * 12-company case this was found on before shipping.
 */
function rowMetrics(n: number): RowMetrics {
  return {
    // NOT bumped alongside the logo fill-fix (2026-08-17) — tried 62/40 and
    // it ate into the overflow-fix's height margin enough that the last
    // row's card started touching the mascot's fixed-position corner
    // illustration (verified via a cropped full-res render). The `cover`
    // fill change alone already makes logos read as bigger since they now
    // fill the whole circle instead of floating small inside it — that's
    // the fix "bigger logos" actually needed, not a larger circle.
    badgeSize: Math.round(lerp(n, 56, 34)),
    rowPaddingV: Math.round(lerp(n, 20, 6)),
    rowPaddingH: Math.round(lerp(n, 28, 16)),
    rowGap: Math.round(lerp(n, 20, 6)),
    rowRadius: Math.round(lerp(n, 20, 12)),
    symbolFontSize: Math.round(lerp(n, 34, 19)),
    nameFontSize: Math.round(lerp(n, 22, 13)),
    dateFontSize: Math.round(lerp(n, 20, 12)),
    timeFontSize: Math.round(lerp(n, 20, 11)),
    timePaddingV: Math.round(lerp(n, 6, 3)),
    timePaddingH: Math.round(lerp(n, 16, 8)),
    epsLabelFontSize: Math.round(lerp(n, 13, 9)),
    epsValueFontSize: Math.round(lerp(n, 22, 14)),
    headerMarginBottom: Math.round(lerp(n, 40, 16)),
    dateHeaderFontSize: Math.round(lerp(n, 20, 12)),
  };
}

/** Circular company mark for a list row. Real logo when logoUrl resolved
 *  (see resolveLogoUrl in earnings-calendar.ts), else ticker initials —
 *  same two-state idea as components/company/CompanyLogo.tsx, just without
 *  the onError swap (Satori has no such event; the fallback decision is
 *  already made at generation time).
 *
 *  Fills the circle edge-to-edge (`cover`, sized to the full badge) rather
 *  than floating small and letterboxed inside it (`contain` at size-14) —
 *  the avatar-crop treatment users actually recognize from every social app,
 *  per direct feedback that the old inset read as a mismatched square stuck
 *  inside a circle rather than a filled logo mark. The parent's
 *  `overflow: hidden` + full border-radius does the actual circular clip. */
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
        <img src={logoUrl} alt={`${symbol} logo`} width={size} height={size} style={{ objectFit: 'cover' }} />
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

/** Its own visual element rather than buried inline with the date — EPS is
 *  the second most important number on the slide after the ticker. Always
 *  rendered, even when unconfirmed ("N/A"), so a missing estimate reads as
 *  a real state, not a layout gap that looks like a bug. */
function EpsStat({ value, labelFontSize, valueFontSize }: { value: number | null; labelFontSize: number; valueFontSize: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
      <span style={{ display: 'flex', fontFamily: 'Geist Mono', fontWeight: 700, fontSize: labelFontSize, letterSpacing: '0.06em', color: MUTED_DIM }}>
        EST. EPS
      </span>
      <span style={{ display: 'flex', fontFamily: 'Geist Mono', fontWeight: 700, fontSize: valueFontSize, color: value != null ? FG : MUTED_DIM }}>
        {value != null ? formatEps(value) : 'N/A'}
      </span>
    </div>
  );
}

/** "TUE, AUG 18 ────" — groups the list by report day (see groupByDate)
 *  instead of one undifferentiated stack, which read as random when a
 *  Nasdaq-100 name from Wednesday could sort ahead of an S&P name from
 *  Tuesday. No color accent — a plain rule line stays inside the
 *  restrained color system (see file header). */
function DateHeader({ dateStr, fontSize }: { dateStr: string; fontSize: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <span style={{ display: 'flex', fontFamily: 'Geist Mono', fontWeight: 700, fontSize, letterSpacing: '0.06em', color: MUTED }}>
        {formatDateHeader(dateStr)}
      </span>
      <div style={{ display: 'flex', flex: 1, height: 1, backgroundColor: BORDER }} />
    </div>
  );
}

interface HookSlideProps {
  headline: string;
  weekLabel: string;
  companyCount: number;
  slideIndex: number;
  totalSlides: number;
  /** Overrides the default "{n} COMPANIES REPORTING" pill text — e.g.
   *  earnings-results.ts's "9 OF 12 BEAT ESTIMATES" for the results recap. */
  pillText?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function HookSlide({ headline, weekLabel, companyCount, slideIndex, totalSlides, pillText }: HookSlideProps): any {
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

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 1 }}>
        <Wordmark />
        <SlideIndicator index={slideIndex} total={totalSlides} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', zIndex: 1 }}>
        <div
          style={{
            display: 'flex', alignSelf: 'flex-start', fontFamily: 'Geist', fontWeight: 700, fontSize: 22,
            letterSpacing: '0.02em', color: BRAND_INK, backgroundColor: BRAND,
            padding: '10px 20px', borderRadius: 999, marginBottom: 28,
          }}
        >
          {pillText ?? `${companyCount} ${companyCount === 1 ? 'COMPANY' : 'COMPANIES'} REPORTING`}
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
  /** Only shown when the real week had more companies than fit on this slide. */
  overflowCount?: number;
  slideIndex: number;
  totalSlides: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function EarningsListSlide({ companies, overflowCount = 0, slideIndex, totalSlides }: EarningsListSlideProps): any {
  const m = rowMetrics(companies.length);
  const groups = groupByDate(companies);
  return (
    <div
      style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        padding: 80, backgroundColor: BG, color: FG, position: 'relative', overflow: 'hidden',
      }}
    >
      {/* Small corner accent, not a hero moment like the hook/CTA slides'
          mascot — placed first in DOM order (behind the header/row cards,
          which have opaque backgrounds) so a busy week's rows simply paint
          over it instead of needing conditional logic to avoid overlap. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={getChalkboardMascot()}
        alt=""
        width={260}
        height={260}
        style={{ position: 'absolute', bottom: -30, right: 25, opacity: 0.9 }}
      />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: m.headerMarginBottom, zIndex: 1 }}>
        <Wordmark />
        <SlideIndicator index={slideIndex} total={totalSlides} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: m.rowGap, zIndex: 1 }}>
        {companies.length === 0 ? (
          <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ display: 'flex', fontFamily: 'Instrument Serif', fontStyle: 'italic', fontSize: 44, color: FG, marginBottom: 20 }}>
              No confirmed reports yet
            </div>
            <div style={{ display: 'flex', fontFamily: 'Geist', fontSize: 24, color: MUTED, maxWidth: 640 }}>
              Big companies usually confirm their earnings date 3 to 6 weeks ahead. Check back on BullPen as the week gets closer.
            </div>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.date} style={{ display: 'flex', flexDirection: 'column', gap: m.rowGap }}>
              <DateHeader dateStr={group.date} fontSize={m.dateHeaderFontSize} />
              {group.items.map((c) => (
                <div
                  key={c.symbol}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: `${m.rowPaddingV}px ${m.rowPaddingH}px`, borderRadius: m.rowRadius,
                    backgroundColor: SURFACE, border: `1px solid ${BORDER_STRONG}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                    <CompanyBadge symbol={c.symbol} logoUrl={c.logoUrl} size={m.badgeSize} />
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
                      <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: m.symbolFontSize, color: FG }}>
                        {c.symbol}
                      </span>
                      <span style={{ display: 'flex', fontFamily: 'Geist', fontSize: m.nameFontSize, color: MUTED }}>
                        {c.name}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
                    <EpsStat value={c.epsEstimate} labelFontSize={m.epsLabelFontSize} valueFontSize={m.epsValueFontSize} />
                    <TimeBadge time={c.time} fontSize={m.timeFontSize} paddingV={m.timePaddingV} paddingH={m.timePaddingH} />
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {overflowCount > 0 && (
        <div style={{ display: 'flex', fontFamily: 'Geist Mono', fontSize: 22, color: MUTED, marginTop: 24 }}>
          +{overflowCount} more this week on BullPen
        </div>
      )}
    </div>
  );
}

// ── Earnings-results (the Saturday recap) row elements ─────────────────────
// Reuses EarningsListSlide's shared color/font tokens and Wordmark/
// CompanyBadge/DateHeader — only the right-hand side of each row differs:
// Est -> Actual EPS plus a BEAT/MISSED pill instead of a single EST. EPS
// stat plus a BMO/AMC time badge (the "when" no longer matters once the
// report already happened).
const MISSED_COLOR = '#f87171'; // red-400 — same negative-direction hex app/api/og/share/[id]/route.tsx already uses, matching this file's BRAND (emerald-400) for the positive side.

/** BEAT (emerald) / MISSED (red) — the one place this template uses red at
 *  all, reserved for the loss-side financial-direction signal per
 *  DESIGN.md's One Signal Rule, same as BRAND is reserved for the gain side
 *  elsewhere in this file. */
function ResultBadge({ status, fontSize, paddingV, paddingH }: { status: 'beat' | 'missed'; fontSize: number; paddingV: number; paddingH: number }) {
  const isBeat = status === 'beat';
  return (
    <div
      style={{
        display: 'flex', fontSize, fontWeight: 700, letterSpacing: '0.04em',
        color: isBeat ? BRAND_INK : '#ffffff',
        fontFamily: 'Geist', padding: `${paddingV}px ${paddingH}px`, borderRadius: 999,
        backgroundColor: isBeat ? BRAND : MISSED_COLOR,
      }}
    >
      {isBeat ? 'BEAT' : 'MISSED'}
    </div>
  );
}

/** "EST $1.20 -> ACT $1.35" stacked as two lines, mirroring EpsStat's
 *  column layout. Always both non-null here — earnings-results.ts only
 *  ever includes a company once both are confirmed (see schema.ts). */
function EpsCompareStat({ estimate, actual, labelFontSize, valueFontSize }: { estimate: number; actual: number; labelFontSize: number; valueFontSize: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
      <span style={{ display: 'flex', fontFamily: 'Geist Mono', fontWeight: 700, fontSize: labelFontSize, letterSpacing: '0.06em', color: MUTED_DIM }}>
        EST {formatEps(estimate)}
      </span>
      <span style={{ display: 'flex', fontFamily: 'Geist Mono', fontWeight: 700, fontSize: valueFontSize, color: FG }}>
        {formatEps(actual)}
      </span>
    </div>
  );
}

interface EarningsResultsListSlideProps {
  companies: EarningsResultCompany[];
  overflowCount?: number;
  slideIndex: number;
  totalSlides: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function EarningsResultsListSlide({ companies, overflowCount = 0, slideIndex, totalSlides }: EarningsResultsListSlideProps): any {
  const m = rowMetrics(companies.length);
  const groups = groupByDate(companies);
  return (
    <div
      style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        padding: 80, backgroundColor: BG, color: FG, position: 'relative', overflow: 'hidden',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={getChalkboardMascot()}
        alt=""
        width={260}
        height={260}
        style={{ position: 'absolute', bottom: -30, right: 25, opacity: 0.9 }}
      />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: m.headerMarginBottom, zIndex: 1 }}>
        <Wordmark />
        <SlideIndicator index={slideIndex} total={totalSlides} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: m.rowGap, zIndex: 1 }}>
        {groups.map((group) => (
          <div key={group.date} style={{ display: 'flex', flexDirection: 'column', gap: m.rowGap }}>
            <DateHeader dateStr={group.date} fontSize={m.dateHeaderFontSize} />
            {group.items.map((c) => (
              <div
                key={c.symbol}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: `${m.rowPaddingV}px ${m.rowPaddingH}px`, borderRadius: m.rowRadius,
                  backgroundColor: SURFACE, border: `1px solid ${BORDER_STRONG}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                  <CompanyBadge symbol={c.symbol} logoUrl={c.logoUrl} size={m.badgeSize} />
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
                    <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: m.symbolFontSize, color: FG }}>
                      {c.symbol}
                    </span>
                    <span style={{ display: 'flex', fontFamily: 'Geist', fontSize: m.nameFontSize, color: MUTED }}>
                      {c.name}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
                  <EpsCompareStat estimate={c.epsEstimate} actual={c.epsActual} labelFontSize={m.epsLabelFontSize} valueFontSize={m.epsValueFontSize} />
                  <ResultBadge status={c.status} fontSize={m.timeFontSize} paddingV={m.timePaddingV} paddingH={m.timePaddingH} />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {overflowCount > 0 && (
        <div style={{ display: 'flex', fontFamily: 'Geist Mono', fontSize: 22, color: MUTED, marginTop: 24 }}>
          +{overflowCount} more this week on BullPen
        </div>
      )}
    </div>
  );
}

function BellIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={FG} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function ChartIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={FG} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M7 14l4-4 3 3 5-6" />
    </svg>
  );
}

function WalletIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={FG} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
      <path d="M17 12h2" />
    </svg>
  );
}

/** Earnings/Prices/Portfolio — a secondary punch replacing the single gray
 *  description sentence, so the value prop reads at a glance instead of
 *  needing to be read. Icons are hand-drawn inline SVG (not lucide-react —
 *  no precedent for it working inside next/og's Satori renderer anywhere
 *  else in the app), same thin-stroke language as the rest of the slide. */
function FeatureRow() {
  const items: { Icon: (p: { size: number }) => React.ReactElement; label: string }[] = [
    { Icon: BellIcon, label: 'Earnings' },
    { Icon: ChartIcon, label: 'Prices' },
    { Icon: WalletIcon, label: 'Portfolio' },
  ];
  return (
    <div style={{ display: 'flex', gap: 48, marginBottom: 44 }}>
      {items.map(({ Icon, label }) => (
        <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              display: 'flex', width: 56, height: 56, borderRadius: 999,
              border: `1px solid ${BORDER}`, alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Icon size={24} />
          </div>
          <span style={{ display: 'flex', fontFamily: 'Geist', fontSize: 18, color: MUTED }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function CTASlide({ slideIndex, totalSlides }: { slideIndex: number; totalSlides: number }): any {
  return (
    <div
      style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: 96,
        backgroundColor: BG, color: FG, textAlign: 'center', position: 'relative',
      }}
    >
      <div style={{ position: 'absolute', top: 56, right: 56, display: 'flex' }}>
        <SlideIndicator index={slideIndex} total={totalSlides} />
      </div>

      <div style={{ display: 'flex', marginBottom: 20 }}>
        <Wordmark size={40} />
      </div>

      {/* The mascot's actual pose (checking a phone with an alert bell)
          pairs directly with the headline below it — this is the
          conversion slide, so it gets the same hero treatment as the hook
          slide's mascot instead of no mascot at all. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={getMascot()} alt="" width={300} height={300} style={{ marginBottom: 8 }} />

      <div style={{ display: 'flex', fontFamily: 'Instrument Serif', fontStyle: 'italic', fontSize: 52, color: FG, marginBottom: 20, maxWidth: 780 }}>
        Never miss a report again
      </div>
      <div style={{ display: 'flex', fontFamily: 'Geist', fontSize: 26, color: MUTED, marginBottom: 44, maxWidth: 700, textAlign: 'center' }}>
        Track earnings, prices, and your whole portfolio in one place.
      </div>

      <FeatureRow />

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
