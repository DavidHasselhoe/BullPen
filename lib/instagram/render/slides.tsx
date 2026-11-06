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
  MarketMoverEntry,
  InstagramPostSlides,
  EarningsDeepDiveData,
  PicksScoreboardSlides,
  PriceReaction,
  ScoreboardCallout,
} from '@/lib/instagram/content/schema';

import { SITE_HOST } from '@/lib/site';
import { buildStory, epsSurpriseVsHistoryBasis, guidanceVsConsensus, statusFor, type StoryPoint } from '@/lib/instagram/content/deep-dive-story';
import { reactionCaptionLine, reactionTimeLabel } from '@/lib/instagram/content/price-reaction';
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

// Covers (the first slide, which is all most people see) are ink, in the
// landing page's identity, so a BullPen post is recognisable in the grid and
// doesn't dissolve into Instagram's own white UI. Data slides stay white:
// that is where the logos need it (see the header comment).
const INK = '#0c100e'; // DESIGN.md bg-dark, oklch(0.145 0.008 162)
const INK_BORDER = 'rgba(255,255,255,0.10)';
const ON_INK = '#fafafa';
const ON_INK_MUTED = '#a3a8a6';
const INK_GLOW = 'radial-gradient(circle at 12% 0%, rgba(52,211,153,0.20), rgba(52,211,153,0) 55%)';
const LOSS = '#f87171'; // red-400, the mirror of BRAND; dark text on it, like BRAND
// Gain/loss as TEXT on white: the 400s are under 3:1 there.
const GAIN_TEXT = '#059669'; // emerald-600
const LOSS_TEXT = '#dc2626'; // red-600

export type SlideKind =
  | 'cta' | 'movers_cover' | 'winners' | 'losers'
  | 'deepdive_scoreboard' | 'deepdive_story' | 'deepdive_reaction'
  | 'scoreboard_cover' | 'scoreboard_list' | 'scoreboard_callouts' | 'calendar_grid';

/** Picks per scoreboard list page. Every pick is shown; past this the list paginates. */
export const SCOREBOARD_PER_PAGE = 16;

function scoreboardPageCount(n: number): number {
  return Math.max(1, Math.ceil(n / SCOREBOARD_PER_PAGE));
}

/** Total slide count for a given post. market_movers is always a fixed 4
 *  slides (ink cover, winners, losers, cta); earnings_deep_dive is the
 *  scoreboard, 1-3 story slides, the price reaction when there is one, then the
 *  shared conversion CTA slide every other content type ends on (see
 *  deepDiveKinds); earnings_calendar and earnings_results are each one logo
 *  grid and the CTA. */
export function totalSlideCount(slides: InstagramPostSlides): number {
  if (slides.contentType === 'market_movers') return 4;
  if (slides.contentType === 'earnings_deep_dive') return deepDiveKinds(slides.data).length;
  if (slides.contentType === 'picks_scoreboard') return 1 + scoreboardPageCount(slides.picks.length) + 2;
  return 2;
}

