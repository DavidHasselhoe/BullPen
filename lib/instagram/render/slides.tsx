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
 * COVERS ARE INK (2026-10-09 critique): the first slide is all most people
 * see, and a white tile dissolves into Instagram's white UI and repeats
 * across the whole grid. Every post now opens on an ink cover in the landing
 * page's identity that states the news itself (the day's biggest gain and
 * drop, the week's logos), with white data slides after it, where the logo
 * reasoning above still applies. Numbers are Geist Sans: Geist Mono gives
 * "." a full digit cell, so "$3.62" read as "$3 . 62" at display sizes.
 *
 * The bull mascot (public/illustrations/bull-alert.png) appears only on the
 * CTA slide now (its line art is black and disappears on ink). The
 * data-dense list slide has no mascot at all: a corner accent
 * (bull-chalkboard.png) was tried there but overlapped the last row(s) of
 * companies on busy weeks, so it was removed rather than fixed.
 *
 * Preview against real posts: npm run render-instagram-preview -- --latest
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { loadOgFont } from '@/lib/render/og-fonts';
import type {
  EarningsSlideCompany,
  EarningsResultCompany,
  MarketMoverEntry,
  InstagramPostSlides,
  EarningsDeepDiveData,
  PicksScoreboardSlides,
  ScoreboardCallout,
} from '@/lib/instagram/content/schema';

import { SITE_HOST } from '@/lib/site';
import { displayCompanyName } from '@/lib/market-data/company-name';
export const SLIDE_WIDTH = 1080;
export const SLIDE_HEIGHT = 1350;

const BG = '#ffffff';
const FG = '#0a0a0a';
const SURFACE = '#f7f7f7';
// Secondary text. Was #71717a with #a1a1aa labels: ~4.3:1 and ~2.4:1 on
// SURFACE, and a slide is seen at about a third of its size in the feed.
const MUTED = '#5f5f69';
const BORDER = '#e4e4e7';
const BORDER_STRONG = '#d4d4d8';
const BRAND = '#34d399'; // Signal Emerald (emerald-400) — same hex used elsewhere (e.g. app/api/og/share/[id]/route.tsx)
const BRAND_INK = '#0a0a0a'; // text/icon color on top of BRAND — dark reads better on emerald-400 than white does
const BMO_COLOR = '#0ea5e9'; // Tailwind sky-500 — matches EarningsCalendarWidget's BMO tag
const AMC_COLOR = '#f59e0b'; // Tailwind amber-500 — matches EarningsCalendarWidget's AMC tag
// Text on the BMO/AMC tints: the 500s themselves are ~2:1 on their own tint.
const BMO_TEXT = '#0369a1'; // sky-700
const AMC_TEXT = '#b45309'; // amber-700

// Covers (the first slide, which is all most people see) are ink, in the
// landing page's identity, so a BullPen post is recognisable in the grid and
// doesn't dissolve into Instagram's own white UI. Data slides stay white:
// that is where the logos need it (see the header comment).
const INK = '#0c100e'; // DESIGN.md bg-dark, oklch(0.145 0.008 162)
const INK_SURFACE = '#181d1b'; // surface-dark
const INK_BORDER = 'rgba(255,255,255,0.10)';
const ON_INK = '#fafafa';
const ON_INK_MUTED = '#a3a8a6';
const INK_GLOW = 'radial-gradient(circle at 12% 0%, rgba(52,211,153,0.20), rgba(52,211,153,0) 55%)';
const LOSS = '#f87171'; // red-400, the mirror of BRAND; dark text on it, like BRAND
// Gain/loss as TEXT on white: the 400s are under 3:1 there.
const GAIN_TEXT = '#059669'; // emerald-600
const LOSS_TEXT = '#dc2626'; // red-600

/**
 * Companies per list-page. Set comfortably above MAX_COMPANIES
 * (lib/instagram/content/earnings-calendar.ts) so a week's full list always
 * fits on ONE slide — EarningsListSlide scales row size down as the count
 * grows (see rowMetrics below) rather than spilling into a second page for
 * a single leftover company, which read as an awkward near-empty slide.
 */
export const COMPANIES_PER_LIST_SLIDE = 30;

export type SlideKind =
  | 'hook' | 'list' | 'cta' | 'movers_cover' | 'winners' | 'losers'
  | 'deepdive_summary'
  | 'scoreboard_cover' | 'scoreboard_list' | 'scoreboard_callouts';

/** Picks per scoreboard list page. Every pick is shown; past this the list paginates. */
export const SCOREBOARD_PER_PAGE = 16;

function scoreboardPageCount(n: number): number {
  return Math.max(1, Math.ceil(n / SCOREBOARD_PER_PAGE));
}

function listSlideCount(companyCount: number): number {
  return Math.max(1, Math.ceil(companyCount / COMPANIES_PER_LIST_SLIDE));
}

/** Total slide count for a given post. market_movers is always a fixed 4
 *  slides (ink cover, winners, losers, cta); earnings_deep_dive is always a fixed 2
 *  (the info-dense summary card, then the shared conversion CTA slide every
 *  other content type ends on); earnings_calendar/earnings_results paginate
 *  their company list across a hook, 1+ list slides, and a CTA. */
export function totalSlideCount(slides: InstagramPostSlides): number {
  if (slides.contentType === 'market_movers') return 4;
  if (slides.contentType === 'earnings_deep_dive') return 2;
  if (slides.contentType === 'picks_scoreboard') return 1 + scoreboardPageCount(slides.picks.length) + 2;
  return 1 + listSlideCount(slides.companies.length) + 1;
}

