'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Briefcase, TrendingUp, BarChart2, MessageSquareText, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FollowButton } from '@/components/user/FollowButton';
import type { PublicUser } from '@/app/api/users/search/route';

interface PublicProfileCardProps {
  user: PublicUser;
  className?: string;
}

function getExperienceLabels(t: TFunction): Record<string, string> {
  return {
    beginner: t('publicProfileExperienceBeginner'),
    intermediate: t('publicProfileExperienceIntermediate'),
    advanced: t('publicProfileExperienceAdvanced'),
  };
}

function getMarketLabels(t: TFunction): Record<string, string> {
  return {
    US: t('publicProfileMarketUs'),
    EU: t('publicProfileMarketEu'),
    BOTH: t('publicProfileMarketGlobal'),
  };
}

const CHIP = 'flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground';

/**
 * One member on Browse Members. Leads with what they do here (theses written,
 * followers) because that is the reason to open a profile. No Member/Pro
 * badge: on 19 of 20 cards it said nothing, and on the 20th it told strangers
 * who pays.
 *
 * The whole card opens the profile through a stretched link, so the Follow
 * button can sit on it without being a button inside a link.
 */
export function PublicProfileCard({ user, className }: PublicProfileCardProps) {
  const { t } = useTranslation('user');
  const displayName = user.full_name || user.username || t('publicProfileAnonymous');
  // Prefer username slug; fall back to user ID so profiles without a username are still reachable
  const profileSlug = user.username ? encodeURIComponent(user.username) : user.id;
  const href = profileSlug ? `/users/${profileSlug}` : '#';
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div
      className={cn(
        'group relative flex flex-col gap-3 rounded-xl border border-border bg-card p-4',
        'hover:border-primary/40 hover:shadow-md transition-all duration-200',
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0">
          {user.avatar_url ? (
            <Image
              src={user.avatar_url}
              alt=""
              width={44}
              height={44}
              className="rounded-full object-cover ring-2 ring-border transition-all group-hover:ring-primary/40"
            />
          ) : (
            <div className="h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center ring-2 ring-border transition-all group-hover:ring-primary/40">
              <span className="text-sm font-semibold text-primary">{initials}</span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          {/* clamp-ok: a person's name in a card header */}
          <Link
            href={href}
            className="block truncate text-sm font-semibold text-foreground transition-colors group-hover:text-primary after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            {displayName}
          </Link>
          {user.username && (
            // clamp-ok: a handle in a card header
            <p className="text-xs text-muted-foreground truncate">@{user.username}</p>
          )}
        </div>
        <FollowButton profileSlug={profileSlug} targetUserId={user.id} compact className="relative z-10 shrink-0" />
      </div>

      {user.bio && (
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{user.bio}</p>
      )}

      <div className="flex flex-wrap gap-1.5 mt-auto">
        {(user.thesis_count ?? 0) > 0 && (
          <span className={CHIP}>
            <MessageSquareText className="h-2.5 w-2.5" aria-hidden />
            {t('publicProfileThesisCount', { count: user.thesis_count ?? 0 })}
          </span>
        )}
        {(user.follower_count ?? 0) > 0 && (
          <span className={CHIP}>
            <Users className="h-2.5 w-2.5" aria-hidden />
            {t('publicProfileFollowerCount', { count: user.follower_count ?? 0 })}
          </span>
        )}
        {user.experience_level && (
          <span className={CHIP}>
            <BarChart2 className="h-2.5 w-2.5" aria-hidden />
            {getExperienceLabels(t)[user.experience_level]}
          </span>
        )}
        {user.market_focus && (
          <span className={CHIP}>
            <TrendingUp className="h-2.5 w-2.5" aria-hidden />
            {getMarketLabels(t)[user.market_focus]}
          </span>
        )}
        {(user.holdings_count ?? 0) > 0 && (
          <span className={CHIP}>
            <Briefcase className="h-2.5 w-2.5" aria-hidden />
            {t('publicProfileStockCount', { count: user.holdings_count ?? 0 })}
          </span>
        )}
      </div>
    </div>
  );
}
