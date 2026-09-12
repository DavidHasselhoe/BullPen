'use client';

import Image from 'next/image';
import type { ReactNode } from 'react';
import { Reveal, SectionHeading } from './Atoms';

/**
 * The four features worth a full screenshot, each shown as the real screen.
 *
 * This section used to draw its own miniature recreations of the app in SVG and
 * HTML: a scripted chat thread, an invented $42,891 portfolio, a screener with
 * made-up rows. They cost real effort to keep in sync, drifted the moment the
 * product changed, and showed prospective users a screen that does not exist.
 * One of them (the screener) had an "Example" tag sitting directly on top of
 * NVDA's market cap, so the demo it was labelling was half-covered by its own
 * label. All of that is gone; these are captures of the running app.
 *
 * Captures live in /public/screenshots and are committed alongside this file,
 * so unlike the Peek gallery there is no runtime existence check here — if an
 * image is referenced below, it is in the repo. See that folder's README for
 * how they are taken and what to check before committing a new one.
 *
 * Feature-specific shots only. The whole-app tour (dashboard, stock page,
 * screener, holdings, Discover) belongs to Peek, and no capture is used in
 * both places.
 */

interface Feature {
  id: string;
  title: ReactNode;
  desc: string;
  /** File under /public/screenshots. */
  file: string;
  alt: string;
  pro?: boolean;
}

const FEATURES: Feature[] = [
  {
    id: 'why-today',
    title: 'Ask why any stock moved. Get an answer with sources.',
    desc: 'One click on any stock page. BullPen reads the day’s price action, news, analyst notes and recent filings, then tells you what actually moved it, in plain English, with every claim traceable.',
    file: 'why-today.png',
    alt: 'A BullPen stock page with the Why Today panel open, explaining AMD’s 2.37% gain in three sourced bullet points',
    pro: true,
  },
  {
    id: 'daily-brief',
    title: 'Your market summary, every morning at 6:30.',
    desc: 'What moved overnight, which of your holdings report today, and the one macro event worth knowing about before the open. Written fresh each morning by Claude, not assembled from headlines.',
    file: 'daily-brief.png',
    alt: 'The BullPen Daily Brief, showing a TL;DR of the session and a breakdown of the day ahead',
    pro: true,
  },
  {
    id: 'ask-bull',
    title: 'A research analyst that already knows your portfolio.',
    desc: 'Ask Bull anything about a company and it pulls live financials, health scores and earnings history into the answer. It can also add a holding or set a price alert without you leaving the chat.',
    file: 'ai-chat.png',
    alt: 'The Ask Bull chat answering a question about NVIDIA with a financial health breakdown and earnings history',
  },
  {
    id: 'institutions',
    title: 'See what Buffett, Dalio and Ackman actually own.',
    desc: 'Every quarter’s 13F filings from 15 of the funds worth watching, parsed from SEC EDGAR and turned into readable positions. Follow a fund and hear about it when the next filing lands.',
    file: 'institutions.png',
    alt: 'BullPen’s institutional holdings directory, listing funds run by Warren Buffett, Ray Dalio, Bill Ackman and others',
    pro: true,
  },
];

function ProTag() {
  return (
    <span
      style={{
        marginLeft: 10,
        padding: '2px 7px',
        borderRadius: 99,
        background: 'var(--accent-soft)',
        color: 'var(--accent)',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        verticalAlign: 'middle',
        whiteSpace: 'nowrap',
      }}
    >
      Pro
    </span>
  );
}

/**
 * Frames a capture so it reads as a screen rather than a floating rectangle.
 *
 * Deliberately lighter than Peek's full browser chrome (traffic lights + URL
 * bar): that device is the app-tour section's signature, and repeating it four
 * more times here would spend it. A hairline, a radius and one real shadow are
 * enough at this size.
 */
function Shot({ file, alt, priority }: { file: string; alt: string; priority: boolean }) {
  return (
    <div
      style={{
        borderRadius: 14,
        overflow: 'hidden',
        border: '1px solid var(--border-strong)',
        background: 'var(--bg-2)',
        boxShadow: '0 24px 60px -28px oklch(0 0 0 / 0.45)',
        lineHeight: 0,
      }}
    >
      <Image
        src={`/screenshots/${file}`}
        alt={alt}
        width={1600}
        height={1000}
        priority={priority}
        sizes="(max-width: 900px) 100vw, 640px"
        style={{ width: '100%', height: 'auto', display: 'block' }}
      />
    </div>
  );
}

export function Features() {
  return (
    <section id="features" style={{ padding: '104px 0 96px', position: 'relative' }}>
      <div className="wrap">
        <SectionHeading
          title={
            <>
              Two ways to always{' '}
              <span className="accent-serif" style={{ color: 'var(--accent)' }}>
                know why.
              </span>
            </>
          }
          sub="Ask any stock why it moved, or let a Daily Brief tell you before you ask. Everything else is here to help once you're in."
        />

        <div className="feat-rows">
          {FEATURES.map((f, i) => (
            <Reveal key={f.id} delay={1}>
              {/* `data-flip` alternates which side the capture sits on. The
                  rows collapse to a single column under 900px, where the image
                  always leads regardless of flip (see landing-styles.css). */}
              <div className="feat-row" data-flip={i % 2 === 1 ? 'true' : undefined}>
                <div className="feat-row-copy">
                  <h3
                    style={{
                      margin: '0 0 12px',
                      fontSize: 26,
                      fontWeight: 700,
                      letterSpacing: '-0.025em',
                      lineHeight: 1.15,
                      color: 'var(--fg)',
                      textWrap: 'balance',
                    }}
                  >
                    {f.title}
                    {f.pro && <ProTag />}
                  </h3>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 15,
                      lineHeight: 1.6,
                      color: 'var(--fg-muted)',
                      textWrap: 'pretty',
                      maxWidth: '46ch',
                    }}
                  >
                    {f.desc}
                  </p>
                </div>
                <div className="feat-row-shot">
                  {/* Only the first capture is eager: it is the one most likely
                      to be in view shortly after the hero, and priority on all
                      four would fight the hero's own images for bandwidth. */}
                  <Shot file={f.file} alt={f.alt} priority={i === 0} />
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