/** Which kind of slide a given 0-indexed slide position is, for a given post. */
export function slideKindAt(index: number, slides: InstagramPostSlides): SlideKind {
  if (slides.contentType === 'market_movers') {
    if (index === 0) return 'movers_cover';
    if (index === 1) return 'winners';
    if (index === 2) return 'losers';
    return 'cta';
  }
  if (slides.contentType === 'earnings_deep_dive') return deepDiveKinds(slides.data)[index] ?? 'cta';
  if (slides.contentType === 'picks_scoreboard') {
    const pages = scoreboardPageCount(slides.picks.length);
    if (index === 0) return 'scoreboard_cover';
    if (index <= pages) return 'scoreboard_list';
    return index === pages + 1 ? 'scoreboard_callouts' : 'cta';
  }
  return index === 0 ? 'calendar_grid' : 'cta';
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
    if (kind === 'deepdive_scoreboard') {
      const rows = scoreboardRows(d).map((r) => `${r.label} ${r.actual}${r.estimate ? ` vs ${r.estimate} expected` : ''}${r.status ? ` (${r.status === 'inline' ? 'in line' : r.status})` : ''}`);
      return `${d.companyName} (${d.ticker}) earnings: ${rows.join(', ')}. Track ${d.ticker} free on BullPen.`;
    }
    if (kind === 'deepdive_story') return storyAltText(d, slideIndex - 1);
    if (kind === 'deepdive_reaction' && d.priceReaction) return `${d.companyName} (${d.ticker}): ${reactionCaptionLine(d.priceReaction)} Chart of the share price around the results.`;
    return 'Open the BullPen app to track earnings, prices, and your whole portfolio in one place.';
  }
  const kind = slideKindAt(slideIndex, content);
  const isResults = content.contentType === 'earnings_results';
  if (kind === 'cta') {
    return isResults
      ? 'Open the BullPen app to see the full earnings results recap and track these stocks.'
      : 'Open the BullPen app to see the full earnings calendar and set alerts for these stocks.';
  }
  if (isResults) {
    const list = (s: 'beat' | 'missed') => content.companies.filter((c) => c.status === s).map((c) => c.symbol).join(', ');
    const missed = list('missed');
    return `${content.beatCount} of ${content.companies.length} companies beat analyst profit estimates the week of ${content.weekLabel}, on BullPen. Beat: ${list('beat') || 'none'}.${missed ? ` Missed: ${missed}.` : ''}`;
  }
  const byDay = groupByDate(content.companies).map((g) => `${gridDayHeader(g.date).toLowerCase()}: ${g.items.map((c) => c.symbol).join(', ')}`);
  return `Earnings to watch this week, ${content.weekLabel}, on BullPen. ${byDay.join('; ')}.`;
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
          // The ring's 4px ink border is inside `size`, so the image is 8px smaller or it clips off-centre.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={`${symbol} logo`} width={ring ? size - 8 : size} height={ring ? size - 8 : size} style={{ objectFit: 'cover' }} />
        ) : (
          <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: Math.round(size * 0.3), color: FG }}>{symbol.slice(0, 4)}</span>
        )}
      </div>
    </div>
  );
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

// ── Weekly earnings grid: one grid of logos, a column per day ───────────────
// 2026-11-05, David: the list slides (name, time, EPS estimate per row) shrank
// to fit a 24-company week and were hard to read. The week ahead is about WHO
// reports WHEN; estimates mean something only next to a result. So: logo and
// ticker only, the whole week on the cover.
// 2026-11-06, David: the Saturday results post (ink hook, then two white
// 12-row lists of names, EPS pairs and pills) was "too visually boring, hard
// to read the small text, very overwhelming". It is now this same grid, so
// Sunday's calendar and Saturday's results read as a pair: each logo is
// ringed and marked in its result (a check or a cross, so the read does not
// rest on color alone), and the title is the tally. EPS figures live in the app.

// Red side of the gain/loss signal, mirroring BRAND (emerald-400).
const MISSED_COLOR = '#f87171'; // red-400, same hex app/api/og/share/[id]/route.tsx uses

const GRID_MAX_ROWS = 6;

