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
 * Inverts unconditionally rather than via `dark:invert` — `.bullpen-landing-root`
 * forces its own always-dark appearance independent of the visitor's app-level
 * theme class, so a `dark:` variant would silently fail to invert (rendering
 * invisible black-on-black art) for anyone whose `<html>` isn't also `.dark`.
 */
export function PageMascot({ pose, size = 44, className }: PageMascotProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={POSE_SRC[pose]}
      alt=""
      aria-hidden
      style={{ width: size, height: size }}
      className={cn('invert opacity-90', className)}
    />
  );
}
