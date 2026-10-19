'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { useSignupGate } from '@/components/auth/SignupGate';
import { FeedList, FeedSkeleton, useSocialFeed } from '@/components/social/FeedList';

export default function SocialFeedPage() {
  const { t } = useTranslation('user');
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const openGate = useSignupGate();
  const { feedQuery, quotes } = useSocialFeed();
  const feed = feedQuery.data;

  const header = (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('feedTitle')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('feedSubtitle')}</p>
    </div>
  );

  let body: React.ReactNode;
  if (authLoading || (isAuthenticated && feedQuery.isPending)) {
    body = <FeedSkeleton />;
  } else if (!isAuthenticated) {
    body = (
      <div className="rounded-xl border border-border/60 bg-card px-6 py-10 text-center">
        <p className="font-semibold text-foreground">{t('feedSignedOutTitle')}</p>
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">{t('feedSignedOutBody')}</p>
        <div className="mt-5 flex flex-col items-center justify-center gap-2 sm:flex-row">
          <Button onClick={() => openGate({ source: 'feed', context: t('feedSignedOutBody'), redirectTo: '/social' })}>
            {t('feedSignUp')}
          </Button>
          <Button variant="ghost" onClick={() => openGate({ source: 'feed', mode: 'login', redirectTo: '/social' })}>
            {t('feedSignIn')}
          </Button>
        </div>
      </div>
    );
  } else if (feedQuery.isError) {
    body = (
      <div className="rounded-xl border border-border/60 bg-card px-6 py-10 text-center" role="alert">
        <p className="font-semibold text-foreground">{t('feedErrorTitle')}</p>
        <p className="mt-1.5 text-sm text-muted-foreground">{t('feedErrorBody')}</p>
        <Button variant="outline" className="mt-5" onClick={() => feedQuery.refetch()} disabled={feedQuery.isFetching}>
          {t('feedTryAgain')}
        </Button>
      </div>
    );
  } else if (!feed || feed.length === 0) {
    body = (
      <div className="rounded-xl border border-border/60 bg-card px-6 py-10 text-center">
        <p className="font-semibold text-foreground">{t('feedEmptyTitle')}</p>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">{t('feedEmptyBody')}</p>
        <div className="mt-5 flex flex-col items-center justify-center gap-2 sm:flex-row">
          <Button asChild variant="outline">
            <Link href="/discover/institutions">{t('feedBrowseFunds')}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/discover/politicians">{t('feedBrowseCongress')}</Link>
          </Button>
        </div>
        <Link href="/users" className="mt-4 inline-block text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          {t('feedBrowseMembers')}
        </Link>
      </div>
    );
  } else {
    body = <FeedList items={feed} quotes={quotes} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6 lg:px-8">
        {header}
        {body}
      </div>
    </div>
  );
}

