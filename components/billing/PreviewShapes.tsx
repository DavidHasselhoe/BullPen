'use client';

import { useTranslation } from 'react-i18next';

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

/**
 * The card a signed-out page shows above its AuthGate copy: the page's real
 * layout as shapes, faded at the foot, with a PREVIEW pill. Hidden from
 * screen readers, the gate's title and description say what it is.
 */
export function PreviewCard({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation('billing');
  return (
    <div className="relative select-none overflow-hidden rounded-2xl border border-border bg-card p-5 text-left" aria-hidden="true">
      <div className="pointer-events-none opacity-80">{children}</div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card to-transparent" />
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border/70 bg-background/90 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground shadow-sm">
        {t('previewBadge')}
      </span>
    </div>
  );
}

/** A list row: logo square, a name bar `width` of the row, a value bar on the right. */
export function PreviewRow({ width }: { width: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-6 w-6 shrink-0 rounded-md bg-muted-foreground/20" />
      <div className="h-2.5 rounded-full bg-muted-foreground/20" style={{ width: `${width * 100}%` }} />
      <div className="ml-auto h-2.5 w-14 rounded-full bg-muted-foreground/20" />
    </div>
  );
}
