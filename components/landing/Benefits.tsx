import { getImageProps } from 'next/image';
import type { CSSProperties } from 'react';
import { SectionHeading } from './Atoms';

/**
 * What a beginner gets, free first, as a bento of real light-mode captures.
 *
 * Each capture is one card of the real app, taken twice from the app's own
 * responsive layout (scripts/capture-landing-screenshots.js): a 568px-wide
 * card at 2x for the desktop bento, a 328px one at 3x for phones. Both show at
 * the app's own size, so text reads like it does in the product instead of a
 * shrunken screen, and peek in from the card's corner. `y` scrolls a tall
 * capture to the moment the copy talks about. See public/screenshots/README.md.
 */

interface Shot {
  /** CSS size of the capture; the file is 2x (desktop) or 3x (phone). */
  w: number;
  h: number;
  /** Px to scroll the capture up inside the card. */
  y?: number;
}

interface Benefit {
  title: string;
  body: string;
  file: string;
  alt: string;
  desktop: Shot;
  phone: Shot;
  pro?: boolean;
}

const BENEFITS: Benefit[] = [
  {
    title: 'Every number, in plain English.',
    body: 'Beginner mode turns "EV/EBITDA" into "Company value vs operating profit" and says what it means for this company. Tap any label for more.',
    file: 'bento-plain-english',
    alt: "NVIDIA's company value vs operating profit, 24.39, on a scale from 0 to 30 with the typical value marked, and a plain-English line on what it means",
    desktop: { w: 568, h: 879, y: 596 },
    phone: { w: 328, h: 995, y: 700 },
  },
  {
    title: 'One grade for how healthy a company is.',
    body: 'Profit, debt, cash, growth and risk, scored out of 100 and graded A to F, so two companies compare at a glance.',
    file: 'bento-health',
    alt: "NVIDIA's financial health: 89 out of 100, grade A, with five categories such as how well it makes money and how bumpy the ride is",
    desktop: { w: 568, h: 346 },
    phone: { w: 328, h: 437 },
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
    desktop: { w: 568, h: 232 },
    phone: { w: 328, h: 252 },
    pro: true,
  },
];

function Capture({ b }: { b: Benefit }) {
  const desktop = getImageProps({ src: `/screenshots/${b.file}.png`, alt: b.alt, width: b.desktop.w, height: b.desktop.h });
  const phone = getImageProps({ src: `/screenshots/${b.file}-m.png`, alt: b.alt, width: b.phone.w, height: b.phone.h });
  const vars = {
    '--shot-w': `${b.desktop.w}px`, '--shot-y': `${-(b.desktop.y ?? 0)}px`,
    '--shot-w-m': `${b.phone.w}px`, '--shot-y-m': `${-(b.phone.y ?? 0)}px`,
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
              <Capture b={b} />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
