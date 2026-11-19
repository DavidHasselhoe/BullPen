/**
 * Animated 9:16 Reels, drawn frame by frame with the same Satori engine,
 * fonts and atoms as the carousel slides (slides.tsx). Every frame is a pure
 * function of (data, t seconds), so scripts/render-reel.ts can render each
 * one with ImageResponse and pipe the PNGs to ffmpeg.
 *
 * Earnings deep dive story, beat by beat: a hook built from rules (never a
 * model, so it can't invent a fact), revenue, profit per share, next
 * quarter's outlook, then buildStory()'s lead point as "the catch" (or "what
 * stood out"), then the first price reaction and a follow prompt.
 *
 * Reels UI covers the top ~220px, the bottom ~380px and a column on the
 * right, so all text sits inside PAD below.
 */
import type { EarningsDeepDiveData } from '@/lib/instagram/content/schema';
import { buildStory, guidanceVsConsensus, type StoryPoint } from '@/lib/instagram/content/deep-dive-story';
import { displayCompanyName } from '@/lib/market-data/company-name';
import {
  INK, INK_GLOW, INK_BORDER, ON_INK, ON_INK_MUTED, BRAND, BRAND_INK, LOSS, AMC_COLOR,
  Wordmark, InkLogo, formatUsdCompact, formatEps,
} from './slides';

export const REEL_W = 1080;
export const REEL_H = 1920;
export const REEL_FPS = 30;

const PAD = { top: 250, right: 150, bottom: 400, left: 90 };
const TRACK = REEL_W - PAD.left - PAD.right; // 840px of usable width
const BAR_DIM = 'rgba(255,255,255,0.22)';

type Status = 'beat' | 'missed' | 'inline';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** Ease-out cubic progress of [start, start + dur] at time t. */
const prog = (t: number, start: number, dur: number) => 1 - Math.pow(1 - clamp01((t - start) / dur), 3);
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

const STATUS_COLOR: Record<Status, string> = { beat: BRAND, missed: LOSS, inline: AMC_COLOR };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type El = any;
interface Beat { dur: number; render: (t: number) => El }

// ── Hook ────────────────────────────────────────────────────────────────────

/** Two lines: the first is on screen from frame 0 (it's the cover). */
export function deepDiveHook(d: EarningsDeepDiveData): [string, string] {
  const co = displayCompanyName(d.companyName, d.ticker);
  const lead = buildStory(d)[0];
  const shown = [d.epsStatus, d.revenueStatus, guidanceVsConsensus(d)].filter((s): s is Status => s != null);
  const allBeat = shown.length >= 2 && shown.every((s) => s === 'beat');
  const anyMiss = shown.includes('missed');
  if (lead?.bad && allBeat) return [`${co} beat on everything.`, "So what's the catch?"];
  if (lead?.bad) return [`${co} just reported.`, 'One number stood out, and not in a good way.'];
  if (lead && anyMiss) return [`${co} missed the forecast.`, "Here's why that may not be the story."];
  if (lead) return [`${co} beat the forecast.`, "Here's what actually stood out."];
  return [`${co} just reported earnings.`, "Here's what happened, in plain English."];
}

function HookBeat({ d, t }: { d: EarningsDeepDiveData; t: number }): El {
  const [a, b] = deepDiveHook(d);
  const p = prog(t, 0.6, 0.45);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 56 }}>
      <InkLogo symbol={d.ticker} logoUrl={d.logoUrl} size={170} />
      <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 108, lineHeight: 1.02, letterSpacing: '-0.04em', color: ON_INK }}>{a}</span>
      <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 108, lineHeight: 1.02, letterSpacing: '-0.04em', color: ON_INK_MUTED, opacity: p, transform: `translateY(${lerp(40, 0, p)}px)` }}>{b}</span>
    </div>
  );
}

// ── Shared pieces ───────────────────────────────────────────────────────────

function Kicker({ text, color = ON_INK_MUTED }: { text: string; color?: string }): El {
  return <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 40, letterSpacing: '0.06em', color }}>{text.toUpperCase()}</span>;
}

function Plain({ text, size = 40, color = ON_INK_MUTED, opacity = 1 }: { text: string; size?: number; color?: string; opacity?: number }): El {
  return <span style={{ display: 'flex', fontFamily: 'Geist', fontSize: size, lineHeight: 1.3, color, opacity }}>{text}</span>;
}

