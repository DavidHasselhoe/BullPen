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

  // David's own words, lightly edited. The casual register is deliberate and
  // load-bearing ("just cause", "you guys", "tons of questions"): this is the
  // one place on the site that sounds like a person rather than a company, so
  // resist smoothing it into marketing prose.
  //
  // Paragraph 2 is the strongest thing here and should be left alone. Opening
  // on a mistake rather than on credentials is what makes the note land.
  //
  // Edits applied: capitalised "i"; split one block into paragraphs; curly
  // quotes; semicolon to colon in the list; "where I can" to "where you can"
  // (the original accidentally described the product as being for its author);
  // "Combining my 3 years..." given a subject, since it was a fragment;
  // "utilize" to "use", the one word that broke the register; and "platform"
  // reduced from five uses to one.
  paragraphs: [
    'Hello! My name is David and I am the founder and developer working on BullPen.',

    'When I first started investing, I didn’t really have a clue what I was doing. I bought my first shares in a company I knew nothing about, just cause it “looked good”, but there was no conviction or reasoning whatsoever. I lost a lot of money from this and felt like investing wasn’t for me.',

    'I still kept going, and after investing for many years I learned a lot on my own: videos, courses, forums, and asking tons of questions.',

    'So now I am creating the very platform I wish I had when I was just getting into investing, somewhere you can not only learn, but research and track companies. I am combining my 3 years as a systems developer with years of investing into one place for you guys to use when picking your next stock.',

    'It is still fairly new. The first version went out in November 2025 and I have been improving it ever since. The goal is to make something genuinely useful, where the average person can learn how to invest, because it doesn’t have to be that hard!',
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
