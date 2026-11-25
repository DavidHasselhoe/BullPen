'use client';

import { Fragment, memo, useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { ArrowDown, ArrowUp, ArrowUpRight, BarChart2, Briefcase, Check, CircleHelp, Flame, Landmark, Send, ShoppingCart, Sparkles, X, Zap } from 'lucide-react';
import { BullAiIcon } from '@/components/ai/BullAiIcon';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { GLOSSARY } from '@/lib/finance/glossary';
import type { LandingEconomy } from '@/lib/landing/economy-snapshot';
import { arcPath } from '@/components/finance/HealthRing';
import { useBrushReveal } from '@/hooks/use-brush-reveal';

/**
 * Live versions of the bento cards, built from the same parts and the same
 * real numbers as the app, so the landing shows what the product does
 * instead of a shrunken screenshot of it.
 *
 * The server HTML is the finished state: that is what crawlers, screen
 * readers, reduced motion and a card already on screen at load all get. Only
 * a card that starts below the fold rewinds (`arm`), then plays once when
 * half of it is in view.
 */

type Phase = 'rest' | 'armed' | 'play';

function usePlayOnView(ref: RefObject<HTMLElement | null>, arm: () => void, play: () => void) {
  const fns = useRef({ arm, play });
  useEffect(() => {
    fns.current = { arm, play };
  });
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let armed = false;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!armed) {
          // Already being read: never rewind what someone is looking at.
          if (e.intersectionRatio > 0) return io.disconnect();
          armed = true;
          fns.current.arm();
        } else if (e.isIntersecting) {
          io.disconnect();
          fns.current.play();
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
}

/** Ease-out count from 0 to `to`; returns a cancel. */
export function countUp(to: number, ms: number, onFrame: (n: number) => void): () => void {
  const start = performance.now();
  let id = 0;
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / ms);
    onFrame(to * (1 - Math.pow(1 - t, 3)));
    if (t < 1) id = requestAnimationFrame(tick);
  };
  id = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(id);
}

// ── Every number, in plain English ───────────────────────────────────────────
// StatisticsGrid's EV/EBITDA MetricCard in Simple mode, as captured for NVIDIA
// on 2026-11-01. Label from lib/finance/glossary.ts, insight from
// evEbitdaInsight(), scale from EV_EBITDA_DOMAIN (0 to 30). The "typical" tick
// sits where the capture had the Semiconductors median that day.
const EV = 24.39;
const EV_MAX = 30;
const EV_TYPICAL_PCT = 81.2;
const COUNT_MS = 900;

export function PlainEnglishDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>('rest');
  const [simple, setSimple] = useState(true);
  const [help, setHelp] = useState(false);
  const [n, setN] = useState(EV);
  const stop = useRef<() => void>(() => {});

  usePlayOnView(
    ref,
    () => {
      setPhase('armed');
      setSimple(false);
      setN(0);
    },
    () => {
      setPhase('play');
      // The number arrives in jargon first, then Simple mode explains it.
      const cancel = countUp(EV, COUNT_MS, setN);
      const flip = setTimeout(() => setSimple(true), COUNT_MS + 700);
      stop.current = () => { cancel(); clearTimeout(flip); };
    },
  );
  useEffect(() => () => stop.current(), []);

  const choose = (toSimple: boolean) => {
    stop.current();
    setN(EV);
    setPhase('rest');
    setSimple(toSimple);
  };

  const armed = phase === 'armed';
  const label = simple ? 'Company Value vs Operating Profit' : 'EV/EBITDA';

  return (
    <div ref={ref} className="demo" data-phase={phase}>
      <div className="demo-head">
        <span className="demo-co">
          <CompanyLogo ticker="NVDA" name="NVIDIA" size={22} />
          NVIDIA
          <span className="demo-when mono">Nov 1</span>
        </span>
        <div role="radiogroup" aria-label="Terminology" className="demo-toggle">
          {([true, false] as const).map((s) => (
            <button key={String(s)} type="button" role="radio" aria-checked={simple === s} onClick={() => choose(s)}>
              {s ? <Sparkles size={13} aria-hidden /> : <BarChart2 size={13} aria-hidden />}
              {s ? 'Simple' : 'Full'}
            </button>
          ))}
        </div>
      </div>

      <p className="mdemo-label">
        <span key={label} className="mdemo-label-text">{label}</span>
        {/* A real button, as in the app: the card's copy says "tap the ? for more". */}
        <button
          type="button"
          className={simple ? 'mdemo-help' : 'mdemo-help is-hidden'}
          aria-expanded={help}
          aria-label="What does this mean?"
          onClick={() => setHelp((h) => !h)}
        >
          <CircleHelp size={15} aria-hidden />
        </button>
      </p>
      {help && simple && <p className="mdemo-def">{GLOSSARY['EV/EBITDA'].description}</p>}
      <p className="mdemo-value">
        <span aria-hidden>{n.toFixed(2)}</span>
        <span className="sr-only">{EV.toFixed(2)}</span>
      </p>
      <div role="img" aria-label={`${label} ${EV.toFixed(2)} on a 0 to 30 scale, near the typical value`}>
        <div className="mdemo-track">
          <div className="mdemo-fill" style={{ transform: `scaleX(${armed ? 0 : EV / EV_MAX})` }} />
          <div className="mdemo-tick" style={{ left: `${EV_TYPICAL_PCT}%` }} />
        </div>
        <div className="mdemo-scale">
          <span style={{ left: 0 }}>0</span>
          <span style={{ left: `${EV_TYPICAL_PCT}%`, transform: 'translateX(-50%)' }}>typical</span>
          <span style={{ right: 0 }}>30</span>
        </div>
      </div>
      <p className={armed ? 'mdemo-insight is-hidden' : 'mdemo-insight'}>
        Valued at {EV.toFixed(1)}× its yearly operating earnings
      </p>
    </div>
  );
}

