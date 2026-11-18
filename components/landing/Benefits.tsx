import { getImageProps } from 'next/image';
import type { ComponentType, CSSProperties } from 'react';
import { SectionHeading } from './Atoms';
import { HealthDemo, PlainEnglishDemo } from './Demos';

/**
 * What a beginner gets, free first, as a bento of real light-mode captures.
 *
 * Each capture is one card of the real app, taken twice from the app's own
 * responsive layout (scripts/capture-landing-screenshots.js): a 568px-wide
 * card at 2x for the desktop bento, a 328px one at 3x for phones. Both show at
 * close to the app's own size inside an inset frame, so text reads like it
 * does in the product and no corner is cut. `y` scrolls a tall
 * capture to the moment the copy talks about. See public/screenshots/README.md.
 * A card with `demo` shows a live, animated copy of the app's UI instead
 * (Demos.tsx).
 */

interface Shot {
  /** CSS size of the capture; the file is 2x (desktop) or 3x (phone). */
  w: number;
  h: number;
  /** Px to scroll the capture up inside the card. */
  y?: number;
}

interface Common {
  title: string;
  body: string;
  /** Capture file name; also the card's key. */
  file: string;
  pro?: boolean;
}
type ShotBenefit = Common & { alt: string; desktop: Shot; phone: Shot };
type Benefit = ShotBenefit | (Common & { demo: ComponentType });

const BENEFITS: Benefit[] = [
  {
    title: 'Every number, in plain English.',
    body: 'Beginner mode turns "EV/EBITDA" into "Company value vs operating profit" and says what it means for this company. Tap any label for more.',
    file: 'bento-plain-english',
    demo: PlainEnglishDemo,
  },
  {
    title: 'One grade for how healthy a company is.',
    body: 'Profit, debt, cash, growth and risk, scored out of 100 and graded A to F, so two companies compare at a glance.',
    file: 'bento-health',
    demo: HealthDemo,
  },
  {
    title: 'A scorecard for your watchlist.',
    body: 'How your list moved today, its best and worst stock, and how your picks have done since you added them compared with the S&P 500.',
    file: 'bento-watchlist',
    alt: "A watchlist scorecard: today's average move, the best and worst stock, the return since the stocks were added against the S&P 500, and the list's health grades",
    desktop: { w: 568, h: 224 },
    phone: { w: 328, h: 272 },
  },
  {
    title: 'The economy, in plain numbers.',
    body: 'What the Fed, inflation and the jobs report actually came in at, against last time, with a note in the app when a new number lands.',
    file: 'bento-economy',
    alt: 'BullPen Economy: the Fed interest rate range, CPI inflation and the jobs report, each with its latest result, the change from last time and the next release date',
    desktop: { w: 568, h: 1054 },
    phone: { w: 328, h: 1054 },
  },
  {
    title: 'Learn the basics as you go.',
    body: 'Short lessons and one question a day, starting from "What is a stock?". Free, with a streak to keep you coming back.',
    file: 'bento-academy',
    alt: "BullPen Academy's daily challenge, asking which of four answers is the strongest example of a good investment thesis",
    desktop: { w: 568, h: 394 },
    phone: { w: 328, h: 534 },
  },
  {
    title: 'Your market in a minute, every morning.',
    body: "A short read before the open: what moved, what's coming and what it means for the stocks you follow.",
    file: 'bento-daily-brief',
    alt: 'A Daily Brief headline and summary about Reddit and Twilio falling after earnings, market fear and the companies reporting tonight',
    desktop: { w: 568, h: 192 },
    phone: { w: 328, h: 211 },
    pro: true,
  },
];

function Capture({ b }: { b: ShotBenefit }) {
  const desktop = getImageProps({ src: `/screenshots/${b.file}.png`, alt: b.alt, width: b.desktop.w, height: b.desktop.h });
  const phone = getImageProps({ src: `/screenshots/${b.file}-m.png`, alt: b.alt, width: b.phone.w, height: b.phone.h });
  const vars = {
    // Percent of the width: a top margin in % follows the frame's width, so the scroll scales with the image.
    '--shot-w': `${b.desktop.w}px`, '--shot-y': `${(-(b.desktop.y ?? 0) / b.desktop.w) * 100}%`,
    '--shot-w-m': `${b.phone.w}px`, '--shot-y-m': `${(-(b.phone.y ?? 0) / b.phone.w) * 100}%`,
  } as CSSProperties;
  return (
    <div className="benefit-shot" style={vars}>
      <picture>
        <source media="(min-width: 901px)" srcSet={desktop.props.srcSet} width={b.desktop.w} height={b.desktop.h} />
        <img {...phone.props} alt={b.alt} loading="lazy" />
      </picture>
    </div>
  );
}

export function Benefits() {
  return (
    <section id="features" className="landing-section">
      <div className="wrap">
        <SectionHeading
          title="Built for people who aren't finance people."
          sub="The free plan covers the essentials. Pro adds a morning brief, an answer for any stock, and no limits."
        />
        <div className="benefits-grid">
          {BENEFITS.map((b) => (
            <article key={b.file} className="benefit-card">
              <div className="benefit-copy">
                <h3 className="benefit-title">
                  {b.title}
                  {b.pro && <span className="benefit-pro">Pro</span>}
                </h3>
                <p className="benefit-body">{b.body}</p>
              </div>
              {'demo' in b ? (
                <div className="benefit-demo"><b.demo /></div>
              ) : (
                <Capture b={b} />
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
