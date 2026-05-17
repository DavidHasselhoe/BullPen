'use client';

import { Sparkles, Flame } from 'lucide-react';
import { StockCarouselRail } from './StockCarouselRail';
import type { DiscoverFeed } from '@/lib/discover/discover-config';

interface Props {
  forYou: DiscoverFeed['forYou'];
}

export function ForYouRail({ forYou }: Props) {
  if (forYou.items.length === 0) return null;

  const isPersonalized = forYou.mode === 'personalized';

  return (
    <StockCarouselRail
      title={isPersonalized ? 'For You' : 'Trending Today'}
      subtitle={forYou.explanation}
      accent={isPersonalized ? 'bg-primary' : 'bg-amber-500'}
      icon={isPersonalized ? <Sparkles className="h-4 w-4" /> : <Flame className="h-4 w-4" />}
      items={forYou.items}
      speed={20}
    />
  );
}
