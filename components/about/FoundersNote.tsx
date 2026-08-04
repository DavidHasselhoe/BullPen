import Image from 'next/image';
import { FOUNDERS_NOTE, hasPlaceholders } from '@/content/founders-note';

/**
 * The founder's note on /about.
 *
 * Content lives in content/founders-note.ts; this file only renders it.
 *
 * Visibility rules, in order:
 *   · published: true            → rendered everywhere.
 *   · published: false, dev      → rendered with a "not published" marker, so
 *                                  the note can be written and previewed
 *                                  against the real design.
 *   · published: false, prod     → not rendered at all.
 *
 * The point of the gate is that this section is the one place on the site
 * written in a personal voice. Placeholder prose here would read as a real
 * person's real story, which is precisely the kind of content that must never
 * ship half-finished.
 */
export function FoundersNote() {
  const note = FOUNDERS_NOTE;
  const isDev = process.env.NODE_ENV !== 'production';

  if (!note.published && !isDev) return null;

  const draft = !note.published || hasPlaceholders(note);

  return (
    <section className="founders-note" aria-labelledby="founders-note-heading">
      <div className="founders-note-head">
        <h2 id="founders-note-heading">{note.heading}</h2>
        {draft && (
          <span className="founders-note-draft" title="Visible on localhost only. Set published: true in content/founders-note.ts to publish.">
            Not published
          </span>
        )}
      </div>

      <div className="founders-note-body">
        {note.paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      <div className="founders-note-sign">
        {note.portrait && (
          <Image
            src={note.portrait}
            alt={`${note.signature.name}, ${note.signature.role}`}
            width={44}
            height={44}
            className="founders-note-portrait"
          />
        )}
        <div>
          {/* Instrument Serif italic is the brand's single flourish, reserved
              for marketing headlines. A signature is the one other place it
              genuinely earns its keep: it is a personal mark, not decoration. */}
          <div className="founders-note-name">{note.signature.name}</div>
          <div className="founders-note-role">{note.signature.role}</div>
        </div>
      </div>
    </section>
  );
}
