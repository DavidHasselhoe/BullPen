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
  published: false,

  heading: 'A note from the founder',

  paragraphs: [
    '[Introduce yourself. Who you are, and what you were doing before BullPen.]',

    '[The concept. What BullPen is in your own words, and what it is meant to do for the person reading this.]',

    '[Why you started it. The specific frustration, gap, or moment that made building this feel worth doing.]',

    '[Your experience. What you bring to it, and just as usefully, what you were still learning when you began.]',

    '[Where it goes. What you want BullPen to be for people, and what you are working towards next.]',
  ],

  signature: {
    name: '[Your name]',
    role: '[Founder, BullPen]',
  },

  portrait: null,
};

/** True when any field still holds the bracketed placeholder text. */
export function hasPlaceholders(note: FoundersNote): boolean {
  const fields = [...note.paragraphs, note.signature.name, note.signature.role];
  return fields.some((f) => f.trim().startsWith('['));
}
