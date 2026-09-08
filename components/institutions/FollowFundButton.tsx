'use client';

/**
 * Follow toggle for a 13F fund. Following puts the user on the fan-out list
 * when the weekly sync ingests that fund's next filing, which for a 13F is
 * roughly once a quarter — so the button's job is partly to set that
 * expectation, hence the "Following" resting state rather than a bell icon
 * implying something more frequent.
 *
 * Renders nothing for logged-out visitors: there is no account to attach a
 * follow to, and a button that bounces you to a login wall is worse than no
 * button on a page you are still deciding whether to care about.
 */

import { Check, Plus } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useIsFollowingFund, useToggleFundFollow } from '@/hooks/use-institution-follow';
import { cn } from '@/lib/utils';

interface FollowFundButtonProps {
  slug: string;
  displayName: string;
  /**
   * Icon-only, for the Discover cards where a labelled pill would compete
   * with the fund name for the eye. The label still reaches screen readers
   * through aria-label, which carries the fund name either way.
   */
  compact?: boolean;
  className?: string;
}

export function FollowFundButton({ slug, displayName, compact, className }: FollowFundButtonProps) {
  const { isAuthenticated } = useAuth();
  const following = useIsFollowingFund(slug);
  const toggle = useToggleFundFollow(slug);

  if (!isAuthenticated) return null;

  const label = following ? `Stop following ${displayName}` : `Follow ${displayName}`;

  return (
    <button
      type="button"
      onClick={(e) => {
        // On a card this sits on top of a stretched link covering the whole
        // tile, so a follow must not also navigate to the fund.
        e.preventDefault();
        e.stopPropagation();
        toggle.mutate(!following);
      }}
      aria-pressed={following}
      aria-label={label}
      title={label}
      className={cn(
        'relative z-10 inline-flex shrink-0 items-center justify-center border transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        compact ? 'h-7 w-7 rounded-full' : 'gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium',
        following
          ? 'border-border/60 bg-muted/50 text-foreground hover:bg-muted/70'
          : 'border-border/60 bg-transparent text-muted-foreground hover:border-border hover:text-foreground',
        className
      )}
    >
      {following ? (
        <Check className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <Plus className="h-3.5 w-3.5" aria-hidden />
      )}
      {!compact && (following ? 'Following' : 'Follow')}
    </button>
  );
}
