/**
 * The founder's note shown on /about.
 *
 * This is the one place on the site that speaks in a personal voice, so the
 * words need to be yours. Nothing here is written for you: the paragraphs below
 * are prompts describing what to cover, not draft copy to lightly edit.
 *
 * ── How to publish ──────────────────────────────────────────────────────────
 * 1. Replace every string in `paragraphs` with your own writing.
 * 2. Fill in `signature`.
 * 3. Set `published: true`.
 *
 * Until step 3, the section renders only on localhost, with a visible
 * "not published" marker, so an unfinished draft can't reach bullpen.no by
 * accident. On production it is simply absent.
 */

export interface FoundersNote {
  /** Set true when the note is written and ready to be public. */
  published: boolean;
  heading: string;
  /** One string per paragraph. Add or remove freely. */
  paragraphs: string[];
  signature: {
    name: string;
    /** Shown under the name. Keep it short. */
    role: string;
  };
  /**
   * Optional portrait or mark, e.g. '/illustrations/founder.png'.
   * Leave null and no image slot is rendered. When you have the bull mascot
   * illustrations, this is where one would go.
   */
  portrait: string | null;
}

export const FOUNDERS_NOTE: FoundersNote = {
  published: true,

  heading: 'A note from the founder',

  // David's own words. The casual register is deliberate and load-bearing:
  // this is the one place on the site that sounds like a person rather than
  // a company, so resist smoothing it into marketing prose. No em dashes,
  // per the site-wide rule against them in user-facing copy (CLAUDE.md); the
  // clauses they'd normally join are recast with a comma or a colon instead.
  paragraphs: [
    'Hello! I’m David, founder and developer of BullPen.',

    'When I started investing, I bought my first shares in a company I knew absolutely nothing about, just because the name looked promising. I lost a significant chunk of money on that single mistake, and it felt like investing wasn’t for me.',

    'But I kept going. Over the next five years, I learned from YouTube videos, courses, forums, and a lot of trial and error. The frustrating part? I had to piece it together from five different places: learning here, tracking there, researching somewhere else entirely. It was fragmented and exhausting.',

    'That’s why I built BullPen. For the past three years as a systems developer, I’ve been obsessed with building tools that actually work for real people. And now I’m combining everything I learned as an investor into one platform where you can learn the fundamentals, research companies properly, and track your portfolio, without the clutter or confusion.',

    'The first version launched in November 2025. Since then, I’ve been rebuilding it based on what users actually need. Because here’s the thing: investing doesn’t have to be complicated. You just need the right tools and the right knowledge to start.',
  ],

  signature: {
    name: 'David',
    role: 'Founder and developer, BullPen',
  },

  portrait: null,
};

/** True when any field still holds the bracketed placeholder text. */
export function hasPlaceholders(note: FoundersNote): boolean {
  const fields = [...note.paragraphs, note.signature.name, note.signature.role];
  return fields.some((f) => f.trim().startsWith('['));
}