/** "Beat the forecast" chip that pops in at `at` seconds. */
function StatusChip({ status, t, at, words }: { status: Status; t: number; at: number; words: Record<Status, string> }): El {
  const p = prog(t, at, 0.3);
  return (
    <div style={{ display: 'flex', opacity: p, transform: `scale(${lerp(0.7, 1, p)})` }}>
      <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 44, color: BRAND_INK, backgroundColor: STATUS_COLOR[status], padding: '16px 36px', borderRadius: 999 }}>
        {words[status]}
      </span>
    </div>
  );
}

const FORECAST_WORDS: Record<Status, string> = { beat: 'Beat the forecast', missed: 'Missed the forecast', inline: 'In line with the forecast' };

function Bar({ label, value, width, color, opacity = 1 }: { label: string; value: string; width: number; color: string; opacity?: number }): El {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, opacity }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', width: TRACK }}>
        <span style={{ display: 'flex', fontFamily: 'Geist', fontSize: 34, color: ON_INK_MUTED }}>{label}</span>
        <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 34, color: ON_INK }}>{value}</span>
      </div>
      <div style={{ display: 'flex', width: TRACK, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', width: Math.max(0, width), height: 36, borderRadius: 10, backgroundColor: color }} />
      </div>
    </div>
  );
}

// ── Scoreboard beats ────────────────────────────────────────────────────────

interface ScoreSpec { label: string; explain: string; actual: number; estimate: number | null; status: Status | null; fmt: (v: number) => string }

function ScoreBeat({ s, t }: { s: ScoreSpec; t: number }): El {
  const count = prog(t, 0.25, 1.2);
  const shown = s.fmt(lerp(s.actual * 0.5, s.actual, count));
  // Bars only when both are positive; a loss per share has no honest bar from zero.
  const bars = s.estimate != null && s.actual > 0 && s.estimate > 0;
  const max = bars ? Math.max(s.actual, s.estimate!) : 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
      <Kicker text={s.label} />
      <Plain text={s.explain} />
      <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 190, lineHeight: 1, letterSpacing: '-0.05em', color: ON_INK, marginTop: 20 }}>{shown}</span>
      {bars && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28, marginTop: 30 }}>
          <Bar label="Analysts expected" value={s.fmt(s.estimate!)} width={TRACK * (s.estimate! / max) * prog(t, 0.3, 0.8)} color={BAR_DIM} />
          <Bar label="Actual" value={s.fmt(s.actual)} width={TRACK * (s.actual / max) * prog(t, 0.7, 0.9)} color={s.status ? STATUS_COLOR[s.status] : ON_INK} />
        </div>
      )}
      {!bars && s.estimate != null && <Plain text={`Analysts expected ${s.fmt(s.estimate)}`} opacity={prog(t, 0.6, 0.4)} />}
      {s.status && <div style={{ display: 'flex', marginTop: 24 }}><StatusChip status={s.status} t={t} at={1.6} words={FORECAST_WORDS} /></div>}
    </div>
  );
}

function rangeText(lo: number, hi: number): string {
  return `${formatUsdCompact(lo)} to ${formatUsdCompact(hi)}`;
}

/** Next quarter's revenue range as a band, the analysts' figure as a marker on the same scale. */
function OutlookBeat({ d, t, kicker }: { d: EarningsDeepDiveData; t: number; kicker?: { text: string; color: string } }): El {
  const lo = d.guidanceRevenueLow!;
  const hi = d.guidanceRevenueHigh!;
  const cons = d.guidanceConsensus!;
  const status = guidanceVsConsensus(d);
  const min = Math.min(lo, cons) * 0.9;
  const max = Math.max(hi, cons) * 1.03;
  const x = (v: number) => ((v - min) / (max - min)) * TRACK;
  const band = prog(t, 0.4, 0.9);
  const marker = prog(t, 1.2, 0.4);
  const co = displayCompanyName(d.companyName, d.ticker);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
      {kicker ? <Kicker text={kicker.text} color={kicker.color} /> : <Kicker text="Next quarter's sales" />}
      <Plain text={`What ${co} expects to bring in next quarter`} />
      <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 120, lineHeight: 1.05, letterSpacing: '-0.04em', color: ON_INK, marginTop: 20 }}>{rangeText(lo, hi)}</span>
      <div style={{ display: 'flex', flexDirection: 'column', width: TRACK, marginTop: 70 }}>
        <div style={{ display: 'flex', height: 120, position: 'relative' }}>
          <div style={{ display: 'flex', position: 'absolute', left: x(cons) - 2, top: lerp(-40, 0, marker), width: 4, height: 120, backgroundColor: ON_INK, opacity: marker }} />
          <div style={{ display: 'flex', position: 'absolute', left: x(lo), top: 36, height: 48, width: (x(hi) - x(lo)) * band, borderRadius: 10, backgroundColor: status ? STATUS_COLOR[status] : ON_INK }} />
          <div style={{ display: 'flex', position: 'absolute', left: 0, top: 59, height: 2, width: TRACK, backgroundColor: INK_BORDER }} />
        </div>
        <span style={{ display: 'flex', fontFamily: 'Geist', fontSize: 36, color: ON_INK, opacity: marker, marginTop: 18, marginLeft: Math.min(Math.max(0, x(cons) - 160), TRACK - 420) }}>
          {`Analysts expected ${formatUsdCompact(cons)}`}
        </span>
      </div>
      {status && <div style={{ display: 'flex', marginTop: 40 }}><StatusChip status={status} t={t} at={1.8} words={{ beat: 'Above the forecast', missed: 'Below the forecast', inline: 'In line with the forecast' }} /></div>}
    </div>
  );
}

