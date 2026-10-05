/**
 * Placeholder shapes for paywall previews: the outline of the paid result,
 * with no numbers, verdicts or reasons in it.
 *
 * The previews used to blur a made-up result (a "84/100 Strong fundamentals"
 * Deep Dive, a "72/100 High Risk" portfolio, NVDA's rally reasons under any
 * stock) beside the real company or portfolio the reader was looking at.
 * Blur hid the small text but not the big numbers or the red and green, so
 * it read as BullPen's verdict on something real. Shapes show what kind of
 * answer is coming without stating one.
 */

/** Lines of text-height bars. Widths are fractions of the row, for a ragged edge. */
export function PreviewLines({ widths, className = '' }: { widths: number[]; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden>
      {widths.map((w, i) => (
        <div key={i} className="h-2.5 rounded-full bg-muted-foreground/20" style={{ width: `${w * 100}%` }} />
      ))}
    </div>
  );
}

/** A labelled row whose value is withheld: the label, an empty track, a blank where the number goes. */
export function PreviewMetricRow({ label }: { label: string }) {
  return (
    <div aria-hidden>
      <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span className="h-2.5 w-8 rounded-full bg-muted-foreground/20" />
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted" />
    </div>
  );
}
