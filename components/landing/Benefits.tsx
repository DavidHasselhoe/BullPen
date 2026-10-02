'use client';

import Image from 'next/image';
import type { CSSProperties } from 'react';
import { Reveal, SectionHeading } from './Atoms';

/**
 * What a beginner gets, free first, as a bento of real light-mode captures.
 *
 * Replaces Features.tsx, whose four rows were all Pro-only and shown as dark
 * captures on this light page: a free visitor never saw the plain-language
 * labels, the health grade or the Academy that are the actual beginner path.
 * Each capture is cropped to one moment and peeks in from the card's corner,
 * so it reads at a glance instead of as a shrunken screen. See
 * public/screenshots/README.md for how they are taken.
 */

interface Benefit {
  title: string;
  body: string;
  file: string;
  width: number;
  height: number;
  alt: string;
  pro?: boolean;
  /** Displayed width in px, when not the default 860. */
  shotWidth?: number;
  /** Negative px to pull centred content to the card's left edge. */
  shotShift?: number;
}

const BENEFITS: Benefit[] = [
  {
    title: 'Every number, in plain English.',
    body: 'Beginner mode turns "EV/EBITDA" into "Company value vs operating profit" and adds a line on what it means. Tap any label for more.',
    file: 'bento-plain-english.png', width: 1024, height: 530,
    alt: "NVIDIA's key numbers in beginner mode: price range this year, company size, annual dividend and company value vs operating profit, each with a plain-English line",
  },
  {
    title: 'One grade for how healthy a company is.',
    body: 'Profit, debt, cash, growth and risk, scored out of 100 and graded A to F, so two companies compare at a glance.',
    file: 'bento-health.png', width: 1024, height: 346,
    alt: "NVIDIA's financial health: 89 out of 100, grade A, with five categories such as how well it makes money and how bumpy the ride is",
  },
  {
    title: 'See what moved your money today.',
    body: "Add what you own by hand or from a spreadsheet. Home shows today's change, your biggest movers and the reason behind the biggest one.",
    file: 'bento-portfolio.png', width: 1088, height: 462, shotWidth: 940, shotShift: -380,
    alt: "A portfolio on BullPen's Home: today's value and chart, and the biggest moves with a one-line reason for Reddit's rise",
  },
  {
    title: 'Learn the basics as you go.',
    body: 'Short lessons and one question a day, starting from "What is a stock?". Free, with a streak to keep you coming back.',
    file: 'tour-academy.png', width: 1280, height: 736, shotWidth: 1075, shotShift: -265,
    alt: "BullPen Academy's daily challenge, asking the difference between owning a stock and owning a bond",
  },
  {
    title: 'Know why a stock moved.',
    body: "BullPen reads the day's news and filings and tells you why in a sentence or two. Free for your biggest mover each day, any stock with Pro.",
    file: 'bento-why.png', width: 568, height: 307, shotWidth: 540,
    alt: "Reddit up 4.98% today, explained: no company news, shares bounced off a support level they have held since July",
  },
  {
    title: 'Your market in a minute, every morning.',
    body: "A short read before the open: what moved, what's coming and what it means for the stocks you follow.",
    file: 'bento-brief.png', width: 568, height: 231, shotWidth: 540,
    alt: "A Daily Brief headline and summary about the jobs report, chip stocks and market volatility",
    pro: true,
  },
];

export function Benefits() {
  return (
    <section id="features" style={{ position: 'relative', padding: '120px 0' }}>
      <div className="wrap">
        <SectionHeading
          title="Built for people who aren't finance people."
          sub="The free plan covers the essentials. Pro adds a morning brief and an answer for any stock, any day."
        />
        <div className="benefits-grid">
          {BENEFITS.map((b, i) => (
            <Reveal key={b.file} delay={i % 2} style={{ display: 'flex' }}>
              <article className="benefit-card">
                <div className="benefit-copy">
                  <h3 className="benefit-title">
                    {b.title}
                    {b.pro && <span className="benefit-pro">Pro</span>}
                  </h3>
                  <p className="benefit-body">{b.body}</p>
                </div>
                <div
                  className="benefit-shot"
                  style={{ '--shot-width': b.shotWidth ? `${b.shotWidth}px` : undefined, '--shot-shift': b.shotShift ? `${b.shotShift}px` : undefined } as CSSProperties}
                >
                  <Image src={`/screenshots/${b.file}`} alt={b.alt} width={b.width} height={b.height} sizes="(max-width: 900px) 92vw, 1075px" />
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