// ── The story's lead ────────────────────────────────────────────────────────

/** Cents kept of each $1 of sales; one decimal only when rounding would hide the change. */
function centsPair(a: number, b: number): [string, string] {
  const dp = Math.round(a) === Math.round(b) ? 1 : 0;
  return [`${a.toFixed(dp)}¢`, `${b.toFixed(dp)}¢`];
}

function MarginBeat({ d, t, lead }: { d: EarningsDeepDiveData; t: number; lead: StoryPoint }): El {
  const now = d.grossMarginActualPercent!;
  const next = d.grossMarginGuidancePercent!;
  const [nowText, nextText] = centsPair(now, next);
  const shrink = prog(t, 1.5, 1.5);
  const value = lerp(now, next, shrink);
  const co = displayCompanyName(d.companyName, d.ticker);
  const down = next < now;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
      <Kicker text={lead.bad ? 'The catch' : 'What stood out'} color={lead.bad ? LOSS : BRAND} />
      <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 104, lineHeight: 1.02, letterSpacing: '-0.04em', color: ON_INK }}>{lead.title}</span>
      <Plain text={`Of every $1 in sales, ${co} keeps this much after the cost of making what it sold:`} size={40} color={ON_INK} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 34, marginTop: 30 }}>
        <Bar label="This quarter" value={nowText} width={TRACK * (now / 100) * prog(t, 0.4, 0.8)} color={BAR_DIM} />
        <Bar
          label="Next quarter (expected)"
          value={shrink >= 1 ? nextText : centsPair(now, value)[1]}
          width={TRACK * (value / 100) * prog(t, 0.7, 0.8)}
          color={shrink > 0 ? (down ? LOSS : BRAND) : BAR_DIM}
        />
      </div>
      <Plain text={down ? 'Less of each sale is left over as profit.' : 'More of each sale is left over as profit.'} size={44} color={ON_INK} opacity={prog(t, 3.0, 0.5)} />
    </div>
  );
}

function TextBeat({ t, lead }: { t: number; lead: StoryPoint }): El {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
      <Kicker text={lead.bad ? 'The catch' : 'What stood out'} color={lead.bad ? LOSS : BRAND} />
      <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 120, lineHeight: 1.02, letterSpacing: '-0.04em', color: ON_INK }}>{lead.title}</span>
      <Plain text={lead.text} size={52} color={ON_INK} opacity={prog(t, 0.8, 0.5)} />
    </div>
  );
}

// ── End card ────────────────────────────────────────────────────────────────

function EndBeat({ d, t }: { d: EarningsDeepDiveData; t: number }): El {
  const move = d.priceReaction?.changePercent ?? d.afterHoursChangePercent ?? null;
  const up = move != null && move >= 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
      {move != null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Kicker text="How the stock reacted" />
          <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 120, lineHeight: 1.05, letterSpacing: '-0.04em', color: up ? BRAND : LOSS }}>
            {`${up ? 'Up' : 'Down'} ${Math.abs(move).toFixed(1)}%`}
          </span>
          <Plain text="in the first trades after the report" />
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28, marginTop: 60, opacity: prog(t, 0.6, 0.5), paddingTop: 50, borderTop: `2px solid ${INK_BORDER}` }}>
        <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 64, lineHeight: 1.1, letterSpacing: '-0.03em', color: ON_INK }}>Follow for earnings in plain English.</span>
        <Wordmark size={64} onInk />
      </div>
    </div>
  );
}

