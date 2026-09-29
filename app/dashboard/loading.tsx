/**
 * Streamed while the server resolves the greeting and index quotes. Mirrors
 * Home's real shape (heading, sentence, market line, portfolio panel, a
 * section below) so nothing jumps when the page arrives.
 */

import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-3 h-4 w-96 max-w-full" />
        <Skeleton className="mt-4 h-4 w-80 max-w-full" />
        <Skeleton className="mt-8 h-6 w-40" />
        <Skeleton className="mt-3 h-56 w-full rounded-xl" />
        <Skeleton className="mt-10 h-6 w-32" />
        <Skeleton className="mt-3 h-32 w-full rounded-xl" />
      </main>
    </div>
  );
}
