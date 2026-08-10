'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Briefcase, TrendingUp, BarChart2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { tierLabel } from '@/lib/billing/tier';
import type { PublicUser } from '@/app/api/users/search/route';

interface PublicProfileCardProps {
  user: PublicUser;
  className?: string;
}

// Pro gets a warmer, more distinct treatment than the neutral ProBadge used in
// account chrome (components/billing/ProBadge.tsx) — this one does social
// signaling work on a public surface, so it's allowed to stand out more than a
// badge sitting quietly next to your own name in a dropdown. Amber/gold reads
// as "premium" and is DESIGN.md's sanctioned third color for status pills
// (never used for gain/loss, which stays exclusively Signal Emerald/Red).
const TIER_BADGE_CLASS: Record<'Member' | 'Pro', string> = {
  Member: 'bg-muted text-muted-foreground',
  Pro: 'border border-amber-400/30 bg-amber-400/10 text-amber-600 dark:text-amber-400',
};

// Same amber used on the badge above, carried onto the avatar ring so the two
// read as one signal rather than two unrelated colors.
const AVATAR_RING_CLASS: Record<'Member' | 'Pro', string> = {
  Member: 'ring-border group-hover:ring-primary/40',
  Pro: 'ring-amber-400/70 group-hover:ring-amber-400',
};

const EXPERIENCE_LABELS: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

const MARKET_LABELS: Record<string, string> = {
  US: 'US Markets',
  EU: 'European Markets',
  BOTH: 'Global Markets',
};

export function PublicProfileCard({ user, className }: PublicProfileCardProps) {
  const displayName = user.full_name || user.username || 'Anonymous';
  // Prefer username slug; fall back to user ID so profiles without a username are still reachable
  const profileSlug = user.username ? encodeURIComponent(user.username) : user.id;
  const href = profileSlug ? `/users/${profileSlug}` : '#';
  const tierLabelValue = tierLabel(user.account_tier);
  const tier = tierLabelValue ? { label: tierLabelValue, className: TIER_BADGE_CLASS[tierLabelValue] } : null;
  const ringClass = AVATAR_RING_CLASS[tierLabelValue ?? 'Member'];
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <Link
      href={href}
      className={cn(
        'group flex flex-col gap-3 rounded-xl border border-border bg-card p-4',
        'hover:border-primary/40 hover:shadow-md transition-all duration-200',
        className
      )}
    >
      {/* Header: avatar + name + tier */}
      <div className="flex items-start gap-3">
        <div className="shrink-0">
          {user.avatar_url ? (
            <Image
              src={user.avatar_url}
              alt={displayName}
              width={44}
              height={44}
              className={cn('rounded-full object-cover ring-2 transition-all', ringClass)}
            />
          ) : (
            <div className={cn('h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center ring-2 transition-all', ringClass)}>
              <span className="text-sm font-semibold text-primary">{initials}</span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
            {displayName}
          </p>
          {user.username && (
            <p className="text-xs text-muted-foreground truncate">@{user.username}</p>
          )}
          {tier && (
            <span className={cn('inline-block mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full', tier.className)}>
              {tier.label}
            </span>
          )}
        </div>
      </div>

      {/* Bio */}
      {user.bio && (
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{user.bio}</p>
      )}

      {/* Meta badges */}
      <div className="flex flex-wrap gap-1.5 mt-auto">
        {user.experience_level && (
          <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            <BarChart2 className="h-2.5 w-2.5" />
            {EXPERIENCE_LABELS[user.experience_level]}
          </span>
        )}
        {user.market_focus && (
          <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            <TrendingUp className="h-2.5 w-2.5" />
            {MARKET_LABELS[user.market_focus]}
          </span>
        )}
        {(user.holdings_count ?? 0) > 0 && (
          <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            <Briefcase className="h-2.5 w-2.5" />
            {user.holdings_count} stock{user.holdings_count === 1 ? '' : 's'}
          </span>
        )}
      </div>
    </Link>
  );
}
