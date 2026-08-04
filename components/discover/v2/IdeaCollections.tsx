'use client';

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
 */
export function IdeaCollections({ collections }: { collections: DiscoverFeed['collections'] }) {
  const { trending, qualityDiscount, near52High, near52Low } = collections;

  const hasAny =
    trending.items.length > 0 ||
    qualityDiscount.length > 0 ||
    near52High.length > 0 ||
    near52Low.length > 0;

  if (!hasAny) return null;

  return (
    <section aria-labelledby="ideas-heading">
      <h2
        id="ideas-heading"
        className="mb-4 text-sm font-semibold uppercase tracking-widest text-muted-foreground/80"
      >
        Worth a look
      </h2>

      <div className="space-y-8">
        <CollectionGrid
          title={trending.mode === 'personalized' ? 'Because of what you follow' : 'Trending today'}
          description={trending.explanation}
          items={trending.items}
        />

        <CollectionGrid
          title="Quality at a discount"
          description="Financially strong for their sector, but priced below what that sector normally commands on next year's earnings."
          items={qualityDiscount}
          showReason
        />

        <CollectionGrid
          title="Pushing 52-week highs"
          description="Trading near the top of their yearly range, momentum worth understanding before you chase it."
          items={near52High}
          showReason
        />

        <CollectionGrid
          title="Near 52-week lows"
          description="At the bottom of their yearly range. Sometimes that's a bargain and sometimes it's a warning. The point is to go and find out which."
          items={near52Low}
          showReason
        />
      </div>
    </section>
  );
}
