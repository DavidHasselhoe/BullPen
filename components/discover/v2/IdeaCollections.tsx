'use client';

import { useTranslation } from 'react-i18next';
import { CollectionGrid } from './CollectionGrid';
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
 * Each list's reason lives behind the "?" on its own title — next to the thing
 * it explains, and out of the way until someone wants it.
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

  return (
    <section aria-labelledby="ideas-heading">
      <h2
        id="ideas-heading"
        className="mb-4 text-sm font-semibold uppercase tracking-widest text-muted-foreground"
      >
        {t('ideasHeading')}
      </h2>

      <div className="space-y-8">
        <CollectionGrid
          title={trendingTitle}
          items={trending.items}
          help={
            trending.explanation
              ? { label: t('ideasFaqWhyTrending', { title: trendingTitle }), body: trending.explanation }
              : undefined
          }
        />

        <CollectionGrid
          title={t('ideasQualityDiscountTitle')}
          items={qualityDiscount}
          showReason
          help={{ label: t('ideasFaqQualityQuestion'), body: t('ideasFaqQualityAnswer') }}
        />

        <CollectionGrid
          title={t('ideasPushingHighsTitle')}
          items={near52High}
          showReason
          help={{ label: t('ideasFaqHighsQuestion'), body: t('ideasFaqHighsAnswer') }}
        />

        <CollectionGrid
          title={t('ideasNearLowsTitle')}
          items={near52Low}
          showReason
          help={{ label: t('ideasFaqLowsQuestion'), body: t('ideasFaqLowsAnswer') }}
        />
      </div>
    </section>
  );
}