/** "MON · NOV 2" */
function gridDayHeader(date: string): string {
  const d = new Date(date + 'T12:00:00Z');
  const day = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  const md = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${day} · ${md}`.toUpperCase();
}

/** A check (beat) or cross (missed) on a disc of the result color, ink glyph on top like BRAND_INK. */
function ResultMark({ status, size }: { status: 'beat' | 'missed'; size: number }) {
  const beat = status === 'beat';
  return (
    <div style={{ display: 'flex', width: size, height: size, borderRadius: 999, backgroundColor: beat ? BRAND : MISSED_COLOR, alignItems: 'center', justifyContent: 'center' }}>
      <svg width={Math.round(size * 0.62)} height={Math.round(size * 0.62)} viewBox="0 0 24 24">
        <path d={beat ? 'M5 12.5l4.5 4.5L19 7.5' : 'M7 7l10 10M17 7L7 17'} stroke={INK} strokeWidth={3.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

type GridCompany = { symbol: string; logoUrl: string | null; date: string; marketCap: number | null; status?: 'beat' | 'missed' };

interface CalendarGridSlideProps {
  companies: GridCompany[];
  overflowCount: number;
  weekLabel: string;
  slideIndex: number;
  totalSlides: number;
  /** Results recap: the tally becomes the title and every logo shows its result. */
  beatCount?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function CalendarGridSlide({ companies, overflowCount, weekLabel, slideIndex, totalSlides, beatCount }: CalendarGridSlideProps): any {
  const isResults = beatCount != null;
  const days = groupByDate(companies).map((g) => ({ ...g, items: [...g.items].sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0)) }));
  const cols = days.length;
  // Fewer days, more logos per row, so a quiet week fills the slide instead of a thin strip.
  const busiest = Math.max(...days.map((g) => g.items.length));
  const perRow = Math.min(busiest, cols >= 3 ? 2 : cols === 2 ? 3 : 4);
  const cap = perRow * GRID_MAX_ROWS;
  const rows = Math.min(GRID_MAX_ROWS, Math.max(1, ...days.map((g) => Math.ceil(g.items.length / perRow))));
  const colW = (1080 - 2 * 60) / cols;
  const rowH = Math.min(190, Math.floor(720 / rows));
  const logo = Math.min(rows <= 2 ? 168 : 132, Math.floor((colW - 12) / perRow) - 18, rowH - 60);
  const tickerSize = Math.max(22, Math.min(30, Math.round(logo * 0.3)));
  // A result ring (6px of color) sits inside the calendar's logo footprint: logo - 12 below.
  const n = companies.length;

  const footer = isResults
    ? `Profit per share (EPS) vs analyst forecasts.${overflowCount > 0 ? ` ${n} of ${n + overflowCount} reports.` : ''}`
    : overflowCount > 0
      ? `${n} of this week's reports, plus ${overflowCount} more. See who beat on Saturday.`
      : `${n} ${n === 1 ? 'company reports' : 'companies report'} this week. See who beat on Saturday.`;

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', paddingTop: 72, paddingBottom: 72, paddingLeft: 60, paddingRight: 60, backgroundColor: INK, backgroundImage: INK_GLOW, color: ON_INK }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Wordmark onInk />
        <SlideIndicator index={slideIndex} total={totalSlides} onInk />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 52 }}>
        {isResults ? (
          <div style={{ display: 'flex', gap: 26, fontFamily: 'Geist', fontWeight: 700, fontSize: 100, lineHeight: 1, letterSpacing: '-0.04em', color: ON_INK }}>
            <span style={{ display: 'flex', color: BRAND }}>{String(beatCount)}</span>
            <span style={{ display: 'flex' }}>{`of ${n} beat`}</span>
          </div>
        ) : (
          <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 100, lineHeight: 1, letterSpacing: '-0.04em', color: ON_INK }}>Earnings to watch</span>
        )}
        <span style={{ display: 'flex', fontFamily: 'Geist', fontSize: 32, color: ON_INK_MUTED }}>
          {isResults ? `what analysts expected · ${weekLabel}` : `This week · ${weekLabel}`}
        </span>
      </div>

      {/* Centered in the space left, so a quiet week is not one strip under the title. */}
      <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center', paddingTop: 40, paddingBottom: 40 }}>
      <div style={{ display: 'flex' }}>
        {days.map((g, ci) => {
          const over = g.items.length > cap ? g.items.length - (cap - 1) : 0;
          const shown = over ? g.items.slice(0, cap - 1) : g.items;
          const rowList: (GridCompany | null)[][] = [];
          for (let i = 0; i < shown.length; i += perRow) rowList.push(shown.slice(i, i + perRow));
          if (over) {
            const last = rowList[rowList.length - 1];
            if (last && last.length < perRow) last.push(null); else rowList.push([null]);
          }
          return (
            <div key={g.date} style={{ display: 'flex', flexDirection: 'column', width: colW, paddingLeft: 6, paddingRight: 6, borderLeft: ci ? `1px solid ${INK_BORDER}` : 'none' }}>
              <span style={{ display: 'flex', justifyContent: 'center', fontFamily: 'Geist', fontWeight: 700, fontSize: 22, letterSpacing: '0.04em', color: ON_INK_MUTED, paddingBottom: 18, marginBottom: 12, borderBottom: `1px solid ${INK_BORDER}` }}>
                {gridDayHeader(g.date)}
              </span>
              {rowList.map((row, ri) => (
                // Every other row on a faint band, so the eye can follow a row across the week.
                <div key={ri} style={{ display: 'flex', justifyContent: 'center', height: rowH, borderRadius: 18, backgroundColor: ri % 2 ? 'rgba(255,255,255,0.045)' : 'transparent' }}>
                  {row.map((c, k) => (
                    <div key={c?.symbol ?? `more-${k}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, width: Math.floor((colW - 12) / perRow) }}>
                      {/* No fragment here: Satori lays a fragment's children out in a row. */}
                      {c && <InkLogo symbol={c.symbol} logoUrl={c.logoUrl} size={c.status ? logo - 12 : logo} ring={c.status ? (c.status === 'beat' ? BRAND : MISSED_COLOR) : undefined} />}
                      {c && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {c.status && <ResultMark status={c.status} size={tickerSize} />}
                          <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: tickerSize, letterSpacing: '-0.01em', color: ON_INK }}>{c.symbol}</span>
                        </div>
                      )}
                      {!c && (
                        <div style={{ display: 'flex', width: logo, height: logo, borderRadius: 999, border: `2px solid ${INK_BORDER}`, alignItems: 'center', justifyContent: 'center', fontFamily: 'Geist', fontWeight: 700, fontSize: tickerSize + 4, color: ON_INK }}>
                          {`+${over}`}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 40, paddingTop: 28, borderTop: `1px solid ${INK_BORDER}` }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: isResults ? 780 : 700 }}>
          {isResults && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
              {(['beat', 'missed'] as const).map((s) => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <ResultMark status={s} size={34} />
                  <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 26, color: ON_INK }}>{s === 'beat' ? 'Beat' : 'Missed'}</span>
                </div>
              ))}
            </div>
          )}
          <span style={{ display: 'flex', fontFamily: 'Geist', fontSize: 24, lineHeight: 1.4, color: ON_INK_MUTED }}>{footer}</span>
        </div>
        <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 24, color: ON_INK, flexShrink: 0 }}>Link in bio</span>
      </div>
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
// other carousel. 3 to 6 slides (see deepDiveKinds below), no pagination
// since there's only ever one company.

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
  slideIndex: number;
  totalSlides: number;
}

// One idea per slide (2026-11-03, after Yahoo Finance's pacing): scoreboard,
// one slide per story point (11-05: points 2 and 3 used to live only in the
// caption), the first price reaction, CTA. The 10-29 version put about
// a dozen figures on two slides, and a beginner scrolling past at feed size
// read none of them. Every direction is a word (Beat, Down), never color
// alone (DESIGN.md).

/** Past three the carousel turns back into the wall of facts it replaced. */
const MAX_STORY_SLIDES = 3;

/** At least one: with no story, the single story slide is the "a beat is normal" lesson. */
function storySlideCount(d: EarningsDeepDiveData): number {
  return Math.min(MAX_STORY_SLIDES, Math.max(1, buildStory(d).length));
}

function deepDiveKinds(d: EarningsDeepDiveData): SlideKind[] {
  const stories = Array<SlideKind>(storySlideCount(d)).fill('deepdive_story');
  return ['deepdive_scoreboard', ...stories, ...(d.priceReaction ? ['deepdive_reaction' as const] : []), 'cta'];
}

function DeepDiveHeader({ ticker, slideIndex, totalSlides }: { ticker: string; slideIndex: number; totalSlides: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <Wordmark />
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 22, color: FG }}>{`$${ticker}`}</span>
        <SlideIndicator index={slideIndex} total={totalSlides} />
      </div>
    </div>
  );
}

// ── Slide 1: scoreboard ─────────────────────────────────────────────────────

const OUTLOOK_ROW_LABEL = "Next quarter's revenue outlook";

interface ScoreRow { label: string; actual: string; estimate: string | null; status: 'beat' | 'missed' | 'inline' | null }

/** Revenue, profit per share, then the segment the market watches, or next
 *  quarter's outlook when there's no segment estimate. A row needs its actual
 *  and is left out without one, never shown as N/A. */
export function scoreboardRows(d: EarningsDeepDiveData): ScoreRow[] {
  const rows: ScoreRow[] = [];
  if (d.revenueActual != null) {
    rows.push({ label: 'Revenue', actual: formatUsdCompact(d.revenueActual), estimate: d.revenueEstimate != null ? formatUsdCompact(d.revenueEstimate) : null, status: d.revenueStatus });
  }
  if (d.epsActual != null) {
    rows.push({ label: 'Profit per share', actual: formatEps(d.epsActual), estimate: d.epsEstimate != null ? formatEps(d.epsEstimate) : null, status: d.epsStatus });
  }
  if (d.segmentLabel && d.segmentRevenueActual != null && d.segmentRevenueEstimate != null) {
    rows.push({
      label: /revenue/i.test(d.segmentLabel) ? d.segmentLabel : `${d.segmentLabel} revenue`,
      actual: formatUsdCompact(d.segmentRevenueActual),
      estimate: formatUsdCompact(d.segmentRevenueEstimate),
      status: statusFor(d.segmentRevenueEstimate, d.segmentRevenueActual),
    });
  } else if (d.guidanceRevenueLow != null && d.guidanceRevenueHigh != null && d.guidanceConsensus != null) {
    rows.push({
      label: OUTLOOK_ROW_LABEL,
      actual: formatUsdRange(d.guidanceRevenueLow, d.guidanceRevenueHigh),
      estimate: formatUsdCompact(d.guidanceConsensus),
      // Same band as the caption's story points (deep-dive-story.ts); a second copy here is how AVGO's slide and caption disagreed.
      status: guidanceVsConsensus(d),
    });
  }
  return rows;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function DeepDiveScoreboardSlide({ data, slideIndex, totalSlides }: DeepDiveSlideProps): any {
  const rows = scoreboardRows(data);
  const note = `Est. is what analysts expected, on average.${data.epsAdjustmentNote ? ' Profit per share leaves out one-time items.' : ''}`;
  return (
    <InkCover slideIndex={slideIndex} totalSlides={totalSlides}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <CompanyIdentity data={data} badgeSize={88} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ display: 'flex', fontFamily: 'Geist', fontSize: 26, color: ON_INK_MUTED }}>
            {`${data.fiscalPeriodLabel ? `${data.fiscalPeriodLabel} results` : 'Results'} · ${formatDateHeader(data.reportDate)}`}
          </span>
          <ReportTimingBadge timing={data.reportTiming} />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 30, paddingBottom: 30, borderTop: `1px solid ${INK_BORDER}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
              <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 30, color: ON_INK_MUTED }}>{r.label}</span>
              {r.status && <DeepDiveStatusBadge status={r.status} size="sm" />}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 28 }}>
              <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: r.actual.length > 9 ? 76 : 104, lineHeight: 1, letterSpacing: '-0.04em', color: ON_INK }}>
                {r.actual}
              </span>
              {r.estimate && (
                <span style={{ display: 'flex', fontFamily: 'Geist', fontSize: 32, color: ON_INK_MUTED }}>{`Est. ${r.estimate}`}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 40 }}>
        <span style={{ display: 'flex', fontFamily: 'Geist', fontSize: 24, lineHeight: 1.45, color: ON_INK_MUTED, maxWidth: 640 }}>{note}</span>
        <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 24, color: ON_INK, flexShrink: 0 }}>Link in bio</span>
      </div>
    </InkCover>
  );
}

// ── Slides 2-4: the story, one point per slide ──────────────────────────────
// buildStory() in order, the same ranking the caption writer is given, so
// slide 2 and the caption always open on the same fact. Story slides sit
// right after the scoreboard, so story i is slide i + 1.

/** display overrides the signed-percent label (dollars, a margin level). */
interface Bar { label: string; value: number; current: boolean; display?: string }

/** "Sep '25" for a quarter-end date. */
function quarterLabel(periodEnd: string): string {
  const d = new Date(periodEnd + 'T12:00:00Z');
  return `${d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })} '${String(d.getUTCFullYear()).slice(2)}`;
}

interface StoryCard {
  title: string;
  text: string;
  /** The release's own words, under the sentence (the outlook change). Model-written, so it wraps and is never cut. */
  detail: string | null;
  bars: Bar[] | null;
  note: string;
}

const STORY_NOTE: Partial<Record<StoryPoint['kind'], string>> = {
  capex: 'Capital spending is money put into buildings, chips and equipment.',
  margin: 'Gross margin is the share of revenue left after the direct cost of what was sold.',
  guidance: "The outlook is the revenue range the company expects for next quarter. Analysts' figure is their average forecast.",
  outlook: 'The full-year outlook is what the company expects to earn or sell this year.',
};

/** What story slide i says. With nothing beyond the result to report, slide 2 teaches why a beat alone is not news. */
function storyCard(d: EarningsDeepDiveData, i: number): StoryCard {
  const lead = buildStory(d)[i];
  const generic = 'Estimates are the average analyst forecast before the report.';
  if (!lead) {
    if (d.epsStatus === 'inline' && d.revenueStatus === 'inline') {
      return { title: 'Right on forecast', text: 'Profit per share and revenue both landed close to what analysts expected.', detail: null, bars: null, note: generic };
    }
    return {
      title: 'A beat is the normal result',
      text: 'In a typical quarter, about 4 in 5 S&P 500 companies beat the profit forecast. A beat on its own rarely moves a stock.',
      detail: null, bars: null, note: 'What moves a stock is usually what changed: the outlook, spending, or growth.',
    };
  }

  let bars: Bar[] | null = null;
  let note = STORY_NOTE[lead.kind] ?? generic;
  const history = d.revenueGrowthHistory ?? [];
  if (lead.kind === 'growth' && d.revenueYoyGrowthPercent != null && history.length >= 3) {
    bars = [
      ...history.map((h) => ({ label: quarterLabel(h.periodEnd), value: h.yoyPercent, current: false })),
      { label: 'This qtr', value: d.revenueYoyGrowthPercent, current: true },
    ];
    note = 'Each bar is revenue growth against the same quarter a year earlier.';
  }
  const surprises = d.epsSurpriseHistory ?? [];
  const surprise = epsSurpriseVsHistoryBasis(d); // same source as the history bars, never our own estimate
  if (lead.kind === 'beat' && surprise != null && surprises.length >= 3) {
    const previous = [...surprises].reverse(); // oldest first, like the growth bars
    bars = [
      ...previous.map((v, i) => {
        const ago = previous.length - i;
        return { label: ago === 1 ? 'Last qtr' : `${ago} qtrs ago`, value: v, current: false };
      }),
      { label: 'This qtr', value: surprise, current: true },
    ];
    note = 'Each bar is how far profit per share beat or missed the analyst consensus, from Nasdaq.';
  }
  // The same figures buildStory() compared, so the bars can't disagree with the sentence.
  // No margin bars: 56% vs 55% from a zero line look identical under a "slip" headline, and the sentence has both figures.
  if (lead.kind === 'capex' && d.capexActual != null && d.capexPriorYear != null) {
    bars = [
      { label: 'A year ago', value: d.capexPriorYear, current: false, display: formatUsdCompact(d.capexPriorYear) },
      { label: 'This qtr', value: d.capexActual, current: true, display: formatUsdCompact(d.capexActual) },
    ];
  }

  let detail: string | null = lead.kind === 'outlook' ? d.outlookNote ?? null : null;
  // The outlook's figures, unless the scoreboard's third row already shows them (it gives way to a segment row).
  if (lead.kind === 'guidance' && d.guidanceRevenueHigh != null && d.guidanceConsensus != null
    && !scoreboardRows(d).some((r) => r.label === OUTLOOK_ROW_LABEL)) {
    const range = d.guidanceRevenueLow != null
      ? formatUsdRange(d.guidanceRevenueLow, d.guidanceRevenueHigh).replace('–', ' to ')
      : formatUsdCompact(d.guidanceRevenueHigh);
    detail = `Outlook ${range}. Analysts expected ${formatUsdCompact(d.guidanceConsensus)}.`;
  }

  return { title: lead.title, text: lead.text, detail, bars, note };
}

/** Bars share one zero line; a negative value hangs below it in loss red, with its minus sign. */
function StoryBars({ bars }: { bars: Bar[] }) {
  const maxPos = Math.max(0, ...bars.map((b) => b.value));
  const maxNeg = Math.max(0, ...bars.map((b) => -b.value));
  const span = maxPos + maxNeg || 1;
  const area = 230;
  // Two bars at full width read as slabs, not a comparison.
  return (
    <div style={{ display: 'flex', width: bars.length <= 2 ? 600 : '100%', gap: bars.length <= 2 ? 48 : 20 }}>
      {bars.map((b) => {
        const h = Math.max(6, Math.round((Math.abs(b.value) / span) * area));
        const fill = b.value < 0 ? LOSS_TEXT : b.current ? FG : BORDER_STRONG;
        return (
          <div key={b.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: 12 }}>
            <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: b.current ? 700 : 400, fontSize: 32, color: b.value < 0 ? LOSS_TEXT : FG }}>
              {b.display ?? formatPercentSigned(b.value, Math.abs(b.value) < 10 ? 1 : 0)}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: area + 1 }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', height: Math.round((maxPos / span) * area) }}>
                {b.value >= 0 && <div style={{ display: 'flex', width: '100%', height: h, backgroundColor: fill, borderRadius: 8 }} />}
              </div>
              <div style={{ display: 'flex', height: 1, backgroundColor: BORDER_STRONG }} />
              {b.value < 0 && <div style={{ display: 'flex', width: '100%', height: h, backgroundColor: fill, borderRadius: 8 }} />}
            </div>
            <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: b.current ? 700 : 400, fontSize: 24, color: b.current ? FG : MUTED }}>{b.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function DeepDiveStorySlide({ data, slideIndex, totalSlides }: DeepDiveSlideProps): any {
  const card = storyCard(data, slideIndex - 1);
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', padding: 80, backgroundColor: BG, color: FG }}>
      <DeepDiveHeader ticker={data.ticker} slideIndex={slideIndex} totalSlides={totalSlides} />
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, gap: 28 }}>
        <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 104, lineHeight: 1.0, letterSpacing: '-0.04em', color: FG }}>{card.title}</span>
        <span style={{ display: 'flex', fontFamily: 'Geist', fontSize: 42, lineHeight: 1.3, color: FG }}>{card.text}</span>
        {card.detail && <span style={{ display: 'flex', fontFamily: 'Geist', fontSize: 34, lineHeight: 1.35, color: MUTED }}>{card.detail}</span>}
        {card.bars && <div style={{ display: 'flex', width: '100%', marginTop: 28 }}><StoryBars bars={card.bars} /></div>}
      </div>
      <SlideFooter note={card.note} />
    </div>
  );
}