/** Which kind of slide a given 0-indexed slide position is, for a given post. */
export function slideKindAt(index: number, slides: InstagramPostSlides): SlideKind {
  if (slides.contentType === 'market_movers') {
    if (index === 0) return 'movers_cover';
    if (index === 1) return 'winners';
    if (index === 2) return 'losers';
    return 'cta';
  }
  if (slides.contentType === 'earnings_deep_dive') {
    return index === 0 ? 'deepdive_summary' : 'cta';
  }
  if (slides.contentType === 'picks_scoreboard') {
    const pages = scoreboardPageCount(slides.picks.length);
    if (index === 0) return 'scoreboard_cover';
    if (index <= pages) return 'scoreboard_list';
    return index === pages + 1 ? 'scoreboard_callouts' : 'cta';
  }
  const lists = listSlideCount(slides.companies.length);
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
  content: InstagramPostSlides,
  slideIndex: number
): string {
  if (content.contentType === 'market_movers') {
    const kind = slideKindAt(slideIndex, content);
    const when = content.period ? `This ${content.period}'s` : "Today's";
    if (kind === 'movers_cover') {
      const g = content.winners[0];
      const l = content.losers[0];
      return `${when} biggest S&P 500 and Nasdaq 100 moves on BullPen: ${g.symbol} up ${g.changePercent.toFixed(1)}%, ${l.symbol} down ${Math.abs(l.changePercent).toFixed(1)}%.`;
    }
    if (kind === 'winners') return `${when} top S&P 500 and Nasdaq 100 gainers on BullPen: ${content.winners.map((w) => w.symbol).join(', ')}.`;
    if (kind === 'losers') return `${when} top S&P 500 and Nasdaq 100 losers on BullPen: ${content.losers.map((l) => l.symbol).join(', ')}.`;
    return 'Open the BullPen app to track every S&P 500 and Nasdaq 100 stock in real time.';
  }
  if (content.contentType === 'picks_scoreboard') {
    const kind = slideKindAt(slideIndex, content);
    const c = content;
    if (kind === 'scoreboard_cover') return `BullPen Weekly Pick track record since ${c.sinceLabel}: all ${c.pickCount} picks ${c.totalReturnPct.toFixed(1)}%, S&P 500 on the same days ${c.benchmarkReturnPct.toFixed(1)}%. ${c.beatCount} of ${c.pickCount} picks ahead of the S&P 500.`;
    if (kind === 'scoreboard_list') return `Every BullPen Weekly Pick with its return and the S&P 500 over the same days: ${c.picks.map((p) => `${p.symbol} ${p.returnPct.toFixed(1)}%`).join(', ')}.`;
    if (kind === 'scoreboard_callouts') return `Biggest winner ${c.best.symbol} ${c.best.returnPct.toFixed(1)}% and biggest loser ${c.worst.symbol} ${c.worst.returnPct.toFixed(1)}% among BullPen's Weekly Picks, and what moved them.`;
    return 'Open the BullPen app to see every Weekly Pick, the thesis behind it, and the full track record.';
  }
  if (content.contentType === 'earnings_deep_dive') {
    const kind = slideKindAt(slideIndex, content);
    const d = content.data;
    if (kind === 'deepdive_summary') {
      return `${d.ticker} (${d.companyName}) earnings: EPS ${d.epsActual != null ? d.epsActual : 'pending'} vs estimate ${d.epsEstimate ?? 'N/A'}, revenue ${d.revenueActual != null ? d.revenueActual : 'pending'} vs estimate ${d.revenueEstimate ?? 'N/A'}. Track ${d.ticker} free on BullPen.`;
    }
    return 'Open the BullPen app to track earnings, prices, and your whole portfolio in one place.';
  }
  const kind = slideKindAt(slideIndex, content);
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

/** All fonts every slide kind might need — fetched once per render, cached across warm invocations by loadOgFont itself. */
export async function loadSlideFonts() {
  const [sans, sansBold, serif] = await Promise.all([
    loadOgFont('Geist', 400),
    loadOgFont('Geist', 700),
    loadOgFont('Instrument Serif', 400, true),
  ]);
  return [
    { name: 'Geist', data: sans, weight: 400 as const, style: 'normal' as const },
    { name: 'Geist', data: sansBold, weight: 700 as const, style: 'normal' as const },
    { name: 'Instrument Serif', data: serif, weight: 400 as const, style: 'italic' as const },
  ];
}

// ── Local brand assets, read once and cached as base64 data URIs ──────────
// More reliable than fetching our own deployed URL: no network round-trip,
// works identically in local dev and production without needing to know
// the app's own base URL.
const imageCache = new Map<string, string>();
let mascotDataUri: string | null = null;

function loadLocalImageDataUri(relativePath: string): string {
  const buf = readFileSync(join(process.cwd(), 'public', relativePath));
  return `data:image/png;base64,${buf.toString('base64')}`;
}

function getBrandIcon(onInk = false): string {
  const file = onInk ? 'BullPenLogo-dark.png' : 'BullPenLogo.png';
  if (!imageCache.has(file)) imageCache.set(file, loadLocalImageDataUri(file));
  return imageCache.get(file)!;
}

function getMascot(): string {
  if (!mascotDataUri) mascotDataUri = loadLocalImageDataUri('illustrations/bull-alert.png');
  return mascotDataUri;
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
function groupByDate<T extends { date: string }>(companies: T[]): { date: string; items: T[] }[] {
  const map = new Map<string, T[]>();
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
function Wordmark({ size = 36, onInk = false }: { size?: number; onInk?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={getBrandIcon(onInk)} alt="" width={size} height={size} />
      <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, letterSpacing: '-0.02em', fontSize: size * 0.8, color: onInk ? ON_INK : FG }}>
        bullpen
      </span>
    </div>
  );
}

/** "N / total" — shown on every slide (not just multi-page lists) so a
 *  viewer mid-scroll on Explore recognizes it's one carousel and knows
 *  how much is left, per the cross-slide consistency feedback. */
function SlideIndicator({ index, total, onInk = false }: { index: number; total: number; onInk?: boolean }) {
  return (
    <div style={{ display: 'flex', fontFamily: 'Geist', fontSize: 22, color: onInk ? ON_INK_MUTED : MUTED }}>
      {`${index + 1} / ${total}`}
    </div>
  );
}

/** Plain-language key at the foot of a data slide: what the numbers mean, for
 *  a reader who doesn't know what EPS is, plus where to go next. Also anchors
 *  the bottom of the canvas so a short list doesn't end in a blank half. */
function SlideFooter({ note }: { note: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 40, paddingTop: 28, borderTop: `1px solid ${BORDER}` }}>
      <span style={{ display: 'flex', fontFamily: 'Geist', fontSize: 22, lineHeight: 1.45, color: MUTED, maxWidth: 680 }}>{note}</span>
      <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 22, color: FG, flexShrink: 0 }}>Link in bio</span>
    </div>
  );
}

/** Shared frame for the ink covers: wordmark and counter on top, a faint
 *  emerald glow from the corner (the landing page's atmosphere), content
 *  spread over the rest. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function InkCover({ slideIndex, totalSlides, children }: { slideIndex: number; totalSlides: number; children: any }) {
  return (
    <div
      style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        padding: 88, backgroundColor: INK, backgroundImage: INK_GLOW, color: ON_INK,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Wordmark onInk />
        <SlideIndicator index={slideIndex} total={totalSlides} onInk />
      </div>
      {children}
    </div>
  );
}

/** A company logo on ink: a white disc (third-party logos are drawn for white),
 *  optionally ringed in the gain/loss color when the post is about a result. */
function InkLogo({ symbol, logoUrl, size, ring }: { symbol: string; logoUrl: string | null; size: number; ring?: string }) {
  return (
    <div style={{ display: 'flex', padding: ring ? 6 : 0, borderRadius: 999, backgroundColor: ring ?? 'transparent' }}>
      <div style={{ display: 'flex', width: size, height: size, borderRadius: 999, backgroundColor: BG, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: ring ? `4px solid ${INK}` : 'none' }}>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={`${symbol} logo`} width={size} height={size} style={{ objectFit: 'cover' }} />
        ) : (
          <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: Math.round(size * 0.3), color: FG }}>{symbol.slice(0, 4)}</span>
        )}
      </div>
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

/** Above lerp's spacious end: a 3-company week used to render 3 rows and leave
 *  over half the slide blank. At 3 or fewer rows grow to `roomy`, easing back
 *  to `spacious` by 6. */
function fit(n: number, roomy: number, spacious: number, compact: number): number {
  if (n >= 6) return Math.round(lerp(n, spacious, compact));
  const t = Math.min(1, Math.max(0, (n - 3) / 3));
  return Math.round(roomy + (spacious - roomy) * t);
}

