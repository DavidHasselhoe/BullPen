'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/**
 * Text that may be clamped to a few lines, but never silently cut off.
 *
 * The rule this exists to enforce: model-written prose is never truncated
 * without a way to read the rest. A sentence ending in "…" with no affordance
 * is the app telling someone there is more and refusing to show it, and in
 * generated content the cut-off half is often the part carrying the number or
 * the caveat. See CLAUDE.md, "Never cut off generated text".
 *
 * Whether the text actually overflows is **measured**, not guessed from string
 * length: the toggle appears only when the rendered element really is clamped.
 * A character-count heuristic gets this wrong in both directions, because it
 * cannot know the column width the text landed in. (The version of this logic
 * in deep-dive's BulletItem learned that from a 120-char cutoff that missed
 * bullets wrapping past two lines in a ~90-char column.)
 *
 * For a short label that genuinely cannot wrap, such as a ticker in a dense
 * table row, plain `truncate` with a `title` attribute is still the right
 * thing. This is for sentences.
 */
export function ClampedText({
  children,
  lines = 2,
  className,
  toggleClassName,
}: {
  children: ReactNode;
  /** Lines to show before clamping. */
  lines?: 2 | 3 | 4;
  className?: string;
  toggleClassName?: string;
}) {
  const { t } = useTranslation('common');
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const textRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = textRef.current;
    if (!el || expanded) return;
    // Re-measured on resize: the same text clamps at one column width and not
    // at another, so a single check on mount goes stale the moment the layout
    // reflows (sidebar opens, phone rotates, grid drops to one column).
    const check = () => setClamped(el.scrollHeight > el.clientHeight + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded]);

  // Tailwind needs whole class names present in the source to emit them, so
  // these cannot be built as `line-clamp-${lines}`.
  const clampClass = lines === 4 ? 'line-clamp-4' : lines === 3 ? 'line-clamp-3' : 'line-clamp-2';

  return (
    <span className={cn('block min-w-0', className)}>
      <span ref={textRef} className={cn('block', !expanded && clampClass)}>
        {children}
      </span>
      {(clamped || expanded) && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            // text-xs is DESIGN.md's Label step; the callers this replaces used
            // an undocumented 11px, so the shared version moves onto the ramp.
            'mt-0.5 block text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline',
            toggleClassName,
          )}
        >
          {expanded ? t('showLess') : t('showMore')}
        </button>
      )}
    </span>
  );
}
