'use client';

import { DiscoverClient } from '@/components/discover/v2/DiscoverClient';
import { useBackground } from '@/hooks/use-background';
import { cn } from '@/lib/utils';

export default function DiscoverPage() {
  const { hasAnimatedBackground } = useBackground();

  return (
    <div className={cn('min-h-screen', hasAnimatedBackground ? '' : 'bg-background')}>
      <main className="container mx-auto max-w-6xl py-8 px-4 sm:px-6 lg:px-8 min-w-0">
        <DiscoverClient />
      </main>
    </div>
  );
}
