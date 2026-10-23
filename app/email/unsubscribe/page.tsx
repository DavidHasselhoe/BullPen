import Link from 'next/link';
import type { Metadata } from 'next';
import { CheckCircle2, MailWarning, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { readUnsubscribeToken } from '@/lib/email/alert-email';

export const metadata: Metadata = { title: 'Email preferences', robots: { index: false } };
export const dynamic = 'force-dynamic';

/**
 * Where the alert email's "Turn off these emails" link lands. Works signed in
 * or not: the token is the proof. It asks before turning anything off, because
 * mail filters open links on their own; the button POSTs to the API route.
 */
export default async function EmailUnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; done?: string; failed?: string }>;
}) {
  const { t, done, failed } = await searchParams;
  const valid = !!t && !!readUnsubscribeToken(t);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm text-center">
        {done ? (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10 text-[var(--brand)]" aria-hidden />
            <h1 className="mt-4 text-xl font-semibold text-foreground">You won&apos;t get these emails anymore</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your alerts still show up in BullPen. You can turn the email back on in Settings, under Notifications.
            </p>
            <Button asChild variant="outline" className="mt-6 h-11 w-full">
              <Link href="/notifications?settings=notifications">Email settings</Link>
            </Button>
          </>
        ) : valid && !failed ? (
          <>
            <BellOff className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden />
            <h1 className="mt-4 text-xl font-semibold text-foreground">Stop the morning alert email?</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              You&apos;ll still see earnings, dividend and big-move alerts in BullPen. Only the email stops.
            </p>
            <form method="post" action={`/api/email/unsubscribe?t=${encodeURIComponent(t!)}`}>
              <input type="hidden" name="from" value="page" />
              <Button type="submit" className="btn-brand-solid mt-6 h-11 w-full">
                Turn off the email
              </Button>
            </form>
            <Button asChild variant="ghost" className="mt-2 h-11 w-full">
              <Link href="/dashboard">Keep getting it</Link>
            </Button>
          </>
        ) : (
          <>
            <MailWarning className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden />
            <h1 className="mt-4 text-xl font-semibold text-foreground">This link doesn&apos;t work</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in and turn the email off in Settings, under Notifications.
            </p>
            <Button asChild variant="outline" className="mt-6 h-11 w-full">
              <Link href={`/login?redirect=${encodeURIComponent('/notifications?settings=notifications')}`}>Sign in</Link>
            </Button>
          </>
        )}
      </div>
    </main>
  );
}
