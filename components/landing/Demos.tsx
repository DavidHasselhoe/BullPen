'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { ArrowDown, ArrowUp, ArrowUpRight, BarChart2, Briefcase, Check, CircleHelp, Flame, Landmark, ShoppingCart, Sparkles, X, Zap } from 'lucide-react';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { arcPath } from '@/components/finance/HealthRing';

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
        <CircleHelp size={15} aria-hidden className={simple ? 'mdemo-help' : 'mdemo-help is-hidden'} />
      </p>
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
// 2026-11-18: pillar scores, names from lib/finance/glossary.ts, the
// Strong/Weak bands HealthScoreCard uses (70% and up strong, under 45% weak;
// no pillar here lands in between), and the summary health-score.ts gives a
// score of 85 or more. Ring geometry is HealthRing's.
const HEALTH = 89;
const PILLARS = [
  { label: 'How Well It Makes Money', score: 30, max: 30 },
  { label: 'How Sturdy Its Finances Are', score: 24, max: 25 },
  { label: 'Whether Profits Turn Into Cash', score: 16, max: 20 },
  { label: "How Fast It's Growing", score: 15, max: 15 },
  { label: 'How Smooth the Ride Is', score: 4, max: 10 },
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
      <DemoHead title="Your watchlist" when="Nov 2" />
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
        </div>
      </div>
    </div>
  );
}

// ── The economy, in plain numbers ────────────────────────────────────────────
// Three /tools/economy result cards as captured on 2026-11-02. Each carries its
// own data period; the "next release" dates are left out because they pass.
const pct = (digits: number) => (v: number) => `${v.toFixed(digits)}%`;
const plusInt = (v: number) => `+${Math.round(v).toLocaleString('en-US')}`;

export function EconomyDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const phase = usePhase(ref);
  return (
    <div ref={ref} className="demo" data-phase={phase}>
      <DemoHead title="BullPen Economy" when="Nov 2" />
      <ul className="demo-body edemo-list">
        <li className="edemo-card">
          <p className="edemo-title"><Landmark size={16} aria-hidden />Fed interest rate</p>
          <p className="edemo-sub">Federal funds target range</p>
          <p className="edemo-value mono">
            <Count phase={phase} to={3.75} fmt={pct(2)} /> to <Count phase={phase} to={4} fmt={pct(2)} />
          </p>
        </li>
        <li className="edemo-card">
          <p className="edemo-title"><ShoppingCart size={16} aria-hidden />CPI inflation</p>
          <p className="edemo-sub">Inflation, past year · September 2026</p>
          <p className="edemo-value mono"><Count phase={phase} to={3.7} fmt={pct(1)} delay={150} /></p>
          <p className="edemo-change demo-rise" style={d(900)}><ArrowUp size={14} aria-hidden />Up from 3.4%</p>
        </li>
        <li className="edemo-card">
          <p className="edemo-title"><Briefcase size={16} aria-hidden />Jobs report</p>
          <p className="edemo-sub">Jobs added · September 2026</p>
          <p className="edemo-value mono"><Count phase={phase} to={29000} fmt={plusInt} delay={300} /></p>
          <p className="edemo-change demo-rise" style={d(1050)}><ArrowDown size={14} aria-hidden />Down from +133,000</p>
        </li>
      </ul>
    </div>
  );
}

// ── Learn the basics as you go ───────────────────────────────────────────────
// DailyChallengeCard with the real 2026-11-02 challenge (academy_daily_challenges),
// options in the order the app shuffles them to. The options rise in when the
// card plays; answering is real, checked against the stored answer.
const CHALLENGE = {
  question: 'Which of the following is the strongest example of a good investment thesis?',
  options: [
    "Company X's margins have expanded for three straight years because of a new cost-cutting program, and I expect that trend to continue if the program keeps delivering savings, which I can check in each quarterly report.",
    'The price dropped 20 percent this week, so it has to bounce back soon.',
    "Tech stocks always go up over time, so I'll buy the biggest tech company I can find.",
    'I have a good feeling about this stock because everyone on my favorite forum is excited about it.',
  ],
  correct: 0,
  explanation:
    'A strong thesis names a specific reason, explains how it leads to a return, and states what would prove it right or wrong. The margin-expansion thesis does all three, while the others rely on vague beliefs, hype, or price momentum with no testable reasoning.',
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
      <DemoHead title="Daily Brief" when="Nov 2" />
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