/** Busy weeks are height-budgeted to the pixel (see rowMetrics); the footer
 *  key only fits while the list leaves room for it. */
const FOOTER_MAX_ROWS = 10;

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
    badgeSize: fit(n, 88, 56, 34),
    rowPaddingV: fit(n, 30, 20, 6),
    rowPaddingH: fit(n, 34, 28, 16),
    rowGap: fit(n, 24, 20, 6),
    rowRadius: fit(n, 26, 20, 12),
    symbolFontSize: fit(n, 50, 34, 19),
    nameFontSize: fit(n, 28, 22, 13),
    dateFontSize: fit(n, 24, 20, 12),
    timeFontSize: fit(n, 24, 20, 11),
    timePaddingV: fit(n, 8, 6, 3),
    timePaddingH: fit(n, 18, 16, 8),
    epsLabelFontSize: fit(n, 18, 15, 10),
    epsValueFontSize: fit(n, 40, 28, 16),
    headerMarginBottom: fit(n, 48, 40, 16),
    dateHeaderFontSize: fit(n, 22, 20, 12),
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
        display: 'flex', fontSize, fontWeight: 700, color: time === 'BMO' ? BMO_TEXT : AMC_TEXT,
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
      <span style={{ display: 'flex', fontFamily: 'Geist', fontSize: labelFontSize, color: MUTED }}>
        EPS est.
      </span>
      <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: valueFontSize, letterSpacing: '-0.02em', color: value != null ? FG : MUTED }}>
        {value != null ? formatEps(value) : 'N/A'}
      </span>
    </div>
  );
}

/** Company name (bold) over its ticker (muted): the app's list convention
 *  (see lib/market-data/display-names.ts), since several tickers mean nothing
 *  to a beginner on their own ("IT" is Gartner, "P" is Everpure). */
function NameStack({ name, ticker, nameSize, tickerSize, onInk = false }: { name: string; ticker: string; nameSize: number; tickerSize: number; onInk?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
      {/* clamp-ok: names are capped by truncateName before they get here */}
      <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: nameSize, lineHeight: 1.15, letterSpacing: '-0.02em', color: onInk ? ON_INK : FG, overflow: 'hidden', whiteSpace: 'nowrap' }}>
        {name}
      </span>
      <span style={{ display: 'flex', fontFamily: 'Geist', fontSize: tickerSize, lineHeight: 1.2, color: onInk ? ON_INK_MUTED : MUTED }}>{ticker}</span>
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
      <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize, letterSpacing: '0.08em', color: MUTED }}>
        {formatDateHeader(dateStr)}
      </span>
      <div style={{ display: 'flex', flex: 1, height: 1, backgroundColor: BORDER }} />
    </div>
  );
}

interface HookSlideProps {
  headline: string;
  weekLabel: string;
  /** The week's companies, in the post's own order. Their logos are the
   *  cover: the names are the news, so they no longer wait on slide 2. */
  companies: { symbol: string; logoUrl: string | null; status?: 'beat' | 'missed' }[];
  slideIndex: number;
  totalSlides: number;
  /** Results recap only: how many beat, which switches the cover's fact line
   *  and rings each logo in its result color. */
  beatCount?: number;
}

const COVER_LOGO_MAX = 8;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function HookSlide({ headline, weekLabel, companies, slideIndex, totalSlides, beatCount }: HookSlideProps): any {
  const isResults = beatCount != null;
  const n = companies.length;
  const overflow = n > COVER_LOGO_MAX ? n - (COVER_LOGO_MAX - 1) : 0;
  const shown = overflow ? companies.slice(0, COVER_LOGO_MAX - 1) : companies;
  const tiles = shown.length + (overflow ? 1 : 0);
  // Balanced rows (7 → 4 + 3, not 6 + 1), and bigger logos when there are few.
  const perRow = tiles <= 5 ? tiles : Math.ceil(tiles / 2);
  const logo = tiles <= 3 ? 168 : tiles <= 5 ? 136 : 120;
  const rows: typeof shown[] = [];
  for (let i = 0; i < shown.length; i += perRow) rows.push(shown.slice(i, i + perRow));
  const lastRowHasRoom = rows.length === 0 || rows[rows.length - 1].length < perRow;

  return (
    <InkCover slideIndex={slideIndex} totalSlides={totalSlides}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 64 }}>
        <div style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 80, lineHeight: 1.04, letterSpacing: '-0.035em', color: ON_INK, maxWidth: 900 }}>
          {headline}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
          {rows.map((row, r) => (
          <div key={r} style={{ display: 'flex', gap: 40 }}>
          {row.map((c) => (
            <div key={c.symbol} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <InkLogo symbol={c.symbol} logoUrl={c.logoUrl} size={logo} ring={c.status ? (c.status === 'beat' ? BRAND : LOSS) : undefined} />
              <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 28, color: ON_INK }}>{c.symbol}</span>
              {c.status && (
                <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 22, color: c.status === 'beat' ? BRAND : LOSS }}>
                  {c.status === 'beat' ? 'Beat' : 'Missed'}
                </span>
              )}
            </div>
          ))}
          {overflow > 0 && r === rows.length - 1 && lastRowHasRoom && (
            <div style={{ display: 'flex', width: logo, height: logo, borderRadius: 999, border: `2px solid ${INK_BORDER}`, alignItems: 'center', justifyContent: 'center', fontFamily: 'Geist', fontWeight: 700, fontSize: 36, color: ON_INK }}>
              {`+${overflow}`}
            </div>
          )}
          </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 40 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 36, letterSpacing: '-0.02em', color: ON_INK }}>
            {isResults
              ? `${beatCount} of ${n} beat what analysts expected`
              : `${n} ${n === 1 ? 'company reports' : 'companies report'} earnings`}
          </span>
          <span style={{ display: 'flex', fontFamily: 'Geist', fontSize: 26, color: ON_INK_MUTED }}>{weekLabel}</span>
        </div>
        <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 26, color: BRAND, flexShrink: 0 }}>Swipe for details</span>
      </div>
    </InkCover>
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
  const footerNote = 'EPS est. is the profit per share analysts expect. Times are US market hours.';
  const groups = groupByDate(companies);
  return (
    <div
      style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        padding: 80, backgroundColor: BG, color: FG, position: 'relative', overflow: 'hidden',
      }}
    >
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 20, flex: 1, minWidth: 0 }}>
                    <CompanyBadge symbol={c.symbol} logoUrl={c.logoUrl} size={m.badgeSize} />
                    <NameStack
                      name={earningsRowName(c.name, Math.round(m.symbolFontSize * 0.82))}
                      ticker={c.symbol}
                      nameSize={Math.round(m.symbolFontSize * 0.82)}
                      tickerSize={Math.round(m.nameFontSize * 0.85)}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexShrink: 0, marginLeft: 20 }}>
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
        <div style={{ display: 'flex', fontFamily: 'Geist', fontSize: 22, color: MUTED, marginTop: 24 }}>
          {`+${overflowCount} more this week on BullPen`}
        </div>
      )}
      {companies.length > 0 && companies.length <= FOOTER_MAX_ROWS && <SlideFooter note={footerNote} />}
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
        color: BRAND_INK,
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
      <span style={{ display: 'flex', fontFamily: 'Geist', fontSize: labelFontSize, color: MUTED }}>
        {`Expected ${formatEps(estimate)}`}
      </span>
      <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: valueFontSize, letterSpacing: '-0.02em', color: FG }}>
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
  const footerNote = 'Beat means profit per share (EPS) came in above what analysts expected.';
  const groups = groupByDate(companies);
  return (
    <div
      style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        padding: 80, backgroundColor: BG, color: FG, position: 'relative', overflow: 'hidden',
      }}
    >
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 20, flex: 1, minWidth: 0 }}>
                  <CompanyBadge symbol={c.symbol} logoUrl={c.logoUrl} size={m.badgeSize} />
                  <NameStack
                    name={earningsRowName(c.name, Math.round(m.symbolFontSize * 0.82))}
                    ticker={c.symbol}
                    nameSize={Math.round(m.symbolFontSize * 0.82)}
                    tickerSize={Math.round(m.nameFontSize * 0.85)}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexShrink: 0, marginLeft: 20 }}>
                  <EpsCompareStat estimate={c.epsEstimate} actual={c.epsActual} labelFontSize={m.epsLabelFontSize} valueFontSize={m.epsValueFontSize} />
                  <ResultBadge status={c.status} fontSize={m.timeFontSize} paddingV={m.timePaddingV} paddingH={m.timePaddingH} />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {overflowCount > 0 && (
        <div style={{ display: 'flex', fontFamily: 'Geist', fontSize: 22, color: MUTED, marginTop: 24 }}>
          {`+${overflowCount} more this week on BullPen`}
        </div>
      )}
      {companies.length > 0 && companies.length <= FOOTER_MAX_ROWS && <SlideFooter note={footerNote} />}
    </div>
  );
}

