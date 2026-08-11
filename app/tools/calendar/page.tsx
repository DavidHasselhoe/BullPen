'use client';

import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { CalendarClientPage } from './CalendarClientPage';

// View and anchor date live in the URL (?view=week&date=2026-08-03), so the
// page reads useSearchParams and must sit behind a Suspense boundary. Same
// shape as app/tools/dividend/page.tsx.
export const dynamic = 'force-dynamic';

export default function CalendarPage() {
  return (
    <Suspense
      fallback={
        <main className="container mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
          <Skeleton className="mb-8 h-10 w-56" />
          <Skeleton className="mb-4 h-9 w-full" />
          <Skeleton className="h-[420px] w-full rounded-xl" />
        </main>
      }
    >
      <CalendarClientPage />
    </Suspense>
  );
}
