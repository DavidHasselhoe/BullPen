'use client';

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
  const { trending, qualityDiscount, near52High, near52Low } = collections;

  const hasAny =
    trending.items.length > 0 ||
    qualityDiscount.length > 0 ||
    near52High.length > 0 ||
    near52Low.length > 0;

  if (!hasAny) return null;

  const trendingTitle = trending.mode === 'personalized' ? 'Because of what you follow' : 'Trending today';

  const faqItems: FAQEntry[] = [
    trending.items.length > 0 && trending.explanation
      ? { id: 'trending', question: `Why "${trendingTitle}"?`, answer: trending.explanation }
      : null,
    qualityDiscount.length > 0
      ? {
          id: 'quality',
          question: 'What makes a stock "quality at a discount"?',
          answer: "Financially strong for their sector, but priced below what that sector normally commands on next year's earnings.",
        }
      : null,
    near52High.length > 0
      ? {
          id: 'highs',
          question: 'Why watch stocks pushing 52-week highs?',
          answer: 'Trading near the top of their yearly range, momentum worth understanding before you chase it.',
        }
      : null,
    near52Low.length > 0
      ? {
          id: 'lows',
          question: 'Why watch stocks near 52-week lows?',
          answer: "At the bottom of their yearly range. Sometimes that's a bargain and sometimes it's a warning. The point is to go and find out which.",
        }
      : null,
  ].filter((x): x is FAQEntry => x != null);

  return (
    <section aria-labelledby="ideas-heading">
      <h2
        id="ideas-heading"
        className="mb-4 text-sm font-semibold uppercase tracking-widest text-muted-foreground/80"
      >
        Worth a look
      </h2>

      <div className="space-y-8">
        <CollectionGrid title={trendingTitle} items={trending.items} />

        <CollectionGrid title="Quality at a discount" items={qualityDiscount} showReason />

        <CollectionGrid title="Pushing 52-week highs" items={near52High} showReason />

        <CollectionGrid title="Near 52-week lows" items={near52Low} showReason />
      </div>

      <CollectionFAQ items={faqItems} />
    </section>
  );
}