// ── One grade for how healthy a company is ───────────────────────────────────
// HealthScoreCard in Simple mode for NVIDIA, from health_score_history on
// 2026-11-18: pillar scores, the short pillar names the stock page shows in both modes, the
// Strong/Weak bands HealthScoreCard uses (70% and up strong, under 45% weak;
// no pillar here lands in between), and the summary health-score.ts gives a
// score of 85 or more. Ring geometry is HealthRing's.
const HEALTH = 89;
const PILLARS = [
  { label: 'Profitability', score: 30, max: 30 },
  { label: 'Financial Strength', score: 24, max: 25 },
  { label: 'Cash Flow', score: 16, max: 20 },
  { label: 'Growth', score: 15, max: 15 },
  { label: 'Stability', score: 4, max: 10 },
].map((p) => ({ ...p, ratio: p.score / p.max, strong: p.score / p.max >= 0.7 }));
const RING = 128;
const RING_W = 10;
const RING_R = RING / 2 - RING_W / 2 - 1;
const SEG = 72;
const GAP = 7;
/** Each pillar starts this long after the one before, ring arc and bar together. */
const STEP_MS = 260;

export function HealthDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>('rest');
  const [n, setN] = useState(HEALTH);
  const stop = useRef<() => void>(() => {});

  usePlayOnView(
    ref,
    () => {
      setPhase('armed');
      setN(0);
    },
    () => {
      setPhase('play');
      stop.current = countUp(HEALTH, STEP_MS * PILLARS.length + 300, (v) => setN(Math.round(v)));
    },
  );
  useEffect(() => () => stop.current(), []);

  return (
    <div ref={ref} className="demo" data-phase={phase}>
      <div className="demo-head">
        <span className="demo-co">
          <CompanyLogo ticker="NVDA" name="NVIDIA" size={22} />
          NVIDIA
          <span className="demo-when mono">Nov 18</span>
        </span>
        <span className="hdemo-badge">Strong</span>
      </div>

      <div className="hdemo-body">
        <div className="hdemo-ring">
          <svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`} aria-hidden>
            {PILLARS.map((p, i) => {
              const start = i * SEG + GAP / 2;
              const end = (i + 1) * SEG - GAP / 2;
              return (
                <g key={p.label} style={{ '--d': `${i * STEP_MS}ms` } as CSSProperties}>
                  <path d={arcPath(RING / 2, RING / 2, RING_R, start, end)} className="hdemo-arc-track" />
                  <path
                    d={arcPath(RING / 2, RING / 2, RING_R, start, start + (end - start) * p.ratio)}
                    pathLength={1}
                    className={p.strong ? 'hdemo-arc up' : 'hdemo-arc down'}
                  />
                </g>
              );
            })}
          </svg>
          <span className="hdemo-score">
            <span aria-hidden>{n}</span>
            <span className="hdemo-grade" aria-hidden>A</span>
            <span className="sr-only">Health score {HEALTH} out of 100, grade A</span>
          </span>
          <span className="hdemo-out" aria-hidden>Out of 100</span>
        </div>

        <ul className="hdemo-bars">
          {PILLARS.map((p, i) => (
            <li key={p.label} style={{ '--d': `${i * STEP_MS}ms` } as CSSProperties}>
              <span className="hdemo-row">
                <span className="hdemo-name">
                  <span className={p.strong ? 'hdemo-dot up' : 'hdemo-dot down'} aria-hidden />
                  {p.label}
                </span>
                <span className={p.strong ? 'hdemo-sig up' : 'hdemo-sig down'}>{p.strong ? 'Strong' : 'Weak'}</span>
              </span>
              <span className="hdemo-track">
                <span className={p.strong ? 'hdemo-bar up' : 'hdemo-bar down'} style={{ '--r': p.ratio } as CSSProperties} />
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="hdemo-summary">Highly profitable, cash generative and financially secure.</p>
    </div>
  );
}

// ── Shared parts for the remaining cards ─────────────────────────────────────
// A demo's phase drives two things: `.demo-rise` children (fade and lift in,
// each after its own --d) and <Count> numbers (0 to their value). Both rest on
// the final state, so the server HTML and reduced motion never move.

function usePhase(ref: RefObject<HTMLElement | null>): Phase {
  const [phase, setPhase] = useState<Phase>('rest');
  usePlayOnView(ref, () => setPhase('armed'), () => setPhase('play'));
  return phase;
}

const d = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties;

/** A number that counts up while its demo plays; screen readers get `to`. */
function Count({ phase, to, fmt, ms = 800, delay = 0 }: { phase: Phase; to: number; fmt: (n: number) => string; ms?: number; delay?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (phase !== 'play') return;
    let cancel = () => {};
    const t = setTimeout(() => { cancel = countUp(to, ms, setN); }, delay);
    return () => { clearTimeout(t); cancel(); };
  }, [phase, to, ms, delay]);
  const shown = phase === 'armed' ? 0 : phase === 'play' ? n : to;
  return (
    <>
      <span aria-hidden>{fmt(shown)}</span>
      <span className="sr-only">{fmt(to)}</span>
    </>
  );
}

/** "+1.27%" / "−0.20%": the sign comes from the final value, so a count to a loss never shows "+". */
const signedPct = (to: number, digits = 2) => (v: number) => `${to < 0 ? '−' : '+'}${Math.abs(v).toFixed(digits)}%`;

function DemoHead({ title, when, children }: { title: string; when: string; children?: ReactNode }) {
  return (
    <div className="demo-head">
      <span className="demo-co">
        {title}
        <span className="demo-when mono">{when}</span>
      </span>
      {children}
    </div>
  );
}

// ── A scorecard for your watchlist ───────────────────────────────────────────
// WatchlistScorecard's four tiles, as captured from a real list on 2026-11-02
// (public/screenshots/bento-watchlist.png). Labels from the watchlist locale.
export function WatchlistDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const phase = usePhase(ref);
  return (
    <div ref={ref} className="demo" data-phase={phase}>
      <DemoHead title="Your watchlist" when="Example from Nov 2" />
      <div className="demo-body wdemo-grid" role="group" aria-label="List summary">
        <div className="wdemo-tile">
          <p className="wdemo-label">Average move today</p>
          <p className="wdemo-big mono up"><Count phase={phase} to={0.32} fmt={signedPct(0.32)} /></p>
          <p className="wdemo-sub demo-rise" style={d(600)}>8 up · 2 down · 1 flat</p>
        </div>
        <div className="wdemo-tile">
          <p className="wdemo-label">Best and worst today</p>
          <p className="wdemo-row mono up demo-rise" style={d(150)}>AMD <Count phase={phase} to={1.27} fmt={signedPct(1.27)} delay={150} /></p>
          <p className="wdemo-row mono down demo-rise" style={d(300)}>GNRC <Count phase={phase} to={-0.2} fmt={signedPct(-0.2)} delay={300} /></p>
        </div>
        <div className="wdemo-tile">
          <p className="wdemo-label">Since you added them</p>
          <p className="wdemo-big mono down"><Count phase={phase} to={-2.84} fmt={signedPct(-2.84)} /></p>
          <p className="wdemo-sub demo-rise" style={d(700)}>S&amp;P 500 −1.44% over the same days</p>
          <p className="wdemo-sub demo-rise" style={d(850)}>1.4 points behind the market</p>
        </div>
        <div className="wdemo-tile">
          <p className="wdemo-label">Health Scores</p>
          <p className="wdemo-grades mono demo-rise" style={d(450)}>4 A · 3 B · 1 C</p>
          <p className="wdemo-sub demo-rise" style={d(550)}>8 of the 11 have a score</p>
        </div>
      </div>
    </div>
  );
}

// ── The economy, in plain numbers ────────────────────────────────────────────
// Three /tools/economy result cards with the latest numbers (getLandingEconomy,
// read on the server). FALLBACK is the 2026-11-02 capture, shown only if that
// read fails, with its own date in the head. The "next release" dates are left
// out because they pass.
const FALLBACK: LandingEconomy = {
  asOf: '2026-11-02',
  fed: { lower: 3.75, upper: 4 },
  cpi: { period: '2026-09-01', basis: 'year', actual: 3.7, previous: 3.4 },
  jobs: { period: '2026-09-01', actual: 29, previous: 133 },
};
const pct = (digits: number) => (v: number) => `${v.toFixed(digits)}%`;
/** Jobs counts: the sign comes from the final value, so a count to a loss never shows "+". */
const signedInt = (to: number) => (v: number) => `${to < 0 ? '−' : '+'}${Math.abs(Math.round(v)).toLocaleString('en-US')}`;
const monthOf = (period: string) =>
  new Date(`${period.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayOf = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function Change({ now, before, fmt, delay }: { now: number; before: number | null; fmt: (v: number) => string; delay: number }) {
  if (before == null) return null;
  const word = now > before ? 'Up' : now < before ? 'Down' : 'Same as';
  return (
    <p className="edemo-change demo-rise" style={d(delay)}>
      {now > before ? <ArrowUp size={14} aria-hidden /> : now < before ? <ArrowDown size={14} aria-hidden /> : null}
      {word} {now === before ? 'last time' : `from ${fmt(before)}`}
    </p>
  );
}

export function EconomyDemo({ economy }: { economy?: LandingEconomy | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const phase = usePhase(ref);
  const e = economy ?? FALLBACK;
  const jobs = e.jobs.actual * 1000;
  const jobsBefore = e.jobs.previous == null ? null : e.jobs.previous * 1000;
  return (
    <div ref={ref} className="demo" data-phase={phase}>
      <DemoHead title="BullPen Economy" when={economy ? `Latest, ${dayOf(e.asOf)}` : `Example from ${dayOf(e.asOf)}`} />
      <ul className="demo-body edemo-list">
        <li className="edemo-card">
          <p className="edemo-title"><Landmark size={16} aria-hidden />Fed interest rate</p>
          <p className="edemo-sub">Federal funds target range</p>
          <p className="edemo-value mono">
            <Count phase={phase} to={e.fed.lower} fmt={pct(2)} /> to <Count phase={phase} to={e.fed.upper} fmt={pct(2)} />
          </p>
        </li>
        <li className="edemo-card">
          <p className="edemo-title"><ShoppingCart size={16} aria-hidden />CPI inflation</p>
          <p className="edemo-sub">Inflation, past {e.cpi.basis} · {monthOf(e.cpi.period)}</p>
          <p className="edemo-value mono"><Count phase={phase} to={e.cpi.actual} fmt={pct(1)} delay={150} /></p>
          <Change now={e.cpi.actual} before={e.cpi.previous} fmt={pct(1)} delay={900} />
        </li>
        <li className="edemo-card">
          <p className="edemo-title"><Briefcase size={16} aria-hidden />Jobs report</p>
          <p className="edemo-sub">Jobs added · {monthOf(e.jobs.period)}</p>
          <p className="edemo-value mono"><Count phase={phase} to={jobs} fmt={signedInt(jobs)} delay={300} /></p>
          <Change now={jobs} before={jobsBefore} fmt={(v) => signedInt(v)(v)} delay={1050} />
        </li>
      </ul>
    </div>
  );
}

// ── Learn the basics as you go ───────────────────────────────────────────────
// DailyChallengeCard with the real 2026-11-06 challenge (academy_daily_challenges),
// in its stored order. Chosen over the 11-02 one, whose right answer was the
// first option and three times longer than the rest, so length alone gave it
// away; here all four are 52 to 58 characters and only one can be right. The
// options rise in when the card plays; answering is real, checked against the
// stored answer.
const CHALLENGE = {
  question: 'On a stock price chart, what does a candlestick usually represent for a single time period?',
  options: [
    'The total number of shares traded during that period',
    'The opening, high, low, and closing prices for that period',
    "The company's earnings per share reported that quarter",
    'The average price the stock has held since it first listed',
  ],
  correct: 1,
  explanation:
    'A candlestick packs four prices into one shape: the open, high, low, and close for a set period, such as one day. The body shows the open and close, while the thin wicks show the high and low, which is why it is so useful for spotting price movement at a glance.',
  xp: 15,
};

export function AcademyDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const phase = usePhase(ref);
  const [picked, setPicked] = useState<number | null>(null);
  const done = picked !== null;
  const right = picked === CHALLENGE.correct;
  return (
    <div ref={ref} className="demo" data-phase={phase}>
      <div className="demo-head">
        <span className="ademo-title">
          <span className="ademo-flame"><Flame size={16} aria-hidden /></span>
          <span>
            <span className="ademo-name">Daily Challenge</span>
            <span className="ademo-tag">Keep your streak alive</span>
          </span>
        </span>
        <span className="ademo-xp"><Zap size={13} aria-hidden />+{CHALLENGE.xp} XP</span>
      </div>
      <div className="demo-body">
        <p className="ademo-q">{CHALLENGE.question}</p>
        <div className="ademo-options">
          {CHALLENGE.options.map((o, i) => {
            const state = !done ? '' : i === CHALLENGE.correct ? ' is-right' : i === picked ? ' is-wrong' : ' is-dim';
            return (
              <button key={i} type="button" disabled={done} onClick={() => setPicked(i)} className={`ademo-option demo-rise${state}`} style={d(i * 90)}>
                <span>{o}</span>
                {done && i === CHALLENGE.correct && <Check size={16} aria-label="Right answer" />}
                {done && i === picked && !right && <X size={16} aria-label="Your answer" />}
              </button>
            );
          })}
        </div>
        <div role="status" aria-live="polite">
          {done && (
            <div className="ademo-result">
              <p className={right ? 'ademo-verdict up' : 'ademo-verdict warn'}>
                <span>{right ? 'Correct!' : 'Not quite'}</span>
                {right && <span className="ademo-earned"><Zap size={13} aria-hidden />+{CHALLENGE.xp} XP</span>}
              </p>
              <p className="ademo-why">{CHALLENGE.explanation}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Your market in a minute ──────────────────────────────────────────────────
// The TL;DR of the real 2026-11-02 Daily Brief (daily_briefs), whole: the
// landing shows it sentence by sentence rather than cutting it off.
const Tk = ({ s }: { s: string }) => <span className="bdemo-tk mono">${s}</span>;

export function DailyBriefDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const phase = usePhase(ref);
  return (
    <div ref={ref} className="demo" data-phase={phase}>
      <DemoHead title="Daily Brief" when="Example from Nov 2" />
      <div className="demo-body">
        <p className="bdemo-title">
          Earnings Misery Spreads: <Tk s="RDDT" />, <Tk s="TWLO" />, <Tk s="ILMN" /> Beat and Still Burn
        </p>
        <p className="bdemo-text">
          <span className="demo-rise" style={d(150)}>Beating estimates stopped being enough Friday. </span>
          <span className="demo-rise" style={d(450)}><b>Reddit</b> (<Tk s="RDDT" />) and <b>Twilio</b> (<Tk s="TWLO" />) both beat and both got crushed on guidance. </span>
          <span className="demo-rise" style={d(750)}>Fear is elevated: the VIX closed at 19.42, and BullPen&apos;s Market Mood reads 38, Fear. </span>
          <span className="demo-rise" style={d(1050)}><b>Apple</b> (<Tk s="AAPL" />) and <b>Palantir</b> (<Tk s="PLTR" />) report tonight.</span>
        </p>
        <a href="#pricing" className="bdemo-link demo-rise" style={d(1300)}>
          Read the full brief with Pro <ArrowUpRight size={15} aria-hidden />
        </a>
      </div>
    </div>
  );
}

// ── Ask Bull ─────────────────────────────────────────────────────────────────
// One real Bull turn, captured 2026-11-25 from the production agent (runAgent,
// beginner level), replayed the way the chat panel shows it: the question is
// typed and sent, the tool status runs, the two getHealthScore cards land, the
// reply fades in word by word, and the createAlert Confirm card follows.
// BULL_ANSWER is the reply exactly as written (markdown); the cards are the
// tool outputs, drawn like HealthScoreResultCard and ActionReceiptCard.
// Confirm and Cancel play the card's real states; nothing is saved here.
const BULL_Q = 'Is Costco or Walmart in better financial shape? Set an alert if the healthier one drops 5%.';
const BULL_ANSWER = "**Costco ($COST) is in better financial shape.** BullPen's Health Score (0 to 100) rates it 82 (grade B, \"Good\"). Walmart ($WMT) scores 66 (grade C, \"Fair\").\n\n| Area | Costco | Walmart |\n|---|---|---|\n| Profitability (out of 30) | 21 | 18 |\n| Financial Strength (out of 25) | 24 | 17 |\n| Cash Flow (out of 20) | 16 | 16 |\n| Growth (out of 15) | 11 | 5 |\n| Stability (out of 10) | 10 | 10 |\n\n- **Financial Strength** is the biggest gap. This area covers things like how easily a company pays its debt interest and whether it has enough short-term cash for its bills. Costco is nearly perfect here.\n- **Growth** is the other big gap. It compares the latest quarter's sales and earnings with the same quarter a year ago. Walmart scores weakly, which pulls its total down.\n- **Cash Flow and Stability** are tied. Both companies bring in real cash, and both have calm, steady share prices.\n\nThe score measures business quality and safety, not whether the stock is cheap. A healthy company can still be expensive.\n\n**Alert:** I've set up an alert for Costco that fires if the stock falls 5% or more in a single day. It isn't saved yet. Press **Confirm** on the card below to turn it on, or Cancel to skip it.";
const BULL_CARDS = [
  { ticker: 'COST', score: 82, grade: 'B', rows: [['Profitability', 21, 30], ['Financial Strength', 24, 25], ['Cash Flow', 16, 20], ['Growth', 11, 15], ['Stability', 10, 10]] },
  { ticker: 'WMT', score: 66, grade: 'C', rows: [['Profitability', 18, 30], ['Financial Strength', 17, 25], ['Cash Flow', 16, 20], ['Growth', 5, 15], ['Stability', 10, 10]] },
] as const;
const BULL_ALERT = 'Daily drop alert for COST: Daily drop ≥ 5.0%';

// The reply, parsed once into blocks of bold / $TICKER / plain runs.
type Run = { t: string; b: boolean; tk: boolean };
type Block = { kind: 'p' | 'li' | 'tr'; cells: Run[][] };
const runs = (line: string): Run[] =>
  line.split(/(\*\*[^*]+\*\*)/).filter(Boolean).flatMap((part) => {
    const b = part.startsWith('**');
    return (b ? part.slice(2, -2) : part).split(/(\$[A-Z]{1,5}\b)/).filter(Boolean).map((t) => ({ t, b, tk: t.startsWith('$') }));
  });
const BLOCKS: Block[] = BULL_ANSWER.split('\n')
  .filter((l) => l.trim() && !/^\|[-| ]+\|$/.test(l))
  .map((l): Block =>
    l.startsWith('|') ? { kind: 'tr', cells: l.split('|').slice(1, -1).map((c) => runs(c.trim())) }
    : l.startsWith('- ') ? { kind: 'li', cells: [runs(l.slice(2))] }
    : { kind: 'p', cells: [runs(l)] },
  );
// The reply's plain text, in the order the words carry their `data-o`.
const ANSWER_TEXT = BLOCKS.flatMap((b) => b.cells.flat()).map((r) => r.t).join('');
const STREAM_CPS = 280; // how fast the reply "arrives", like the model's stream

// The reply is laid out whole from its first frame, so no word ever starts
// on one line and jumps to the next and the table never re-sizes. Each word
// carries its offset (`data-o`) so useBrushReveal can paint it line by
// line, exactly as the chat does.
// memo: the replay re-renders BullDemo every frame; the reply itself never changes.
const Answer = memo(function Answer() {
  let n = 0;
  const cell = (rs: Run[]) =>
    rs.map((r, i) => {
      let node: ReactNode;
      if (r.tk) {
        node = <span className="bdemo-tk mono" data-o={n}>{r.t}</span>;
        n += r.t.length;
      } else {
        node = (r.t.match(/\s*\S+\s*|\s+/g) ?? []).map((w, j) => {
          const s = <span key={j} data-o={n}>{w}</span>;
          n += w.length;
          return s;
        });
      }
      return <Fragment key={i}>{r.b ? <b>{node}</b> : node}</Fragment>;
    });
  const out: ReactNode[] = [];
  for (let i = 0; i < BLOCKS.length; ) {
    const kind = BLOCKS[i].kind;
    if (kind === 'p') {
      out.push(<p key={i}>{cell(BLOCKS[i].cells[0])}</p>);
      i++;
      continue;
    }
    const first = i;
    const items: ReactNode[] = [];
    for (; i < BLOCKS.length && BLOCKS[i].kind === kind; i++) {
      const cells = BLOCKS[i].cells;
      items.push(
        kind === 'li'
          ? <li key={i}>{cell(cells[0])}</li>
          : <tr key={i}>{cells.map((c, j) => (i === first ? <th key={j} scope="col">{cell(c)}</th> : <td key={j}>{cell(c)}</td>))}</tr>,
      );
    }
    out.push(kind === 'li' ? <ul key={first}>{items}</ul> : <div key={first} className="cdemo-table"><table><tbody>{items}</tbody></table></div>);
  }
  return <>{out}</>;
});

/** The reply, painted while the replay plays, then the Confirm card. */
function PaintedAnswer({ since, paint, edgeRef, paintedRef, children }: {
  since: number;
  paint: boolean;
  edgeRef: RefObject<number>;
  /** Set to the time the brush finished, so the replay knows when to stop. */
  paintedRef: RefObject<number>;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const arrived = Math.min(ANSWER_TEXT.length, Math.floor((since * STREAM_CPS) / 1000));
  const { painting } = useBrushReveal(box, ANSWER_TEXT.slice(0, arrived), arrived < ANSWER_TEXT.length, { paint, edge: edgeRef });
  useEffect(() => {
    if (!painting) paintedRef.current = performance.now();
  }, [painting, paintedRef]);
  return (
    <>
      <div ref={box} className="cdemo-answer">
        <Answer />
      </div>
      {!painting && children}
    </>
  );
}

const TYPE_MS = 16;
const T_SEND = BULL_Q.length * TYPE_MS + 450;
const T_CARDS = T_SEND + 1500;
const T_STREAM = T_CARDS + 800;
const STATUS_OUT_MS = 260; // the status line fades out before the reply starts
const SETTLE_MS = 900; // the clock runs on so the scroll can glide to the Confirm card

const barTone = (r: number) => (r >= 0.7 ? 'up' : r >= 0.45 ? 'warn' : 'down');

export function BullDemo({ onSignUp }: { onSignUp?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const goal = useRef(0);
  const wrote = useRef(-1);
  const edge = useRef(0);
  const painted = useRef(0);
  const lastT = useRef(Infinity);
  // Milliseconds into the replay. At rest it is past the end: the server
  // HTML, reduced motion and a card already on screen show the finished chat.
  const [t, setT] = useState(Infinity);
  const [playing, setPlaying] = useState(false);
  const [alert, setAlert] = useState<'ask' | 'set' | 'cancelled'>('ask');
  const stop = useRef<() => void>(() => {});

  usePlayOnView(
    ref,
    () => setT(-1),
    () => {
      setPlaying(true);
      painted.current = 0;
      const start = performance.now();
      let id = 0;
      const tick = (now: number) => {
        setT(now - start);
        if (!painted.current || now - painted.current < SETTLE_MS) id = requestAnimationFrame(tick);
        else setPlaying(false);
      };
      id = requestAnimationFrame(tick);
      stop.current = () => cancelAnimationFrame(id);
    },
  );
  useEffect(() => () => stop.current(), []);
  // The reader owns the scroll, as in the chat: follow only while they are
  // with the reply. The view glides (eased each frame) toward the line being
  // painted, not toward the bottom of the laid-out, still invisible text, and
  // after the reply toward the Confirm card. It never scrolls back up.
  useEffect(() => {
    const el = scroller.current;
    const dt = t - lastT.current;
    lastT.current = t;
    if (!el || !follow.current || t < 0) return;
    // The replay's last frame: make sure the Confirm card is in view, even
    // if a slow device dropped the frames the glide needed.
    if (!playing) {
      if (dt > 0) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      return;
    }
    let to = el.scrollHeight - el.clientHeight;
    const box = el.querySelector('.cdemo-answer');
    if (box && !painted.current) {
      const below = box.getBoundingClientRect().top + edge.current - el.getBoundingClientRect().bottom;
      to = Math.min(to, el.scrollTop + below + 28);
    }
    goal.current = to;
    if (to > el.scrollTop + 0.5) {
      // Time-based easing, so the glide is the same at 30 and 120 fps.
      el.scrollTop += (to - el.scrollTop) * (1 - Math.exp(-Math.max(dt, 0) / 110));
      wrote.current = el.scrollTop;
    }
  }, [t, playing]);

  const armed = t < 0;
  const sent = t >= T_SEND;
  const typed = armed || sent ? '' : BULL_Q.slice(0, Math.floor(t / TYPE_MS));
  const status = !sent || t >= T_STREAM ? null : t < T_CARDS ? 'Checking financial health…' : 'Setting up your alert…';

  return (
    <div ref={ref} className="demo cdemo" data-phase={armed ? 'armed' : playing ? 'play' : 'rest'}>
      <div className="cdemo-head">
        <span className="cdemo-title">Ask Bull</span>
        <span className="demo-when mono">Asked Nov 25</span>
      </div>

      <div
        ref={scroller}
        className="cdemo-scroll"
        tabIndex={0}
        role="log"
        aria-label="A real conversation with Bull"
        onScroll={(e) => {
          // Our own glide lands where it wrote; anything else is the reader.
          const el = e.currentTarget;
          if (Math.abs(el.scrollTop - wrote.current) > 1) follow.current = el.scrollTop >= goal.current - 40;
        }}
      >
        {sent && <p className="cdemo-q">{BULL_Q}</p>}
        {t >= T_CARDS && (
          <div className="cdemo-reply">
            <div className="cdemo-cards">
              {BULL_CARDS.map((c, ci) => (
                <div key={c.ticker} className="cdemo-card" style={d(ci * 110)}>
                  <p className="cdemo-card-head">
                    <span>{c.ticker} Financial Health</span>
                    <span className={c.grade === 'C' ? 'cdemo-badge warn' : 'cdemo-badge up'}>{c.score}/100 · {c.grade}</span>
                  </p>
                  {c.rows.map(([name, s, max], ri) => (
                    <div key={name} className="cdemo-row">
                      <p><span>{name}</span><span className="mono">{s}/{max}</span></p>
                      <span className="cdemo-track"><span className={`cdemo-bar ${barTone(s / max)}`} style={{ width: `${(s / max) * 100}%`, ...d(200 + ci * 110 + ri * 50) }} /></span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            {t >= T_STREAM && (
              <PaintedAnswer since={t - T_STREAM} paint={playing} edgeRef={edge} paintedRef={painted}>
                <div className="cdemo-action" aria-live="polite">
                  {alert === 'ask' ? (
                    <div className="cdemo-confirm" role="group" aria-label={BULL_ALERT}>
                      <p className="cdemo-what">{BULL_ALERT}</p>
                      <p className="cdemo-hint">Nothing changes until you confirm.</p>
                      <div className="cdemo-btns">
                        <button type="button" className="is-primary" onClick={() => setAlert('set')}>Confirm</button>
                        <button type="button" onClick={() => setAlert('cancelled')}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <p className="cdemo-receipt" role="status">
                      {alert === 'set' ? <><Check size={14} aria-hidden />Alert set for COST</> : <><s>{BULL_ALERT}</s> Cancelled</>}
                      <button type="button" onClick={() => setAlert('ask')}>Undo</button>
                    </p>
                  )}
                </div>
              </PaintedAnswer>
            )}
          </div>
        )}
        {/* After the reply so far, as in the chat: cards first, then what Bull is doing next. */}
        {status && (
          <p className={t >= T_STREAM - STATUS_OUT_MS ? 'cdemo-status is-leaving' : 'cdemo-status'} role="status">
            <BullAiIcon pose="think" size={28} />
            <span key={status}>{status}</span>
          </p>
        )}
      </div>

      {/* The demo's own input: it types the question while the replay plays,
          and otherwise opens sign-up, so it is never a dead box. */}
      <button type="button" className="cdemo-input" onClick={onSignUp} aria-label="Sign up free to ask Bull your own question">
        <span className={typed ? 'cdemo-typed' : 'cdemo-placeholder'} aria-hidden>
          {typed || 'Ask anything…'}
          {typed && <span className="cdemo-caret" />}
        </span>
        <span className={typed ? 'cdemo-send is-ready' : 'cdemo-send'} aria-hidden><Send size={16} /></span>
      </button>
    </div>
  );
}