function storyAltText(d: EarningsDeepDiveData, i: number): string {
  const card = storyCard(d, i);
  return `${card.title}. ${card.text}${card.detail ? ` ${card.detail}` : ''}`;
}

// ── Slide 3: the first price reaction ───────────────────────────────────────
// Only on posts that had enough trades by publish time (price-reaction.ts).
// The hour before the close takes the left half and everything since the
// right half, so a reaction of a few minutes is not a sliver at the edge.

const CHART_W = 920;
const CHART_H = 470;

const etClock = (t: number) => new Date(t * 1000).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });

function ReactionChart({ r, color }: { r: PriceReaction; color: string }) {
  const prices = [...r.points.map((p) => p.c), r.baseline];
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const pad = (hi - lo) * 0.12 || hi * 0.005;
  const y = (c: number) => ((hi + pad - c) / (hi - lo + 2 * pad)) * CHART_H;
  const start = r.points[0].t;
  const half = CHART_W / 2;
  const x = (t: number) => (t <= r.closeAt
    ? (start < r.closeAt ? ((t - start) / (r.closeAt - start)) * half : half)
    : half + ((t - r.closeAt) / Math.max(1, r.asOf - r.closeAt)) * half);
  const path = (ps: { t: number; c: number }[]) => ps.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.c).toFixed(1)}`).join(' ');

  const before = r.points.filter((p) => p.t <= r.closeAt);
  const after = r.points.filter((p) => p.t > r.closeAt);
  const last = r.points[r.points.length - 1];
  const label = { display: 'flex', position: 'absolute', top: CHART_H + 20, fontFamily: 'Geist', fontSize: 24, color: MUTED } as const;

  // No "results out" marker: the press release crosses the wire minutes before
  // the 8-K we time it by (AMZN fell at 4:01, the filing came at 4:05), so a
  // marker at the filing sat after the drop it caused.
  return (
    <div style={{ display: 'flex', position: 'relative', width: CHART_W, height: CHART_H + 56 }}>
      <svg width={CHART_W} height={CHART_H} viewBox={`0 0 ${CHART_W} ${CHART_H}`}>
        <line x1={0} y1={y(r.baseline)} x2={CHART_W} y2={y(r.baseline)} stroke={BORDER_STRONG} strokeWidth={2} strokeDasharray="8 8" />
        <line x1={half} y1={0} x2={half} y2={CHART_H} stroke={BORDER_STRONG} strokeWidth={2} />
        <path d={path(before)} fill="none" stroke={MUTED} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
        <path d={path([before[before.length - 1] ?? after[0], ...after])} fill="none" stroke={color} strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(last.t)} cy={y(last.c)} r={10} fill={color} />
      </svg>
      <span style={{ ...label, left: 0 }}>{etClock(start)}</span>
      {/* Bars are stamped with the minute they open, so the 3:59 bar ends at the 4:00 close. */}
      <span style={{ ...label, left: half - 120, width: 240, justifyContent: 'center' }}>{`${etClock(r.closeAt + 60)} close`}</span>
      <span style={{ ...label, right: 0, fontWeight: 700, color: FG }}>{etClock(r.asOf)}</span>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function DeepDiveReactionSlide({ data, slideIndex, totalSlides }: DeepDiveSlideProps): any {
  const r = data.priceReaction as PriceReaction;
  const flat = Math.abs(r.changePercent) < 0.05;
  const color = flat ? FG : r.changePercent > 0 ? GAIN_TEXT : LOSS_TEXT;
  const word = flat ? 'About flat' : `${r.changePercent > 0 ? 'Up' : 'Down'} ${Math.abs(r.changePercent).toFixed(1)}%`;
  const session = r.session === 'post' ? 'after-hours' : 'pre-market';
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', padding: 80, backgroundColor: BG, color: FG }}>
      <DeepDiveHeader ticker={data.ticker} slideIndex={slideIndex} totalSlides={totalSlides} />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 14 }}>
        <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 120, lineHeight: 1, letterSpacing: '-0.04em', color }}>{word}</span>
        <span style={{ display: 'flex', fontFamily: 'Geist', fontSize: 36, lineHeight: 1.3, color: FG }}>{`in early ${session} trading, as of ${reactionTimeLabel(r)} ET`}</span>
        <div style={{ display: 'flex', marginTop: 40 }}><ReactionChart r={r} color={color} /></div>
      </div>
      <SlideFooter note={`The dashed line is the $${r.baseline.toFixed(2)} close. ${session === 'after-hours' ? 'After-hours' : 'Pre-market'} trading is thin, and the first move often changes by the next day's close.`} />
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
