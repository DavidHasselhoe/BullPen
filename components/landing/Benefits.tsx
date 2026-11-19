import type { ComponentType } from 'react';
import { SectionHeading } from './Atoms';
import { AcademyDemo, DailyBriefDemo, EconomyDemo, HealthDemo, PlainEnglishDemo, WatchlistDemo } from './Demos';

/**
 * What a beginner gets, free first. Each card holds a live copy of the app's
 * own UI with real numbers (Demos.tsx), laid out wide, pair, pair, wide: the
 * idea that explains the product leads full width, the Pro brief closes as a
 * strip into Pricing.
 */

interface Benefit {
  id: string;
  title: string;
  body: string;
  demo: ComponentType;
  /** wide: full row, copy beside the demo on desktop. strip: wide, one tone darker. */
  span?: 'wide' | 'strip';
  pro?: boolean;
}

const BENEFITS: Benefit[] = [
  {
    id: 'plain-english',
    title: 'Every number, in plain English.',
    body: 'Beginner mode turns "EV/EBITDA" into "Company value vs operating profit" and says what it means for this company. Tap any label for more.',
    demo: PlainEnglishDemo,
    span: 'wide',
  },
  {
    id: 'health',
    title: 'One grade for how healthy a company is.',
    body: 'Profit, debt, cash, growth and risk, scored out of 100 and graded A to F, so two companies compare at a glance.',
    demo: HealthDemo,
  },
  {
    id: 'watchlist',
    title: 'A scorecard for your watchlist.',
    body: 'How your list moved today, its best and worst stock, and how your picks have done since you added them compared with the S&P 500.',
    demo: WatchlistDemo,
  },
  {
    id: 'economy',
    title: 'The economy, in plain numbers.',
    body: 'What the Fed, inflation and the jobs report actually came in at, against last time, with a note in the app when a new number lands.',
    demo: EconomyDemo,
  },
  {
    id: 'academy',
    title: 'Learn the basics as you go.',
    body: 'Short lessons and one question a day, starting from "What is a stock?". Free, with a streak to keep you coming back.',
    demo: AcademyDemo,
  },
  {
    id: 'daily-brief',
    title: 'Your market in a minute, every morning.',
    body: "A short read before the open: what moved, what's coming and what it means for the stocks you follow.",
    demo: DailyBriefDemo,
    span: 'strip',
    pro: true,
  },
];

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
            <article key={b.id} className={b.span ? `benefit-card is-wide${b.span === 'strip' ? ' is-strip' : ''}` : 'benefit-card'}>
              <div className="benefit-copy">
                <h3 className="benefit-title">
                  {b.title}
                  {b.pro && <span className="benefit-pro">Pro</span>}
                </h3>
                <p className="benefit-body">{b.body}</p>
              </div>
              <div className="benefit-demo"><b.demo /></div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