// ── Market Movers (winners/losers) slide elements ──────────────────────────
// One component, two call sites (winners=positive, losers=!positive) — see
// MarketMoversSlides handling in the render route. Opens the carousel
// itself (no separate hook slide, per the reference design this was built
// from) rather than following the hook->list->cta shape the earnings posts
// use, since a fixed 5-row list needs no pagination.

/** Fixed track width for the % bar badge, sized to comfortably fit a
 *  5-character label ("+13.70%") inside even a floored 20%-width bar. */
const MOVER_BAR_TRACK_WIDTH = 380;
const MOVER_BAR_HEIGHT = 60;
/** Floor so the smallest mover's bar (relative to the largest on the same
 *  slide) never shrinks to an illegibly thin sliver. */
const MOVER_BAR_MIN_FRACTION = 0.2;

/** One winner/loser row's % badge — a filled, rounded-rect bar whose width
 *  scales with the move's size relative to the largest mover on the same
 *  slide, label right-aligned inside the fill. Both direction colors are
 *  meaningful here (gain vs loss), the same case DESIGN.md's One Signal
 *  Rule already carves out — see this file's header comment on
 *  MISSED_COLOR, which is reused here rather than defining a new red. */
/** Upper-bound per-character advance at MOVER_BAR_LABEL_FONT_SIZE, bold
 *  (Satori has no text-measurement API). Was measured for Geist Mono; Geist
 *  Sans is narrower, so it stays a safe ceiling. Used only to guarantee the
 *  pill never renders narrower than its own label needs. */
const MOVER_BAR_LABEL_CHAR_WIDTH = 15.5;
const MOVER_BAR_LABEL_FONT_SIZE = 26;
const MOVER_BAR_LABEL_PADDING = 18; // matches the pill's `padding: '0 18px'` below, per side

function MoverBar({ changePercent, maxAbs, positive }: { changePercent: number; maxAbs: number; positive: boolean }) {
  const sign = changePercent >= 0 ? '+' : '';
  const label = `${sign}${changePercent.toFixed(2)}%`;

  const fraction = Math.max(MOVER_BAR_MIN_FRACTION, maxAbs > 0 ? Math.abs(changePercent) / maxAbs : MOVER_BAR_MIN_FRACTION);
  const scaledWidth = Math.round(fraction * MOVER_BAR_TRACK_WIDTH);
  // A magnitude-proportional bar can end up narrower than its own label on a
  // slide where one mover dwarfs the rest (e.g. HPQ -12.88% vs NFLX -1.20%
  // on the same axis) — the label used to overflow the pill into the page
  // background, where its white/near-white color made it unreadable. The
  // pill's own text is never allowed to be the thing that gets clipped.
  const minWidthForLabel = Math.ceil(label.length * MOVER_BAR_LABEL_CHAR_WIDTH + MOVER_BAR_LABEL_PADDING * 2);
  const width = Math.min(MOVER_BAR_TRACK_WIDTH, Math.max(scaledWidth, minWidthForLabel));

  const color = positive ? BRAND : MISSED_COLOR;
  return (
    <div style={{ display: 'flex', width: MOVER_BAR_TRACK_WIDTH, height: MOVER_BAR_HEIGHT, justifyContent: 'flex-end' }}>
      <div
        style={{
          display: 'flex', width, height: MOVER_BAR_HEIGHT, borderRadius: 10,
          backgroundColor: color, alignItems: 'center', justifyContent: 'flex-end',
          padding: `0 ${MOVER_BAR_LABEL_PADDING}px`,
        }}
      >
        <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: MOVER_BAR_LABEL_FONT_SIZE, color: BRAND_INK }}>
          {label}
        </span>
      </div>
    </div>
  );
}

/** Manual truncation instead of CSS text-overflow: ellipsis — verified live
 *  that Satori doesn't render the CSS ellipsis glyph correctly here (it
 *  showed a broken/tofu character instead of "..."), so the safe fix is a
 *  real "..." in the text content itself, not a CSS property. */
function truncateName(name: string, maxChars = 26): string {
  return name.length > maxChars ? `${name.slice(0, maxChars).trimEnd()}...` : name;
}

/** Earnings-row company name: the app's short display name (no share-class
 *  or legal suffixes), then capped. MKC's full legal name once pushed the EPS
 *  stat and time badge off the canvas. The row's flex guard is the second
 *  line of defence if a name still runs long. */
function earningsRowName(name: string, fontSize: number): string {
  // The row's room for the name is roughly fixed, so a bigger font (short
  // weeks) fits fewer characters: STZ clipped mid-letter at 28px on 32.
  const maxChars = Math.max(16, Math.min(32, Math.floor(900 / fontSize)));
  return truncateName(displayCompanyName(name), maxChars);
}