// ── Timeline ────────────────────────────────────────────────────────────────

export function deepDiveReelBeats(d: EarningsDeepDiveData): Beat[] {
  const lead = buildStory(d)[0] ?? null;
  const beats: Beat[] = [{ dur: 2.4, render: (t) => <HookBeat d={d} t={t} /> }];

  if (d.revenueActual != null) {
    const s: ScoreSpec = { label: 'Revenue', explain: 'All the money that came in from sales', actual: d.revenueActual, estimate: d.revenueEstimate, status: d.revenueStatus, fmt: formatUsdCompact };
    beats.push({ dur: 3.4, render: (t) => <ScoreBeat s={s} t={t} /> });
  }
  if (d.epsActual != null) {
    const s: ScoreSpec = { label: 'Profit per share', explain: 'Profit for each share of the company', actual: d.epsActual, estimate: d.epsEstimate, status: d.epsStatus, fmt: formatEps };
    beats.push({ dur: 3.2, render: (t) => <ScoreBeat s={s} t={t} /> });
  }

  const hasOutlook = d.guidanceRevenueLow != null && d.guidanceRevenueHigh != null && d.guidanceConsensus != null;
  if (lead?.kind === 'guidance' && hasOutlook) {
    // The outlook IS the story: show it once, as the lead.
    const kicker = { text: lead.bad ? 'The catch' : 'What stood out', color: lead.bad ? LOSS : BRAND };
    beats.push({ dur: 4.4, render: (t) => <OutlookBeat d={d} t={t} kicker={kicker} /> });
  } else {
    if (hasOutlook) beats.push({ dur: 3.6, render: (t) => <OutlookBeat d={d} t={t} /> });
    if (lead?.kind === 'margin' && d.grossMarginActualPercent != null && d.grossMarginGuidancePercent != null) {
      beats.push({ dur: 5.0, render: (t) => <MarginBeat d={d} t={t} lead={lead} /> });
    } else if (lead) {
      beats.push({ dur: 4.2, render: (t) => <TextBeat t={t} lead={lead} /> });
    }
  }

  beats.push({ dur: 3.0, render: (t) => <EndBeat d={d} t={t} /> });
  return beats;
}

export function deepDiveReelDuration(d: EarningsDeepDiveData): number {
  return deepDiveReelBeats(d).reduce((s, b) => s + b.dur, 0);
}

/** Start time of each beat, for picking review stills. */
export function deepDiveReelBeatStarts(d: EarningsDeepDiveData): number[] {
  let at = 0;
  return deepDiveReelBeats(d).map((b) => { const s = at; at += b.dur; return s; });
}

const ENTER = 0.35;
const EXIT = 0.25;

/** One frame at t seconds. Every beat fades/slides in and fades out, except the hook's entrance (frame 0 is the cover) and the end card's exit. */
export function DeepDiveReelFrame({ data, t, beats = deepDiveReelBeats(data) }: { data: EarningsDeepDiveData; t: number; beats?: Beat[] }): El {
  let start = 0;
  let i = 0;
  while (i < beats.length - 1 && t >= start + beats[i].dur) { start += beats[i].dur; i++; }
  const local = t - start;
  const beat = beats[i];
  const enter = i === 0 ? 1 : prog(local, 0, ENTER);
  const exit = i === beats.length - 1 ? 0 : clamp01((local - (beat.dur - EXIT)) / EXIT);
  const opacity = enter * (1 - exit);
  const shift = lerp(50, 0, enter) - exit * 30;

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: INK, backgroundImage: INK_GLOW, color: ON_INK, padding: `${PAD.top}px ${PAD.right}px ${PAD.bottom}px ${PAD.left}px` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Wordmark size={44} onInk />
        <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 30, color: ON_INK_MUTED }}>
          {reelLabel(data)}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, opacity, transform: `translateY(${shift}px)` }}>
        {beat.render(local)}
      </div>
      <span style={{ display: 'flex', fontFamily: 'Geist', fontSize: 26, color: ON_INK_MUTED }}>Not financial advice. Figures from the company and analyst averages.</span>
    </div>
  );
}

function reelLabel(d: EarningsDeepDiveData): string {
  return `${d.ticker} · ${d.fiscalPeriodLabel ? d.fiscalPeriodLabel.split(' ')[0] + ' earnings' : 'Earnings'}`;
}

