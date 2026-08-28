'use client';

import { useTranslation } from 'react-i18next';
import { CollectionGrid } from './CollectionGrid';
import { CollectionFAQ, type FAQEntry } from './CollectionFAQ';
import type { DiscoverFeed } from '@/lib/discover/discover-config';

/**
 * The "find something new" zone.
 *
 * Every list here is a screen with a stated reason, not a market-cap ranking.
 * That's the difference between discovery and a directory: a user already knows
 * the biggest companies, so listing them again surfaces nothing. A name that's
 * financially strong for its sector but priced below what that sector normally
 * commands is something they'd never have found by browsing.
 *
 * The reason itself is stated in CollectionFAQ, not under each grid — see that
 * file for why.
 */
export function IdeaCollections({ collections }: { collections: DiscoverFeed['collections'] }) {
  const { t } = useTranslation('discover');
  const { trending, qualityDiscount, near52High, near52Low } = collections;

  const hasAny =
    trending.items.length > 0 ||
    qualityDiscount.length > 0 ||
    near52High.length > 0 ||
    near52Low.length > 0;

  if (!hasAny) return null;

  const trendingTitle = trending.mode === 'personalized' ? t('ideasTrendingPersonalized') : t('ideasTrendingToday');

  const faqItems: FAQEntry[] = [
    trending.items.length > 0 && trending.explanation
      ? { id: 'trending', question: t('ideasFaqWhyTrending', { title: trendingTitle }), answer: trending.explanation }
      : null,
    qualityDiscount.length > 0
      ? {
          id: 'quality',
          question: t('ideasFaqQualityQuestion'),
          answer: t('ideasFaqQualityAnswer'),
        }
      : null,
    near52High.length > 0
      ? {
          id: 'highs',
          question: t('ideasFaqHighsQuestion'),
          answer: t('ideasFaqHighsAnswer'),
        }
      : null,
    near52Low.length > 0
      ? {
          id: 'lows',
          question: t('ideasFaqLowsQuestion'),
          answer: t('ideasFaqLowsAnswer'),
        }
      : null,
  ].filter((x): x is FAQEntry => x != null);

  return (
    <section aria-labelledby="ideas-heading">
      <h2
        id="ideas-heading"
        className="mb-4 text-sm font-semibold uppercase tracking-widest text-muted-foreground/80"
      >
        {t('ideasHeading')}
      </h2>

      <div className="space-y-8">
        <CollectionGrid title={trendingTitle} items={trending.items} />

        <CollectionGrid title={t('ideasQualityDiscountTitle')} items={qualityDiscount} showReason />

        <CollectionGrid title={t('ideasPushingHighsTitle')} items={near52High} showReason />

        <CollectionGrid title={t('ideasNearLowsTitle')} items={near52Low} showReason />
      </div>

      <CollectionFAQ items={faqItems} />
    </section>
  );
}
