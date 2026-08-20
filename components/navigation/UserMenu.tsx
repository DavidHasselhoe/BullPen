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
import { Button } from '@/components/ui/button';
import { User, LogOut, Loader2, Shield, CreditCard, Sparkles, MessageSquarePlus, Inbox } from 'lucide-react';
import { ProfileModal } from '@/components/user/ProfileModal';
import { ProfileAvatar } from '@/components/user/ProfileAvatar';
import { ProBadge } from '@/components/billing/ProBadge';
import { ReportFeedbackDialog } from '@/components/feedback/ReportFeedbackDialog';
import { isAdmin, isPro, tierFromUser } from '@/lib/billing/tier';
import { startPortal } from '@/lib/billing/checkout';
import { cn } from '@/lib/utils';

interface UserMenuProps {
  // Landing page forces dark mode locally (see LandingClient's `dark` class) but
  // DropdownMenuContent portals to document.body, outside that scope — so a
  // signed-in user with a 'light' app theme would otherwise see a light-themed
  // menu float over the always-dark landing page. Set by Nav.tsx only.
  forceDark?: boolean;
  // Controlled open state — lets Navigation.tsx close this menu when another
  // header dropdown (notifications, pinned tickers) opens. Uncontrolled when omitted.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function UserMenu({ forceDark = false, open, onOpenChange }: UserMenuProps = {}) {
  const router = useRouter();
  const { user, isLoading, isAuthenticated } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

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

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    const result = await startPortal();
    // Comped/admin accounts have no Stripe customer — fall back to pricing.
    window.location.href = result.url || '/upgrade';
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
  const tier = tierFromUser(user.account_tier, user.role);
  const userIsAdmin = isAdmin(tier);
  const userIsPro = isPro(tier);

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="relative h-9 w-9 rounded-full transition-all hover:scale-105 focus:ring-2 focus:ring-ring p-0"
          aria-label="Account menu"
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
        className={cn('w-56 animate-fade-in-up', forceDark && 'dark')}
        align="end"
        forceMount
      >
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium leading-none">{displayName}</p>
              {userIsPro ? (
                <ProBadge />
              ) : (
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Free
                </span>
              )}
            </div>
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

        {userIsPro ? (
          <DropdownMenuItem
            onClick={handleManageSubscription}
            disabled={portalLoading}
            className="cursor-pointer transition-all hover:translate-x-1"
          >
            {portalLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="mr-2 h-4 w-4" />
            )}
            <span>Manage subscription</span>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onClick={() => router.push('/upgrade')}
            className="cursor-pointer text-primary transition-all hover:translate-x-1 focus:text-primary"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            <span>Upgrade to Pro</span>
          </DropdownMenuItem>
        )}

        {userIsAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px] uppercase tracking-widest text-muted-foreground/80 font-semibold">
              Admin
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => router.push('/admin/costs')}
              className="cursor-pointer transition-all hover:translate-x-1"
            >
              <Shield className="mr-2 h-4 w-4" />
              <span>AI Costs</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => router.push('/admin/feedback')}
              className="cursor-pointer transition-all hover:translate-x-1"
            >
              <Inbox className="mr-2 h-4 w-4" />
              <span>Feedback</span>
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => setFeedbackOpen(true)}
          className="cursor-pointer transition-all hover:translate-x-1"
        >
          <MessageSquarePlus className="mr-2 h-4 w-4" />
          <span>Report a bug or idea</span>
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
      <ReportFeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </DropdownMenu>
  );
}