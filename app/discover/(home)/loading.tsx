/**
 * Streamed while the server prefetches the feed and the Weekly Pick. The
 * page's own skeleton in the page's own frame, so nothing moves when the
 * real page replaces it.
 */

import { DiscoverSkeleton } from '@/components/discover/v2/DiscoverClient';

export default function DiscoverLoading() {
  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-6xl py-8 px-4 sm:px-6 lg:px-8 min-w-0">
        <DiscoverSkeleton />
      </main>
    </div>
  );
}
