'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import DividendClientPage, { type DividendSeedHolding } from './DividendClientPage';

export const dynamic = 'force-dynamic';

function isValidSeed(value: unknown): value is DividendSeedHolding[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every((h) => {
    if (!h || typeof h !== 'object') return false;
    const r = h as Record<string, unknown>;
    return (
      typeof r.ticker === 'string' &&
      typeof r.name === 'string' &&
      typeof r.value === 'string' &&
      (r.mode === 'amount' || r.mode === 'shares')
    );
  });
}

function DividendPageContent() {
  const searchParams = useSearchParams();

  const seedParam = searchParams.get('seed');
  let initialHoldings: DividendSeedHolding[] | undefined;
  if (seedParam) {
    try {
      const parsed = JSON.parse(seedParam);
      if (isValidSeed(parsed)) initialHoldings = parsed;
    } catch {
      initialHoldings = undefined;
    }
  }

  const yearsParam = searchParams.get('years');
  const parsedYears = yearsParam ? parseInt(yearsParam, 10) : NaN;
  const initialYears = Number.isFinite(parsedYears) && parsedYears > 0 ? parsedYears : undefined;

  return <DividendClientPage initialHoldings={initialHoldings} initialYears={initialYears} />;
}

export default function DividendPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto max-w-4xl py-10 px-4 sm:px-6 lg:px-8">
          <Skeleton className="h-8 w-48 mb-6" />
          <Skeleton className="h-96 w-full" />
        </div>
      }
    >
      <DividendPageContent />
    </Suspense>
  );
}
