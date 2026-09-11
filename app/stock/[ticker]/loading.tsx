/**
 * Streamed while the server builds the snapshot for this ticker.
 *
 * Without this, awaiting the snapshot in page.tsx would hold the whole response
 * back and the browser would sit on a blank document for as long as TwelveData
 * took. With it, the shell paints immediately and the real page replaces it the
 * moment the data lands — which for a warm ticker is under a hundred
 * milliseconds.
 *
 * Deliberately mirrors the real layout's shape (back link, header card, chart
 * card) so the swap is a fill-in rather than a jump.
 */

import { Skeleton } from '@/components/ui/skeleton';

export default function StockLoading() {
  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <Skeleton className="mb-6 h-5 w-16" />

        <div className="mb-8 rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-40" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <Skeleton className="h-12 w-52" />
          <Skeleton className="mt-2 h-4 w-32" />
          <Skeleton className="mt-6 h-64 w-full" />
        </div>
      </main>
    </div>
  );
}
