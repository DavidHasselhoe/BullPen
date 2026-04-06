'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { PublicHoldingsList } from '@/components/user/PublicHoldingsList';
import { FollowButton } from '@/components/user/FollowButton';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  User,
  Briefcase,
  TrendingUp,
  BarChart2,
  Shield,
  Calendar,
  Globe,
  ChevronLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PublicUser } from '@/app/api/users/search/route';

interface ProfileResponse {
  success: boolean;
  profile?: PublicUser;
  holdings?: Array<{ symbol: string; company_name: string }>;
  error?: string;
}

const TIER_LABELS: Record<number, { label: string; className: string }> = {
  1: { label: 'Member', className: 'bg-muted text-muted-foreground border-0' },
  2: { label: 'Pro', className: 'bg-primary/10 text-primary border-primary/20' },
  3: { label: 'Enterprise', className: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20' },
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

const RISK_LABELS: Record<string, string> = {
  conservative: 'Conservative',
  balanced: 'Balanced',
  moderate: 'Balanced',
  aggressive: 'Aggressive',
};

function formatMemberSince(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function ProfileSkeleton() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
      <Skeleton className="h-4 w-24" />
      <div className="flex items-start gap-4">
        <Skeleton className="h-20 w-20 rounded-full" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
      <Skeleton className="h-20 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}

export default function UserProfilePage() {
  const params = useParams();
  const username = params.username as string;
  const [state, setState] = useState<{
    status: 'loading' | 'ok' | 'error';
    profile?: PublicUser;
    holdings?: Array<{ symbol: string; company_name: string }>;
    error?: string;
  }>({ status: 'loading' });

  useEffect(() => {
    if (!username) return;
    let cancelled = false;

    (async () => {
      try {
        // useParams() returns the decoded value; pass it directly without re-encoding.
        // encodeURIComponent here would double-encode special chars (%20 → %2520).
        const res = await fetch(`/api/users/${username}`);
        const data: ProfileResponse = await res.json();
        if (cancelled) return;
        if (!data.success || !data.profile) {
          setState({ status: 'error', error: data.error ?? 'User not found' });
        } else {
          setState({ status: 'ok', profile: data.profile, holdings: data.holdings ?? [] });
        }
      } catch {
        if (!cancelled) setState({ status: 'error', error: 'Failed to load profile' });
      }
    })();

    return () => { cancelled = true; };
  }, [username]);

  if (state.status === 'loading') return <ProfileSkeleton />;

  if (state.status === 'error') {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center space-y-3">
        <User className="h-12 w-12 text-muted-foreground/40 mx-auto" />
        <p className="text-base font-medium text-foreground">{state.error}</p>
        <Link href="/users" className="text-sm text-primary underline">
          Back to member search
        </Link>
      </div>
    );
  }

  const { profile, holdings } = state;
  if (!profile) return null;

  const displayName = profile.full_name || profile.username || 'Anonymous';
  const initials = displayName.slice(0, 2).toUpperCase();
  const tier = profile.account_tier ? TIER_LABELS[profile.account_tier] : null;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">

        {/* Back */}
        <Link
          href="/users"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Members
        </Link>

        {/* Profile header */}
        <div className="flex items-start gap-5">
          {profile.avatar_url ? (
            <Image
              src={profile.avatar_url}
              alt={displayName}
              width={80}
              height={80}
              className="rounded-full object-cover ring-2 ring-border shrink-0"
            />
          ) : (
            <div className="h-20 w-20 rounded-full bg-primary/10 ring-2 ring-border flex items-center justify-center shrink-0">
              <span className="text-xl font-bold text-primary">{initials}</span>
            </div>
          )}

          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">{displayName}</h1>
              {tier && (
                <Badge variant="outline" className={cn('text-[10px] font-medium', tier.className)}>
                  {tier.label}
                </Badge>
              )}
            </div>
            {profile.username && (
              <p className="text-sm text-muted-foreground">@{profile.username}</p>
            )}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              <span>Member since {formatMemberSince(profile.created_at)}</span>
            </div>
          </div>

          {/* Follow button — shown to other authenticated users */}
          <FollowButton
            username={profile.username ?? ''}
            targetUserId={profile.id}
            className="shrink-0"
          />
        </div>

        {/* Bio */}
        {profile.bio && (
          <div className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-sm text-foreground leading-relaxed">{profile.bio}</p>
          </div>
        )}

        {/* About */}
        {(profile.experience_level || profile.market_focus || profile.risk_profile) && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <h2 className="text-sm font-semibold text-foreground">About</h2>
            <dl className="space-y-2">
              {profile.experience_level && (
                <div className="flex items-center gap-2 text-sm">
                  <dt className="flex items-center gap-1.5 text-muted-foreground min-w-[130px]">
                    <BarChart2 className="h-3.5 w-3.5" /> Experience
                  </dt>
                  <dd className="text-foreground font-medium">
                    {EXPERIENCE_LABELS[profile.experience_level]}
                  </dd>
                </div>
              )}
              {profile.market_focus && (
                <div className="flex items-center gap-2 text-sm">
                  <dt className="flex items-center gap-1.5 text-muted-foreground min-w-[130px]">
                    <Globe className="h-3.5 w-3.5" /> Market Focus
                  </dt>
                  <dd className="text-foreground font-medium">
                    {MARKET_LABELS[profile.market_focus]}
                  </dd>
                </div>
              )}
              {profile.risk_profile && (
                <div className="flex items-center gap-2 text-sm">
                  <dt className="flex items-center gap-1.5 text-muted-foreground min-w-[130px]">
                    <Shield className="h-3.5 w-3.5" /> Risk Profile
                  </dt>
                  <dd className="text-foreground font-medium">
                    {RISK_LABELS[profile.risk_profile] ?? profile.risk_profile}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {/* Portfolio */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">
              Portfolio
              {(holdings?.length ?? 0) > 0 && (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  · {holdings!.length} stock{holdings!.length === 1 ? '' : 's'}
                </span>
              )}
            </h2>
          </div>
          <PublicHoldingsList holdings={holdings ?? []} />
        </div>
      </div>
    </div>
  );
}
