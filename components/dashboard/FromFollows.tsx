'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { HomeSection } from '@/components/dashboard/HomeSection';
import { FeedList, useSocialFeed } from '@/components/social/FeedList';

const HOME_ITEMS = 3;

/**
 * The newest few things from the funds, members of Congress and investors this
 * person follows, with the way into the full Feed. Nothing at all when they
 * follow no one or nothing has happened: Home ends on purpose, and following is
 * found on the fund and politician pages, not by an empty box here.
 */
export function FromFollows() {
  const { t } = useTranslation('discover');
  const { feedQuery, quotes } = useSocialFeed();
  const items = feedQuery.data?.slice(0, HOME_ITEMS) ?? [];
  if (items.length === 0) return null;

  return (
    <HomeSection
      title={t('homeFollowsTitle')}
      aside={
        <Link
          href="/social"
          className="inline-flex items-center gap-1 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {t('homeFollowsSeeAll')}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      }
    >
      <FeedList items={items} quotes={quotes} />
    </HomeSection>
  );
}
