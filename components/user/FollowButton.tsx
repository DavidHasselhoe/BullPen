'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { UserPlus, UserCheck, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

interface FollowStats {
  followers: number;
  following: number;
  isFollowing: boolean;
}

interface FollowButtonProps {
  username: string;
  targetUserId: string;
  className?: string;
}

export function FollowButton({ username, targetUserId, className }: FollowButtonProps) {
  const { user, isAuthenticated } = useAuth();
  const [stats, setStats] = useState<FollowStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);

  const isOwnProfile = user?.id === targetUserId;

  useEffect(() => {
    if (!isAuthenticated || isOwnProfile) { setLoading(false); return; }
    fetch(`/api/social/follow/${encodeURIComponent(username)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setStats({ followers: d.followers, following: d.following, isFollowing: d.isFollowing });
      })
      .finally(() => setLoading(false));
  }, [username, isAuthenticated, isOwnProfile]);

  const handleToggle = async () => {
    if (!stats || pending) return;
    setPending(true);
    const optimistic = { ...stats, isFollowing: !stats.isFollowing, followers: stats.isFollowing ? stats.followers - 1 : stats.followers + 1 };
    setStats(optimistic);
    try {
      const method = stats.isFollowing ? 'DELETE' : 'POST';
      await fetch(`/api/social/follow/${encodeURIComponent(username)}`, { method });
    } catch {
      setStats(stats); // revert on error
    } finally {
      setPending(false);
    }
  };

  if (!isAuthenticated || isOwnProfile || loading) return null;

  return (
    <div className={cn('flex items-center gap-3', className)}>
      {/* Follower counts */}
      {stats && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span><strong className="text-foreground">{stats.followers}</strong> follower{stats.followers === 1 ? '' : 's'}</span>
          <span><strong className="text-foreground">{stats.following}</strong> following</span>
        </div>
      )}

      <Button
        size="sm"
        variant={stats?.isFollowing ? 'outline' : 'default'}
        onClick={handleToggle}
        disabled={pending}
        className="gap-1.5 min-w-[100px]"
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : stats?.isFollowing ? (
          <><UserCheck className="h-3.5 w-3.5" />Following</>
        ) : (
          <><UserPlus className="h-3.5 w-3.5" />Follow</>
        )}
      </Button>
    </div>
  );
}
