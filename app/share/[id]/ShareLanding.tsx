'use client';

import { lazy, Suspense, useState } from 'react';
import Link from 'next/link';
import type { AuthMode } from '@/components/auth/AuthModal';
import type { PortfolioShare } from '@/lib/shares/get-share';
import { Button } from '@/components/ui/button';

const AuthModal = lazy(() => import('@/components/auth/AuthModal').then((m) => ({ default: m.AuthModal })));

export function ShareLanding({ share }: { share: PortfolioShare }) {
  const [authOpen, setAuthOpen] = useState(false);
  const [authMounted, setAuthMounted] = useState(false);
  const authMode: AuthMode = 'signup';

  const positive = share.pct >= 0;
  // share.username is the snapshot taken at creation time — never a live
  // lookup, never present when the share was made anonymous.
  const hasProfile = !share.anonymous && !!share.username;
  const handle = hasProfile ? `@${share.username}` : 'A BullPen investor';

  const openSignUp = () => {
    setAuthMounted(true);
    setAuthOpen(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-[480px] w-full text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- external OG route, not a static/optimizable local asset */}
        <img
          src={`/api/og/share/${share.id}`}
          alt={`${handle} is ${positive ? 'up' : 'down'} ${Math.abs(share.pct).toFixed(2)}% today, tracked on BullPen`}
          className="w-full rounded-xl mb-6 border border-border/60"
        />
        <Button size="lg" onClick={openSignUp}>
          Start tracking your portfolio
        </Button>
        <p className="text-xs text-muted-foreground mt-3">Free to start &middot; no card required</p>

        {/* The one piece of real social proof this page has: a link to the
            sharer's own public profile (already public/browsable — see
            app/users/[username]/page.tsx), when they weren't anonymous. */}
        {hasProfile && (
          <p className="text-xs text-muted-foreground mt-5">
            Shared by{' '}
            <Link href={`/users/${share.username}`} className="text-foreground/70 hover:text-foreground underline underline-offset-2">
              {handle}
            </Link>
          </p>
        )}
      </div>

      {authMounted && (
        <Suspense fallback={null}>
          <AuthModal open={authOpen} onOpenChange={setAuthOpen} initialMode={authMode} redirectTo="/dashboard" />
        </Suspense>
      )}
    </div>
  );
}
