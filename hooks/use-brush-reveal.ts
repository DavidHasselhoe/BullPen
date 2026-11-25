'use client';

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

/**
 * Bull's reply, painted rather than typed: a soft-edged brush sweeps each
 * line left to right, one stroke per line, and the next stroke starts as the
 * last one lifts. Nothing ahead of the brush is visible, so the words, the
 * bullets and a table row's rule all appear exactly when the stroke reaches
 * them.
 *
 * How: the words inside `box` carry their offset in the text (`data-o`,
 * rehypeWords in BullpenChat, the spans in the landing demo). After each
 * render the hook measures their line boxes; every frame it moves the brush
 * and writes one CSS mask on `box`: a solid layer over the finished lines and
 * a feathered gradient band over the line being painted.
 *
 * Layout never changes where the brush has been. Only a little text past the
 * brush is laid out (`shown`), so a word that wraps, or a `**` that closes,
 * moves only in the unpainted part; an unclosed `**` is closed early so bold
 * never pops in behind the brush.
 *
 * Pace: brisk but even, sped up only when the reply runs far ahead of it.
 * Text complete at mount (a past message) and reduced motion show in full.
 */

/** Brush pace, in characters per second (about half a second a line). The calibration knob. */
const BASE_CPS = 120;
/** The brush never trails the text by more than about this long. */
const CATCH_UP_MS = 4000;
/** The brush's soft edge, in px. */
const FEATHER = 72;
/** How far past the brush's line the text is laid out, in characters. */
const LOOKAHEAD = 90;

type Line = { top: number; bottom: number; left: number; right: number; start: number; end: number };

function measure(box: HTMLElement): Line[] {
  const origin = box.getBoundingClientRect();
  const lines: Line[] = [];
  for (const w of box.querySelectorAll<HTMLElement>('[data-o]')) {
    const start = Number(w.dataset.o);
    const end = start + (w.textContent?.length ?? 0);
    for (const r of w.getClientRects()) {
      if (!r.width) continue;
      const top = r.top - origin.top;
      const bottom = r.bottom - origin.top;
      // Same line: overlaps an existing line by more than half its height
      // (table cells side by side share one line, one stroke across the row).
      const l = lines.find((x) => Math.min(x.bottom, bottom) - Math.max(x.top, top) > (bottom - top) / 2);
      const left = r.left - origin.left;
      const right = r.right - origin.left;
      if (l) {
        l.top = Math.min(l.top, top);
        l.bottom = Math.max(l.bottom, bottom);
        l.left = Math.min(l.left, left);
        l.right = Math.max(l.right, right);
        l.start = Math.min(l.start, start);
        l.end = Math.max(l.end, end);
      } else lines.push({ top, bottom, left, right, start, end });
    }
  }
  return lines.sort((a, b) => a.top - b.top);
}

/** A stroke eases in and out a little, like a hand; past its end it runs on straight. */
const stroke = (t: number) => (t >= 1 ? t : 0.6 * t + 0.4 * (0.5 - Math.cos(Math.PI * t) / 2));

/** `text` cut at the last whitespace at or before `at`, with an open `**` closed. */
function layoutText(text: string, at: number): string {
  if (at >= text.length) return text;
  const cut = text.slice(0, at + 1).search(/\s\S*$/);
  const s = text.slice(0, cut > 0 ? cut : 0);
  return (s.match(/\*\*/g)?.length ?? 0) % 2 ? `${s}**` : s;
}

export function useBrushReveal(
  box: RefObject<HTMLElement | null>,
  text: string,
  streaming: boolean,
  opts: {
    /** Paint from mount. Defaults to `streaming`: a finished reply just shows. */
    paint?: boolean;
    /** Speed multiplier. */
    pace?: number;
    /** Gets the bottom of the line being painted, in px from the top of `box`. */
    edge?: RefObject<number>;
  } = {},
): { shown: string; painting: boolean } {
  const { pace = 1 } = opts;
  const [painting, setPainting] = useState(
    () => (opts.paint ?? streaming) && typeof window !== 'undefined' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [horizon, setHorizon] = useState(LOOKAHEAD * 2);
  const lines = useRef<Line[]>([]);
  const ownEdge = useRef(0);
  const edge = opts.edge ?? ownEdge;
  const live = useRef({ text, streaming, horizon });
  useEffect(() => {
    live.current = { text, streaming, horizon };
  });

  const shown = painting ? layoutText(text, horizon) : text;

  // Re-measure after every layout change: new text, or a new width.
  useLayoutEffect(() => {
    if (painting && box.current) lines.current = measure(box.current);
  }, [painting, shown, box]);

  useEffect(() => {
    const el = box.current;
    if (!painting || !el) return;
    const ro = new ResizeObserver(() => (lines.current = measure(el)));
    ro.observe(el);
    let brush = 0;
    let last = performance.now();
    let mask = '';
    let raf = 0;
    const tick = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      const ls = lines.current;
      const { text: t, streaming: s, horizon: h } = live.current;
      const total = ls.reduce((n, l) => n + l.right - l.left, 0);
      const chars = ls.reduce((n, l) => n + l.end - l.start, 0);
      const pxPerChar = chars ? total / chars : 7;

      // Where the brush is: the first line it has not finished with.
      let from = 0;
      let i = 0;
      while (i < ls.length && brush >= from + ls[i].right - ls[i].left + FEATHER) from += ls[i].right - ls[i++].left;
      const backlog = t.length - (ls[i]?.start ?? t.length);
      const cps = Math.max(BASE_CPS, (backlog * 1000) / CATCH_UP_MS) * pace;
      const complete = !s && h >= t.length;
      brush = Math.min(brush + (cps * pxPerChar * dt) / 1000, complete ? total + FEATHER : total);

      if (complete && brush >= total + FEATHER) {
        el.style.mask = '';
        setPainting(false);
        return;
      }
      // Lay out a little past the line being painted.
      const want = (ls[i + 1] ?? ls[i])?.end ?? 0;
      if (want + LOOKAHEAD > h && h < t.length) setHorizon(want + LOOKAHEAD);

      // The mask: solid over every finished line, a feathered band over each
      // line the brush is on (the last stroke's tail overlaps the next one).
      const layers: string[] = [];
      const doneTo = ls[i] ? ls[i].top - 2 : el.scrollHeight;
      if (doneTo > 0) layers.push(`linear-gradient(#000 0 0) 0 0 / 100% ${doneTo}px no-repeat`);
      for (let j = i, at = from; j < ls.length && brush > at; at += ls[j].right - ls[j].left, j++) {
        const l = ls[j];
        const w = l.right - l.left;
        const x = l.left + w * stroke((brush - at) / w);
        layers.push(`linear-gradient(90deg, #000 ${x - FEATHER}px, transparent ${x}px) 0 ${l.top - 2}px / 100% ${l.bottom - l.top + 4}px no-repeat`);
        edge.current = l.bottom;
      }
      const next = layers.join(', ') || 'linear-gradient(transparent 0 0)';
      if (next !== mask) el.style.mask = mask = next;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [painting, box, pace, edge]);

  return { shown, painting };
}
