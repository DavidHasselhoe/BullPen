'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/hooks/use-auth';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Trophy, Briefcase, Lock, GraduationCap, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LeaderboardEntry } from '@/app/api/social/leaderboard/route';

type Mode = 'holdings' | 'xp';

const TIER_LABELS: Record<number, { label: string; className: string }> = {
  1: { label: 'Member', className: 'bg-muted text-muted-foreground' },
  2: { label: 'Pro', className: 'bg-primary/10 text-primary' },
  3: { label: 'Enterprise', className: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400' },
};

const RANK_STYLES = [
  'text-yellow-500 font-bold text-lg',  // #1
  'text-slate-400 font-bold text-base', // #2
  'text-amber-600 font-bold text-base', // #3
];

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    return <span className={cn('w-8 text-center tabular-nums', RANK_STYLES[rank - 1])}>{rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}</span>;
  }
  return <span className="w-8 text-center text-sm font-medium text-muted-foreground tabular-nums">{rank}</span>;
}

export default function LeaderboardPage() {
  const { isAuthenticated } = useAuth();
  const [mode, setMode] = useState<Mode>('holdings');

  const { data, isLoading } = useQuery({
    queryKey: ['leaderboard', mode],
    queryFn: async (): Promise<LeaderboardEntry[]> => {
      const res = await fetch(`/api/social/leaderboard?mode=${mode}`);
      if (!res.ok) return [];
      const d = await res.json();
      return d.leaderboard ?? [];
    },
    enabled: isAuthenticated,
    staleTime: 2 * 60_000,
    // Refresh rankings when user tabs back — leaderboard changes as others add holdings
    refetchOnWindowFocus: 'always',
  });

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-sm w-full mx-4">
          <CardContent className="pt-8 pb-8 text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <p className="font-semibold text-foreground">Sign in to view the leaderboard</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Trophy className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Leaderboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {mode === 'holdings'
                ? 'Top members by portfolio diversity. Only public profiles are shown.'
                : 'Top learners by Academy XP. Only public profiles are shown.'}
            </p>
          </div>
        </div>

        {/* Mode toggle */}
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          {([
            { id: 'holdings' as const, label: 'Portfolio', icon: Briefcase },
            { id: 'xp' as const, label: 'Academy XP', icon: GraduationCap },
          ]).map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setMode(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  mode === tab.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {isLoading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3">
                  <Skeleton className="h-4 w-6" />
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ) : (data?.length ?? 0) === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
              <Trophy className="h-10 w-10 opacity-30" />
              <p className="text-sm">{mode === 'holdings' ? 'No public portfolios yet.' : 'No Academy XP earned yet. Be the first!'}</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {data!.map((entry) => {
                const displayName = entry.full_name || entry.username || 'Anonymous';
                const initials = displayName.slice(0, 2).toUpperCase();
                const href = entry.username ? `/users/${encodeURIComponent(entry.username)}` : '#';
                const tier = entry.account_tier ? TIER_LABELS[entry.account_tier] : null;

                return (
                  <Link
                    key={entry.user_id}
                    href={href}
                    className={cn(
                      'flex items-center gap-4 px-4 py-3 hover:bg-accent/50 transition-colors',
                      entry.rank <= 3 && 'bg-muted/30'
                    )}
                  >
                    <RankBadge rank={entry.rank} />

                    {entry.avatar_url ? (
                      <Image
                        src={entry.avatar_url}
                        alt={displayName}
                        width={36}
                        height={36}
                        className="rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-xs font-semibold text-primary">{initials}</span>
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
                      {entry.username && (
                        <p className="text-xs text-muted-foreground">@{entry.username}</p>
                      )}
                    </div>

                    {tier && tier.label !== 'Member' && (
                      <span className={cn('inline-block text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0', tier.className)}>
                        {tier.label}
                      </span>
                    )}

                    {mode === 'holdings' ? (
                      <div className="flex items-center gap-1.5 text-sm shrink-0">
                        <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-semibold text-foreground tabular-nums">{entry.holdings_count}</span>
                        <span className="text-muted-foreground hidden sm:inline">stock{entry.holdings_count === 1 ? '' : 's'}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2.5 shrink-0">
                        {(entry.current_streak ?? 0) > 0 && (
                          <span className="hidden sm:flex items-center gap-1 text-xs text-orange-400">
                            <Flame className="h-3.5 w-3.5" />
                            {entry.current_streak}
                          </span>
                        )}
                        <span className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">
                          Lvl {entry.level ?? 1}
                        </span>
                        <div className="flex items-center gap-1.5 text-sm">
                          <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-semibold text-foreground tabular-nums">{(entry.total_xp ?? 0).toLocaleString()}</span>
                          <span className="text-muted-foreground hidden sm:inline">XP</span>
                        </div>
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center">
          {mode === 'holdings'
            ? 'Rankings are based on portfolio diversity (number of unique stocks). Financial data is never shown.'
            : 'Rankings are based on total Academy XP earned from lessons and daily challenges.'}
        </p>
      </div>
    </div>
  );
}