interface MoversListSlideProps {
  /** Footer key: what the % is measured against ("previous close" daily,
   *  the period's first close weekly/monthly). */
  changeNote: string;
  title: string;
  subtitle: string;
  entries: MarketMoverEntry[];
  positive: boolean;
  slideIndex: number;
  totalSlides: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function MoversListSlide({ title, subtitle, entries, positive, changeNote, slideIndex, totalSlides }: MoversListSlideProps): any {
  const maxAbs = Math.max(...entries.map((e) => Math.abs(e.changePercent)), 0.01);
  // "Daily Winners": the session word in sans, the result word as the serif
  // accent in its own gain/loss color, so the slide says which side it is.
  const words = title.trim().split(/\s+/);
  const accent = words.pop() ?? title;
  const lead = words.join(' ');
  return (
    <div
      style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        padding: 80, backgroundColor: BG, color: FG,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <Wordmark />
        <SlideIndicator index={slideIndex} total={totalSlides} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 40 }}>
        {/* One phrase, not two labels: one word space between them (W
            carries extra italic bearing, L none), and the serif only a step larger
            so both share roughly one cap height. */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 10 }}>
          {lead && (
            <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 68, lineHeight: 1, letterSpacing: '-0.035em', color: FG }}>{lead}</span>
          )}
          <span style={{ display: 'flex', fontFamily: 'Instrument Serif', fontStyle: 'italic', fontSize: 72, lineHeight: 1, letterSpacing: '-0.01em', color: positive ? GAIN_TEXT : LOSS_TEXT }}>{accent}</span>
        </div>
        <div style={{ display: 'flex', fontFamily: 'Geist', fontSize: 24, color: MUTED }}>
          {subtitle}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 22, flex: 1 }}>
        {entries.map((entry) => (
          <div key={entry.symbol} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flex: 1, minWidth: 0 }}>
              <CompanyBadge symbol={entry.symbol} logoUrl={entry.logoUrl} size={60} />
              {/* Name first: beginners know "Gartner", not "IT". Stacked over
                  the ticker so a long name gets the row's full width; the
                  fixed 380px bar track sits to the right either way. */}
              <NameStack name={truncateName(displayCompanyName(entry.name), 30)} ticker={entry.symbol} nameSize={26} tickerSize={20} />
            </div>
            <MoverBar changePercent={entry.changePercent} maxAbs={maxAbs} positive={positive} />
          </div>
        ))}
      </div>

      <SlideFooter note={changeNote} />
    </div>
  );
}

interface MoversCoverSlideProps {
  /** "The day's" / "The week's" / "The month's" / "Pre-market's". */
  when: string;
  dateLabel: string;
  gainer: MarketMoverEntry;
  loser: MarketMoverEntry;
  slideIndex: number;
  totalSlides: number;
}

function CoverMover({ entry, positive }: { entry: MarketMoverEntry; positive: boolean }) {
  const color = positive ? BRAND : LOSS;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 24, letterSpacing: '0.08em', color }}>
        {positive ? 'BIGGEST GAIN' : 'BIGGEST DROP'}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28, minWidth: 0, flex: 1 }}>
          <InkLogo symbol={entry.symbol} logoUrl={entry.logoUrl} size={120} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, flex: 1 }}>
            {/* Wraps to a second line rather than cut: "Cognizant Technology Solutions". */}
            <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 46, lineHeight: 1.05, letterSpacing: '-0.03em', color: ON_INK }}>
              {truncateName(displayCompanyName(entry.name), 32)}
            </span>
            <span style={{ display: 'flex', fontFamily: 'Geist', fontSize: 26, color: ON_INK_MUTED }}>{entry.symbol}</span>
          </div>
        </div>
        <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 112, letterSpacing: '-0.045em', color, flexShrink: 0 }}>
          {formatPercentSigned(entry.changePercent)}
        </span>
      </div>
    </div>
  );
}

/** Movers cover: the one number someone stops scrolling for, each way. The
 *  full top 10s follow on white list slides. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function MoversCoverSlide({ when, dateLabel, gainer, loser, slideIndex, totalSlides }: MoversCoverSlideProps): any {
  return (
    <InkCover slideIndex={slideIndex} totalSlides={totalSlides}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 72 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 84, lineHeight: 1.02, letterSpacing: '-0.04em', color: ON_INK }}>
            {`${when} biggest`}
          </span>
          <span style={{ display: 'flex', fontFamily: 'Instrument Serif', fontStyle: 'italic', fontSize: 120, lineHeight: 1, color: ON_INK }}>moves.</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 44 }}>
          <CoverMover entry={gainer} positive />
          <div style={{ display: 'flex', height: 1, backgroundColor: INK_BORDER }} />
          <CoverMover entry={loser} positive={false} />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 40 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 30, color: ON_INK }}>Top 10 up and down</span>
          <span style={{ display: 'flex', fontFamily: 'Geist', fontSize: 24, color: ON_INK_MUTED }}>{`S&P 500 and Nasdaq 100 · ${dateLabel}`}</span>
        </div>
        <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 26, color: BRAND, flexShrink: 0 }}>Swipe for the list</span>
      </div>
    </InkCover>
  );
}

// ── Earnings Deep Dive (single-company, on-demand) slide elements ──────────
// Triggered per-report the moment it drops (see lib/edgar/edgar-watch.ts and
// lib/instagram/content/earnings-deep-dive.ts) rather than on a weekly cron.
// Reuses this file's existing tokens/atoms (Wordmark, SlideIndicator,
// CompanyBadge, BRAND/MISSED_COLOR, formatEps) instead of a parallel style
// system — a one-off post still has to read as the same brand as every
// other carousel. Fixed 2-slide shape — summary card, then the shared
// CTASlide (see totalSlideCount/slideKindAt below) — no pagination since
// there's only ever one company.

const INLINE_COLOR = AMC_COLOR; // amber — neutral "in line with estimates" state, no gain/loss direction to signal

/** "$46.7B" / "-$1.2M" / "$823.40" below $1K — compact form for revenue-scale
 *  dollar figures; falls back to plain 2-decimal formatting under $1,000 so a
 *  small dollar figure (e.g. a per-share buyback price) never renders as
 *  "$0.0K". */
