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

export function FollowFundButton({ slug, displayName }: { slug: string; displayName: string }) {
  const { isAuthenticated } = useAuth();
  const { data: following = false } = useIsFollowingFund(slug);
  const toggle = useToggleFundFollow(slug);

  if (!isAuthenticated) return null;

  return (
    <button
      type="button"
      onClick={() => toggle.mutate(!following)}
      aria-pressed={following}
      aria-label={following ? `Stop following ${displayName}` : `Follow ${displayName}`}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        following
          ? 'border-border/60 bg-muted/50 text-foreground hover:bg-muted/70'
          : 'border-border/60 bg-transparent text-muted-foreground hover:border-border hover:text-foreground'
      )}
    >
      {following ? (
        <Check className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <Plus className="h-3.5 w-3.5" aria-hidden />
      )}
      {following ? 'Following' : 'Follow'}
    </button>
  );
}
