'use client';

import { useTranslation } from 'react-i18next';
import { CollectionGrid } from './CollectionGrid';
import type { DiscoverFeed } from '@/lib/discover/discover-config';

/** Cards per row at desktop width (the grid is lg:grid-cols-6). */
const ROW = 6;

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
  // One row, and no name a reasoned list below already carries: HD sat in
  // "Because of what you follow" and again in "Near 52-week lows", where it at
  // least said why. The lists with a reason keep it.
  const reasoned = new Set([...qualityDiscount, ...near52High, ...near52Low].map((i) => i.symbol));
  const trendingItems = trending.items.filter((i) => !reasoned.has(i.symbol)).slice(0, ROW);

  return (
    <section aria-labelledby="ideas-heading">
      <h2
        id="ideas-heading"
        className="mb-4 text-lg font-semibold tracking-tight text-foreground"
      >
        {t('ideasHeading')}
      </h2>

      <div className="space-y-8">
        <CollectionGrid
          title={trendingTitle}
          items={trendingItems}
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
