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

  // David's own words. Edits made when this was pasted in were limited to
  // capitalising "i", splitting one block into paragraphs, curly quotes and
  // apostrophes, and one subject added for agreement ("and I have kept
  // iterating"). Phrasing, rhythm and word choice are untouched, including the
  // casual register ("just cause", "you guys") — that is the point of the
  // section. Anyone editing later should hold the same line.
  paragraphs: [
    'Hello! My name is David and I am the founder and developer working on BullPen.',

    'When I first started investing, I didn’t really have a clue what I was doing. I bought my first shares in a company I knew nothing about, just cause it “looked good”, but there was no conviction or reasoning whatsoever. I lost a lot of money from this and felt like investing wasn’t for me.',

    'I still kept going and after investing for many years I learned a lot on my own by using several methods; videos, courses, forums and asking tons of questions.',

    'So now I am creating the very platform I wish I had when I was just getting into investing, a platform where I can not only learn, but research and track companies. Combining my 3 years as a systems developer, years of investing and knowledge into one single platform for you guys to utilize when picking your next stock.',

    'The platform is fairly new, started in November 2025 with the first version, and I have kept iterating to improve it since. The goal is to make a genuinely useful platform where the average person can learn how to invest, because it doesn’t have to be that hard!',
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
