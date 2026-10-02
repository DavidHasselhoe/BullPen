import { POSE_SRC, type MascotPose } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';

interface PageMascotProps {
  /** Which mascot pose to show. */
  pose: MascotPose;
  /** Square illustration size in px. Small and quiet by design — this sits
   *  beside a page heading, not centered as a hero the way EmptyState is. */
  size?: number;
  className?: string;
}

/**
 * A small, quiet mascot touch for the marketing-register info pages (/help,
 * /about, /changelog, etc.) that otherwise render as plain text with zero
 * illustration. Deliberately NOT used on pure legal/compliance documents
 * (/privacy, /terms, /accessibility, /cookies, /disclosures) — those are
 * third-party-generated or liability-sensitive boilerplate where a cartoon
 * mascot would undercut the seriousness the content needs, not add polish.
 *
 * Black line art, shown as is: these pages sit on the light landing theme
 * (`.landing-light-preview`) whatever the visitor's app theme, so neither an
 * unconditional nor a `dark:` invert is right here.
 */
export function PageMascot({ pose, size = 44, className }: PageMascotProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={POSE_SRC[pose]}
      alt=""
      aria-hidden
      style={{ width: size, height: size }}
      className={cn('opacity-90', className)}
    />
  );
}
