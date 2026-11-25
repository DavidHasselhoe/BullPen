import type { ComponentType, ReactNode } from 'react';
import type { LandingEconomy } from '@/lib/landing/economy-snapshot';
import { QUOTAS } from '@/lib/billing/quotas';
import { BullAiIcon } from '@/components/ai/BullAiIcon';
import { SectionHeading } from './Atoms';
import { AcademyDemo, BullDemo, DailyBriefDemo, EconomyDemo, HealthDemo, PlainEnglishDemo, WatchlistDemo } from './Demos';

/**
 * What a beginner gets, free first. Each card holds a live copy of the app's
 * own UI with real numbers (Demos.tsx), laid out wide, pair, wide, pair,
 * strip: the idea that explains the product leads full width, Bull breaks up
 * the pairs, and the Pro brief closes as a strip into Pricing.
 */

interface Benefit {
  id: string;
  title: string;
  body: string;
  demo: ComponentType<{ economy?: LandingEconomy | null; onSignUp?: () => void }>;
  /** wide: full row, copy beside the demo on desktop. strip: wide, one tone darker. */
  span?: 'wide' | 'strip';
  pro?: boolean;
  /** Shown above the title. Only for something the visitor will meet again in the app. */
  mark?: ReactNode;
}

const BENEFITS: Benefit[] = [
  {
    id: 'plain-english',
    title: 'Every number, in plain English.',
    body: 'Simple mode turns "EV/EBITDA" into "Company value vs operating profit" and says it in a sentence. Tap the ? for the full explanation.',
    demo: PlainEnglishDemo,
    span: 'wide',
  },
  {
    id: 'health',
    title: 'One grade for how healthy a company is.',
    body: 'Profit, debt, cash, growth and risk, scored out of 100 and graded A to F, so you can compare two companies, or check the ones you own, at a glance.',
    demo: HealthDemo,
  },
  {
    id: 'watchlist',
    title: 'A scorecard for your watchlist.',
    body: 'How your list moved today, its best and worst stock, and how your picks have done since you added them compared with the S&P 500.',
    demo: WatchlistDemo,
  },
  {
    id: 'bull',
    title: 'Your own research assistant.',
    body: `Bull looks up the real numbers before it answers and explains them at your level. Let it see your holdings and it answers about your portfolio too. It can set an alert, add a holding or run the screener for you, and nothing changes until you confirm. Free accounts get ${QUOTAS.chat.count} questions a day.`,
    demo: BullDemo,
    span: 'wide',
    // The Ask Bull launcher (AIPanelToggle) as it sits in the app's corner, so
    // a new account recognises it on the first screen after sign-up.
    mark: <BullAiIcon pose="glass" size={80} />,
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
    body: "A short read before the open: what moved, what's coming and what to watch today.",
    demo: DailyBriefDemo,
    span: 'strip',
    pro: true,
  },
];

export function Benefits({ economy = null, onSignUp }: { economy?: LandingEconomy | null; onSignUp?: () => void }) {
  return (
    <section id="features" className="landing-section">
      <div className="wrap">
        <SectionHeading
          title="Built for people who aren't finance people."
          sub="The free plan covers the essentials. Pro adds a morning brief, “Why Today?” for any stock, and much higher limits."
        />
        <div className="benefits-grid">
          {BENEFITS.map((b) => (
            <article key={b.id} className={b.span ? `benefit-card is-wide${b.span === 'strip' ? ' is-strip' : ''}` : 'benefit-card'}>
              <div className="benefit-copy">
                {b.mark && <span className="benefit-mark" aria-hidden>{b.mark}</span>}
                <h3 className="benefit-title">
                  {b.title}
                  {b.pro && <span className="benefit-pro">Pro</span>}
                </h3>
                <p className="benefit-body">{b.body}</p>
              </div>
              <div className="benefit-demo"><b.demo economy={economy} onSignUp={onSignUp} /></div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