function formatUsdCompact(v: number): string {
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(abs / 1e9 >= 100 ? 0 : 1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(abs / 1e6 >= 100 ? 0 : 1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

function formatPercentSigned(v: number, decimals = 1): string {
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(decimals)}%`;
}

/**
 * A guidance range, without printing one whose ends look identical.
 *
 * formatUsdCompact rounds to one decimal, so Adobe guiding $6.80B to $6.85B
 * rendered as "$6.8B–$6.8B" — a range that reads as broken while hiding a real
 * $50M spread. When both ends collapse to the same string, go one decimal
 * deeper rather than show that.
 */
function formatUsdRange(low: number, high: number): string {
  const lo = formatUsdCompact(low);
  const hi = formatUsdCompact(high);
  if (lo !== hi) return `${lo}–${hi}`;

  const abs = Math.abs(high);
  const scale = abs >= 1e9 ? 1e9 : abs >= 1e6 ? 1e6 : 0;
  if (scale === 0) return lo; // sub-million: already 2dp, genuinely the same number

  const unit = scale === 1e9 ? 'B' : 'M';
  const precise = (v: number) => `${v < 0 ? '-' : ''}$${Math.abs(v / scale).toFixed(2)}${unit}`;
  const loPrecise = precise(low);
  const hiPrecise = precise(high);
  // Still identical at 2dp means it really is one number, not a range.
  return loPrecise === hiPrecise ? lo : `${loPrecise}–${hiPrecise}`;
}

/** BEAT (emerald) / MISS (red) / IN LINE (amber) — the one deep-dive
 *  component with a third neutral state: a same-as-consensus result is
 *  common enough on revenue/EPS that forcing it into beat-or-miss would
 *  misrepresent it either direction. */
function DeepDiveStatusBadge({ status, size = 'lg' }: { status: 'beat' | 'missed' | 'inline'; size?: 'lg' | 'sm' }) {
  const color = status === 'beat' ? BRAND : status === 'missed' ? MISSED_COLOR : INLINE_COLOR;
  const ink = BRAND_INK;
  const label = status === 'beat' ? 'BEAT' : status === 'missed' ? 'MISS' : 'IN LINE';
  const fontSize = size === 'lg' ? 30 : 20;
  const padding = size === 'lg' ? '14px 32px' : '8px 18px';
  return (
    <div style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, letterSpacing: '0.04em', fontSize, color: ink, backgroundColor: color, padding, borderRadius: 999 }}>
      {label}
    </div>
  );
}

function ReportTimingBadge({ timing }: { timing: 'BMO' | 'AMC' | null }) {
  if (!timing) return null;
  const color = timing === 'BMO' ? BMO_COLOR : AMC_COLOR;
  return (
    <div style={{ display: 'flex', fontSize: 22, fontWeight: 700, color, fontFamily: 'Geist', padding: '8px 18px', borderRadius: 999, backgroundColor: `${color}26` }}>
      {timing === 'BMO' ? 'Before Open' : 'After Close'}
    </div>
  );
}

function CompanyIdentity({ data, badgeSize = 72 }: { data: EarningsDeepDiveData; badgeSize?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
      <InkLogo symbol={data.ticker} logoUrl={data.logoUrl} size={badgeSize} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: Math.round(badgeSize * 0.5), letterSpacing: '-0.03em', color: ON_INK }}>
          {displayCompanyName(data.companyName)}
        </span>
        <span style={{ display: 'flex', fontFamily: 'Geist', fontSize: Math.round(badgeSize * 0.3), color: ON_INK_MUTED }}>
          {`$${data.ticker}`}
        </span>
      </div>
    </div>
  );
}

interface DeepDiveSlideProps {
  data: EarningsDeepDiveData;
}

/** Derived purely for display — mirrors earnings-deep-dive.ts's own
 *  INLINE_BAND_PERCENT (0.5%) treatment of EPS/revenue, applied to the
 *  guidance midpoint vs. consensus so the metric grid can show a BEAT/MISS/
 *  IN LINE badge consistent with the other three cells. Not persisted:
 *  guidance status was never worth a schema field of its own since nothing
 *  downstream (Discord summary, headline/caption) reads it — only this card
 *  displays it. */
function guidanceStatus(low: number | null, high: number | null, consensus: number | null): 'beat' | 'missed' | 'inline' | null {
  if (low == null || high == null || consensus == null || consensus === 0) return null;
  const midpoint = (low + high) / 2;
  const diffPercent = ((midpoint - consensus) / Math.abs(consensus)) * 100;
  if (Math.abs(diffPercent) < 0.5) return 'inline';
  return diffPercent > 0 ? 'beat' : 'missed';
}

/** "Maintained 75.0%" / "+0.3pp QoQ" / "-1.2pp QoQ" — gross margin has no
 *  analyst consensus worth showing, so its badge-equivalent is a sequential
 *  comparison instead (percentage POINTS, not percent, since a margin move
 *  is already a percentage — "+0.3pp" avoids the "+0.3%" ambiguity). A
 *  near-zero move reads as "Maintained X%" rather than "Flat QoQ": holding
 *  a margin steady while revenue scales is itself the beat, not a non-event
 *  worth a shrug-word. */
function marginQoqLabel(prior: number | null, actual: number | null): string | null {
  if (prior == null || actual == null) return null;
  const diff = actual - prior;
  if (Math.abs(diff) < 0.3) return `Maintained ${actual.toFixed(1)}%`;
  return `${diff > 0 ? '+' : ''}${diff.toFixed(1)}pp QoQ`;
}

/** One metric tile in the summary grid — label, an optional "vs. estimate"
 *  context line, the headline number (Signal Emerald on a beat, black
 *  otherwise — the number itself carries the result, not just its badge),
 *  and an optional status badge + footnote. No arrow glyph between estimate
 *  and actual: Satori renders "→" noticeably off the text baseline at this
 *  weight/size, which read as a misaligned bug rather than a connector, so
 *  the estimate sits as its own small line above the number instead. Same
 *  surface/border/radius language as the segment callouts the old per-topic
 *  slides used, just sized to share a 2x2 grid instead of owning a whole
 *  slide. */
function MetricCell({
  label, fromValue, toValue, status, footnote,
}: {
  label: string; fromValue: string | null; toValue: string; status?: 'beat' | 'missed' | 'inline' | null; footnote?: string | null;
}) {
  const toColor = status === 'beat' ? BRAND : status === 'missed' ? LOSS : ON_INK;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, padding: 40, borderRadius: 28, backgroundColor: INK_SURFACE, border: `1px solid ${INK_BORDER}` }}>
      <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 24, color: ON_INK }}>
        {label}
      </span>
      {fromValue && (
        <span style={{ display: 'flex', fontFamily: 'Geist', fontSize: 22, color: ON_INK_MUTED }}>{fromValue}</span>
      )}
      <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 64, letterSpacing: '-0.04em', color: toColor }}>{toValue}</span>
      {(status || footnote) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          {status && <DeepDiveStatusBadge status={status} size="sm" />}
          {footnote && (
            <span style={{ display: 'flex', fontFamily: 'Geist', fontSize: 22, color: ON_INK_MUTED }}>{footnote}</span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Single info-dense summary card — replaces the old fixed 5-slide carousel
 * (hero/revenue/profitability/guidance/reaction). Brief: no hook, no
 * narrative pacing across slides, just every headline number in one place
 * plus a bottom CTA — "let the data speak." A 2x2 metric grid instead of one
 * number per screen means EPS, revenue, margin, and guidance are all visible
 * at once, which is also just a more useful single feed post than a 5-tap
 * carousel for a fact someone wants to check in passing.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function DeepDiveSummarySlide({ data }: DeepDiveSlideProps): any {
  const marginFootnote = marginQoqLabel(data.grossMarginPriorQuarterPercent, data.grossMarginActualPercent);
  const hasGuidanceRange = data.guidanceRevenueLow != null && data.guidanceRevenueHigh != null;

  /**
   * The second row is built from whatever we actually have, rather than being
   * two fixed cards that fall back to "N/A".
   *
   * A card reading GROSS MARGIN / Prior 89.2% / N/A shipped on the Adobe post:
   * it occupies a quarter of the image to announce a number we don't know,
   * while showing a prior-quarter figure right above the hole, which reads as
   * a rendering fault rather than missing data. Better to drop the card and
   * let its neighbour take the row.
   *
   * secondaryMetricValue (free cash flow, or operating margin) is computed in
   * earnings-deep-dive.ts and was never rendered anywhere. It stands in when
   * gross margin is missing, so a company that reports one but not the other
   * still fills the row.
   */
  const secondRow = [
    data.grossMarginActualPercent != null ? (
      <MetricCell
        key="margin"
        label="Gross Margin"
        fromValue={data.grossMarginPriorQuarterPercent != null ? `Prior ${data.grossMarginPriorQuarterPercent.toFixed(1)}%` : null}
        toValue={`${data.grossMarginActualPercent.toFixed(1)}%`}
        footnote={marginFootnote}
      />
    ) : data.secondaryMetricValue != null && data.secondaryMetricLabel ? (
      <MetricCell
        key="secondary"
        label={data.secondaryMetricLabel}
        fromValue={null}
        toValue={
          data.secondaryMetricIsCurrency
            ? formatUsdCompact(data.secondaryMetricValue)
            : `${data.secondaryMetricValue.toFixed(1)}%`
        }
      />
    ) : null,
    hasGuidanceRange ? (
      <MetricCell
        key="guidance"
        label="Next quarter's revenue outlook"
        fromValue={null}
        toValue={formatUsdRange(data.guidanceRevenueLow as number, data.guidanceRevenueHigh as number)}
        status={guidanceStatus(data.guidanceRevenueLow, data.guidanceRevenueHigh, data.guidanceConsensus)}
        footnote={data.guidanceConsensus != null ? `vs. ${formatUsdCompact(data.guidanceConsensus)} consensus` : null}
      />
    ) : null,
  ].filter(Boolean);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 88, backgroundColor: INK, backgroundImage: INK_GLOW, color: ON_INK }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
        <div style={{ display: 'flex', zIndex: 1 }}>
          <Wordmark onInk />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <CompanyIdentity data={data} badgeSize={80} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ display: 'flex', fontFamily: 'Geist', fontSize: 24, color: ON_INK_MUTED }}>
              {data.fiscalPeriodLabel ? `${data.fiscalPeriodLabel} · ` : ''}{formatDateHeader(data.reportDate)}
            </span>
            <ReportTimingBadge timing={data.reportTiming} />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        <div style={{ display: 'flex', gap: 20 }}>
          <MetricCell
            label="Profit per share (EPS)"
            fromValue={data.epsEstimate != null ? `Est. ${formatEps(data.epsEstimate)}` : null}
            toValue={data.epsActual != null ? formatEps(data.epsActual) : 'N/A'}
            status={data.epsStatus}
            footnote={data.epsSurprisePercent != null ? formatPercentSigned(data.epsSurprisePercent) : null}
          />
          <MetricCell
            label="Revenue"
            fromValue={data.revenueEstimate != null ? `Est. ${formatUsdCompact(data.revenueEstimate)}` : null}
            toValue={data.revenueActual != null ? formatUsdCompact(data.revenueActual) : 'N/A'}
            status={data.revenueStatus}
            footnote={data.revenueYoyGrowthPercent != null ? `${formatPercentSigned(data.revenueYoyGrowthPercent)} YoY` : null}
          />
        </div>
        {secondRow.length > 0 && (
          <div style={{ display: 'flex', gap: 20 }}>{secondRow}</div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
        <span style={{ display: 'flex', fontFamily: 'Geist', fontSize: 26, color: ON_INK_MUTED }}>
          {`Track $${data.ticker} free on BullPen. Link in bio.`}
        </span>
        <div style={{ display: 'flex', fontFamily: 'Geist', fontSize: 26, fontWeight: 700, color: BRAND_INK, backgroundColor: BRAND, padding: '18px 44px', borderRadius: 999 }}>
          {SITE_HOST}
        </div>
      </div>
    </div>
  );
}

// ── Weekly Pick scoreboard (picks vs the S&P 500) ──────────────────────────
// Numbers are colored by their own sign, never by who is winning: red means a
// number went down, so the S&P in red on a week it rose would be false.

const signColor = (v: number, onInk: boolean) => (v >= 0 ? (onInk ? BRAND : GAIN_TEXT) : (onInk ? LOSS : LOSS_TEXT));

/** "Aug 4" from YYYY-MM-DD. */
const shortDate = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function ScoreColumn({ label, icon, value, note }: { label: string; icon: boolean; value: number; note: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {icon && <img src={getBrandIcon(true)} alt="" width={40} height={40} />}
        <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 30, color: ON_INK }}>{label}</span>
      </div>
      <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 104, lineHeight: 1, letterSpacing: '-0.045em', color: signColor(value, true) }}>
        {formatPercentSigned(value)}
      </span>
      <span style={{ display: 'flex', fontFamily: 'Geist', fontSize: 24, color: ON_INK_MUTED }}>{note}</span>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ScoreboardCoverSlide({ data, slideIndex, totalSlides, disclaimer }: { data: PicksScoreboardSlides; slideIndex: number; totalSlides: number; disclaimer: string }): any {
  const lead = data.totalReturnPct - data.benchmarkReturnPct;
  const ahead = lead >= 0;
  const week = data.weekChangePts;
  return (
    <InkCover slideIndex={slideIndex} totalSlides={totalSlides}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 64 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 76, lineHeight: 1.02, letterSpacing: '-0.04em', color: ON_INK }}>Our picks vs</span>
          <span style={{ display: 'flex', fontFamily: 'Instrument Serif', fontStyle: 'italic', fontSize: 108, lineHeight: 1, color: ON_INK }}>the S&amp;P 500.</span>
        </div>

        <div style={{ display: 'flex', gap: 40 }}>
          <ScoreColumn label="Our picks" icon value={data.totalReturnPct} note={`since ${data.sinceLabel}, ${data.pickCount} picks`} />
          <div style={{ display: 'flex', width: 1, backgroundColor: INK_BORDER }} />
          <ScoreColumn label="S&P 500" icon={false} value={data.benchmarkReturnPct} note="bought on the same days" />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-start' }}>
          <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 34, color: BRAND_INK, backgroundColor: ahead ? BRAND : LOSS, padding: '12px 26px', borderRadius: 999 }}>
            {`${Math.abs(lead).toFixed(1)} points ${ahead ? 'ahead of' : 'behind'} the S&P 500`}
          </span>
          <span style={{ display: 'flex', fontFamily: 'Geist', fontSize: 26, color: ON_INK_MUTED }}>
            {[
              week != null ? `This week ${week >= 0 ? '+' : ''}${week.toFixed(1)} points` : null,
              `${data.beatCount} of ${data.pickCount} picks beat the S&P 500`,
            ].filter(Boolean).join(' · ')}
          </span>
        </div>
      </div>

      <span style={{ display: 'flex', fontFamily: 'Geist', fontSize: 19, lineHeight: 1.45, color: ON_INK_MUTED }}>{disclaimer}</span>
    </InkCover>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ScoreboardListSlide({ data, page, slideIndex, totalSlides }: { data: PicksScoreboardSlides; page: number; slideIndex: number; totalSlides: number }): any {
  const rows = data.picks.slice(page * SCOREBOARD_PER_PAGE, (page + 1) * SCOREBOARD_PER_PAGE);
  // Rows share ~840px: up to 11 picks get the roomy size, 16 the compact one.
  const unit = 840 / Math.max(rows.length, 11);
  const badge = Math.round(Math.min(58, unit * 0.68));
  const gap = Math.round(Math.min(22, unit * 0.26));
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', padding: 80, backgroundColor: BG, color: FG }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <Wordmark />
        <SlideIndicator index={slideIndex} total={totalSlides} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 10 }}>
          <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 68, lineHeight: 1, letterSpacing: '-0.035em', color: FG }}>Every</span>
          <span style={{ display: 'flex', fontFamily: 'Instrument Serif', fontStyle: 'italic', fontSize: 72, lineHeight: 1, color: FG }}>pick</span>
        </div>
        <span style={{ display: 'flex', fontFamily: 'Geist', fontSize: 24, lineHeight: 1.4, color: MUTED }}>
          {`Return since each pick's first open, next to the S&P 500 over the same days. As of ${data.asOfLabel}.`}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap, flex: 1 }}>
        {rows.map((p) => {
          const ahead = p.returnPct > p.benchmarkReturnPct;
          return (
            <div key={p.symbol + p.pickDate} style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <CompanyBadge symbol={p.symbol} logoUrl={p.logoUrl} size={badge} />
              <NameStack
                name={truncateName(displayCompanyName(p.name), 26)}
                ticker={`${p.symbol} · picked ${shortDate(p.pickDate)}`}
                nameSize={Math.round(badge * 0.46)}
                tickerSize={Math.round(badge * 0.34)}
              />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: Math.round(badge * 0.5), letterSpacing: '-0.02em', color: signColor(p.returnPct, false) }}>
                  {formatPercentSigned(p.returnPct)}
                </span>
                <span style={{ display: 'flex', fontFamily: 'Geist', fontSize: Math.round(badge * 0.34), color: MUTED }}>
                  {`S&P ${formatPercentSigned(p.benchmarkReturnPct)}`}
                </span>
              </div>
              <span style={{ display: 'flex', width: Math.round(badge * 1.9), justifyContent: 'center', flexShrink: 0, fontFamily: 'Geist', fontWeight: 700, fontSize: Math.round(badge * 0.32), padding: `${Math.round(badge * 0.1)}px 0`, borderRadius: 999, color: ahead ? GAIN_TEXT : MUTED, backgroundColor: ahead ? `${BRAND}26` : SURFACE }}>
                {ahead ? 'Ahead' : 'Behind'}
              </span>
            </div>
          );
        })}
      </div>

      <SlideFooter note="Ahead means the pick beat the S&P 500 over the same days." />
    </div>
  );
}

