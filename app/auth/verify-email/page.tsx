import Link from 'next/link';
import type { Metadata } from 'next';
import { CheckCircle2, MailWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { markVerified } from '@/lib/auth/email-verification';

export const metadata: Metadata = { title: 'Confirm email', robots: { index: false } };
export const dynamic = 'force-dynamic';

/**
 * Where the verification email's link lands. Works on any device, signed in or
 * not: the token is the proof. The tab that asked for it (trial or upgrade
 * page) notices on its own and carries on to checkout.
 */
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const ok = token ? await markVerified(token) : false;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm text-center">
        {ok ? (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10 text-[var(--brand)]" aria-hidden />
            <h1 className="mt-4 text-xl font-semibold text-foreground">Email confirmed</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your free week of Pro is ready to start. If BullPen is open in another tab, it carries on there.
            </p>
            <Button asChild className="btn-brand-solid mt-6 h-11 w-full">
              <Link href="/get-started/trial">Continue</Link>
            </Button>
          </>
        ) : (
          <>
            <MailWarning className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden />
            <h1 className="mt-4 text-xl font-semibold text-foreground">This link has expired</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in and start your trial again. We&apos;ll send you a fresh link.
            </p>
            <Button asChild variant="outline" className="mt-6 h-11 w-full">
              <Link href="/get-started/trial">Go to BullPen</Link>
            </Button>
          </>
        )}
      </div>
    </main>
  );
}
