import { cn } from '@/lib/utils';

export type MascotPose =
  | 'shrug'      // nothing here / empty
  | 'search'     // no results
  | 'thinking'   // AI working / learning
  | 'celebrate'  // success / milestone
  | 'error'      // something went wrong / 404
  | 'locked';    // upgrade to unlock

const POSE_SRC: Record<MascotPose, string> = {
  shrug: '/illustrations/bull-shrug.png',
  search: '/illustrations/bull-search.png',
  thinking: '/illustrations/bull-thinking.png',
  celebrate: '/illustrations/bull-celebrate.png',
  error: '/illustrations/bull-error.png',
  locked: '/illustrations/bull-locked.png',
};

interface EmptyStateProps {
  title: string;
  description?: string;
  /** Which mascot pose to show. Default: 'shrug'. */
  pose?: MascotPose;
  /** Explicit illustration path — overrides `pose`. */
  illustration?: string;
  /** Square illustration size in px. */
  imageSize?: number;
  className?: string;
  /** Actions (buttons, links) rendered below the copy. */
  children?: React.ReactNode;
}

/**
 * Shared empty / not-found / success state with the BullPen mascot.
 *
 * The mascots are transparent-background black line art, inverted in dark mode
 * (black → white) so they read on the dark UI. Add poses in /public/illustrations.
 */
export function EmptyState({
  title,
  description,
  pose = 'shrug',
  illustration,
  imageSize = 176,
  className,
  children,
}: EmptyStateProps) {
  const src = illustration ?? POSE_SRC[pose];
  return (
    <div className={cn('flex flex-col items-center px-4 text-center', className)}>
      {/* Plain <img> (not next/image): a static illustration doesn't need the
          optimizer, and this loads the file directly. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        aria-hidden
        style={{ width: imageSize }}
        className="mb-5 h-auto max-w-[60%] select-none opacity-90 dark:opacity-80 dark:invert"
      />
      <h3 className="text-base font-semibold text-foreground text-balance">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground text-pretty">{description}</p>
      )}
      {children && <div className="mt-6 w-full">{children}</div>}
    </div>
  );
}
