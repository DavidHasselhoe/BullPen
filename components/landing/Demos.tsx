'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { BarChart2, CircleHelp, Sparkles } from 'lucide-react';
import { CompanyLogo } from '@/components/company/CompanyLogo';

/**
 * Live versions of two bento cards, built from the same parts and the same
 * NVIDIA numbers as the app, so the landing shows what the product does
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
function countUp(to: number, ms: number, onFrame: (n: number) => void): () => void {
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
        <div role="radiogroup" aria-label="Labels" className="demo-toggle">
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