/** Model-written lines are never cut on a slide (CLAUDE.md): they wrap. The
 *  generator drops a line too long to fit (MAX_WHY_CHARS) rather than slicing it. */
function LabeledLine({ label, text }: { label: string; text: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 20, letterSpacing: '0.06em', color: MUTED }}>{label}</span>
      <span style={{ display: 'flex', fontFamily: 'Geist', fontSize: 27, lineHeight: 1.38, color: FG }}>{text}</span>
    </div>
  );
}

function Callout({ c, best }: { c: ScoreboardCallout; best: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 22, letterSpacing: '0.08em', color: best ? GAIN_TEXT : LOSS_TEXT }}>
        {best ? 'BIGGEST WINNER' : 'BIGGEST LOSER'}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <CompanyBadge symbol={c.symbol} logoUrl={c.logoUrl} size={84} />
        <NameStack name={truncateName(displayCompanyName(c.name), 27)} ticker={`${c.symbol} · picked ${shortDate(c.pickDate)}`} nameSize={36} tickerSize={24} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
          <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 64, lineHeight: 1, letterSpacing: '-0.04em', color: signColor(c.returnPct, false) }}>{formatPercentSigned(c.returnPct)}</span>
          <span style={{ display: 'flex', fontFamily: 'Geist', fontSize: 22, color: MUTED, marginTop: 6 }}>{`S&P ${formatPercentSigned(c.benchmarkReturnPct)}, same days`}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <LabeledLine label="PICKED FOR" text={c.pickedFor} />
        {c.movedBy && <LabeledLine label="WHAT MOVED IT" text={c.movedBy} />}
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ScoreboardCalloutsSlide({ data, slideIndex, totalSlides }: { data: PicksScoreboardSlides; slideIndex: number; totalSlides: number }): any {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', padding: 80, backgroundColor: BG, color: FG }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 48 }}>
        <Wordmark />
        <SlideIndicator index={slideIndex} total={totalSlides} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 44, flex: 1 }}>
        <Callout c={data.best} best />
        <div style={{ display: 'flex', height: 1, backgroundColor: BORDER }} />
        <Callout c={data.worst} best={false} />
      </div>
      <SlideFooter note="Picked for: the reason given on the pick day. What moved it: news since then." />
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
    <div style={{ display: 'flex', gap: 56, marginBottom: 48 }}>
      {items.map(({ Icon, label }) => (
        <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              display: 'flex', width: 84, height: 84, borderRadius: 999,
              backgroundColor: SURFACE, border: `1px solid ${BORDER}`, alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Icon size={36} />
          </div>
          <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 24, color: FG }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

/** Content type a CTA slide is closing out — drives which headline/subtitle
 *  pairing it shows, so the conversion pitch actually follows from what the
 *  viewer just scrolled through instead of always pitching earnings alerts
 *  on a market-movers or deep-dive post that never mentioned a "report". */
export type CTAVariant = 'earnings_calendar' | 'earnings_results' | 'market_movers' | 'earnings_deep_dive' | 'picks_scoreboard';

const CTA_COPY: Record<CTAVariant, { headline: string; subtitle: (ticker?: string) => string }> = {
  earnings_calendar: {
    headline: 'Never miss a report again',
    subtitle: () => 'Track earnings, prices, and your whole portfolio in one place.',
  },
  earnings_results: {
    headline: 'Know the reaction, not just the news',
    subtitle: () => 'Follow every earnings beat, miss, and price move in real time.',
  },
  market_movers: {
    headline: 'Never miss a move again',
    subtitle: () => "Track the market's biggest winners and losers, every single day.",
  },
  picks_scoreboard: {
    headline: 'A new pick every Monday',
    subtitle: () => 'See every pick, why it was made, and the full track record on BullPen.',
  },
  earnings_deep_dive: {
    headline: 'Get this deep dive on any stock',
    subtitle: (ticker) =>
      ticker
        ? `Free AI-powered financials, valuation, and risk breakdowns, on $${ticker} and every other stock.`
        : 'Free AI-powered financials, valuation, and risk breakdowns, on any stock.',
  },
};

interface CTASlideProps {
  slideIndex: number;
  totalSlides: number;
  variant?: CTAVariant;
  ticker?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function CTASlide({ slideIndex, totalSlides, variant = 'earnings_calendar', ticker }: CTASlideProps): any {
  const { headline, subtitle } = CTA_COPY[variant];

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
        {headline}
      </div>
      <div style={{ display: 'flex', fontFamily: 'Geist', fontSize: 26, color: MUTED, marginBottom: 44, maxWidth: 700, textAlign: 'center' }}>
        {subtitle(ticker)}
      </div>

      <FeatureRow />

      <div
        style={{
          display: 'flex', fontFamily: 'Geist', fontSize: 28, fontWeight: 700, color: BRAND_INK,
          backgroundColor: BRAND, padding: '20px 48px', borderRadius: 999,
        }}
      >
        {SITE_HOST}
      </div>
      <div style={{ display: 'flex', fontFamily: 'Geist', fontSize: 24, color: MUTED, marginTop: 18 }}>
        Free to start. Tap the link in our bio.
      </div>
    </div>
  );
}
