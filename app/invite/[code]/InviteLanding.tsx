'use client';

import { lazy, Suspense, useState } from 'react';
import Link from 'next/link';
import { Gift } from 'lucide-react';
import { Button } from '@/components/ui/button';

const AuthModal = lazy(() => import('@/components/auth/AuthModal').then((m) => ({ default: m.AuthModal })));

interface Copy {
  headline: string;
  body: string;
  offer: string;
  cta: string;
  signedIn: string;
  signedInCta: string;
}

/** The middleware has already set the bp_inv cookie; signing up from here claims it. */
export function InviteLanding({ signedIn, copy }: { signedIn: boolean; copy: Copy }) {
  const [authOpen, setAuthOpen] = useState(false);
  const [authMounted, setAuthMounted] = useState(false);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-[440px] text-center">
        <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Gift className="h-6 w-6 text-primary" aria-hidden />
        </div>
        <h1 className="text-balance text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{copy.headline}</h1>
        <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">{copy.body}</p>

        {signedIn ? (
          <>
            <p className="mt-6 text-sm text-muted-foreground">{copy.signedIn}</p>
            <Button asChild size="lg" variant="outline" className="mt-4 min-h-11">
              <Link href="/dashboard">{copy.signedInCta}</Link>
            </Button>
          </>
        ) : (
          <>
            <Button
              size="lg"
              className="mt-8 min-h-11 w-full sm:w-auto"
              onClick={() => {
                setAuthMounted(true);
                setAuthOpen(true);
              }}
            >
              {copy.cta}
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">{copy.offer}</p>
          </>
        )}
      </div>

      {authMounted && (
        <Suspense fallback={null}>
          <AuthModal open={authOpen} onOpenChange={setAuthOpen} initialMode="signup" redirectTo="/dashboard" />
        </Suspense>
      )}
    </main>
  );
}
