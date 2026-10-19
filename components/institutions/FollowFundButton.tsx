'use client';

/**
 * Follow toggle for a 13F fund, or a tracked politician on Washington Trading.
 * Following puts the user on the fan-out list for that fund's next filing (a
 * quarter away) or that member's next disclosure, and into their Feed, so the
 * resting state says "Following" and links there rather than a bell implying
 * something more frequent.
 *
 * On a detail page it is the page's main action: solid until followed. Guests
 * see it too, and it opens the sign-up gate, which finishes the follow once
 * they are in (useResumeAction). Until 2026-10-19 it was hidden for them, so
 * the people arriving from search never saw that following exists. The
 * compact icon on Discover's cards still renders nothing for guests: a grid of
 * sign-up prompts would be noise on a page they are still browsing.
 */

import Link from 'next/link';
import { Check, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/use-auth';
import { useIsFollowing, useToggleFollow, type FollowKind } from '@/hooks/use-institution-follow';
import { useResumeAction, useSignupGate } from '@/components/auth/SignupGate';
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
  /** Also used for tracked politicians on Washington Trading. */
  kind?: FollowKind;
}

export function FollowFundButton({ slug, displayName, compact, className, kind = 'institution' }: FollowFundButtonProps) {
  const { t } = useTranslation('discover');
  const { isAuthenticated } = useAuth();
  const openGate = useSignupGate();
  const following = useIsFollowing(kind, slug);
  const toggle = useToggleFollow(kind, slug);

  // A guest who pressed Follow, then signed up, comes back here following.
  useResumeAction(`follow-${kind}`, (value) => {
    if (value !== slug) return false;
    toggle.mutate(true);
    return true;
  });

  if (!isAuthenticated && compact) return null;

  const label = following ? t('followStopAria', { name: displayName }) : t('followAria', { name: displayName });

  return (
    <span className={cn('inline-flex shrink-0 items-center gap-3', className)}>
      {following && !compact && (
        <Link
          href="/social"
          className="hidden py-1.5 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline sm:inline"
        >
          {t('followSeeInFeed')}
        </Link>
      )}
      <button
        type="button"
        onClick={(e) => {
          // On a card this sits on top of a stretched link covering the whole
          // tile, so a follow must not also navigate to the fund.
          e.preventDefault();
          e.stopPropagation();
          if (!isAuthenticated) {
            openGate({
              source: `follow_${kind}`,
              context: t('followSignUpContext', { name: displayName }),
              resume: `follow-${kind}:${slug}`,
            });
            return;
          }
          toggle.mutate(!following);
        }}
        aria-pressed={isAuthenticated ? following : undefined}
        aria-label={label}
        title={label}
        className={cn(
          'relative z-10 inline-flex shrink-0 items-center justify-center border transition-colors active:scale-[0.97]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          compact ? 'h-7 w-7 rounded-full' : 'h-9 gap-1.5 rounded-md px-3.5 text-sm font-medium',
          following
            ? 'border-border/60 bg-muted/50 text-foreground hover:bg-muted/70'
            : compact
              ? 'border-border/60 bg-transparent text-muted-foreground hover:border-border hover:text-foreground'
              : 'border-transparent bg-primary text-primary-foreground hover:bg-primary/90'
        )}
      >
        {following ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}
        {!compact && (following ? t('followFollowing') : t('followFollow'))}
      </button>
    </span>
  );
}
