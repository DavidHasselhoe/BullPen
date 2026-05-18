'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { signOut } from '@/lib/auth/auth';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { User, LogOut, Loader2 } from 'lucide-react';
import { ProfileModal } from '@/components/user/ProfileModal';
import { ProfileAvatar } from '@/components/user/ProfileAvatar';

export function UserMenu() {
  const router = useRouter();
  const { user, isLoading, isAuthenticated } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    const result = await signOut();
    if (result.success) {
      // Full page reload guarantees UI reflects logged-out state
      window.location.href = '/';
      return;
    }
    setIsSigningOut(false);
  };

  // Show Sign In/Sign Up when loading or logged out (optimistic: most visitors are logged out)
  if (isLoading || !isAuthenticated || !user) {
    return (
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/login')}
          className="transition-all hover:scale-105 hover:bg-accent/50"
        >
          Sign In
        </Button>
        <Button
          size="sm"
          onClick={() => router.push('/register')}
          className="transition-all hover:scale-105 active:scale-95"
        >
          Sign Up
        </Button>
      </div>
    );
  }

  // Get user initials for avatar fallback
  const getInitials = () => {
    if (user.full_name) {
      return user.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    if (user.username) {
      return user.username.slice(0, 2).toUpperCase();
    }
    return user.email.slice(0, 2).toUpperCase();
  };

  const displayName = user.full_name || user.username || user.email.split('@')[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="relative h-9 w-9 rounded-full transition-all hover:scale-105 focus:ring-2 focus:ring-ring p-0"
        >
          <ProfileAvatar
            avatarUrl={user.avatar_url}
            displayName={displayName}
            fallback={getInitials()}
            tier={user.account_tier ?? 1}
            size="md"
            showTooltip={false}
            showCrown={false}
            className="h-9 w-9"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-56 animate-fade-in-up"
        align="end"
        forceMount
      >
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{displayName}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {user.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            setProfileOpen(true);
          }}
          className="cursor-pointer transition-all hover:translate-x-1"
        >
          <User className="mr-2 h-4 w-4" />
          <span>Profile</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleSignOut}
          disabled={isSigningOut}
          variant="destructive"
          className="cursor-pointer transition-all hover:translate-x-1"
        >
          {isSigningOut ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="mr-2 h-4 w-4" />
          )}
          <span>Sign Out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
      <ProfileModal open={profileOpen} onOpenChange={setProfileOpen} />
    </DropdownMenu>
  );
}