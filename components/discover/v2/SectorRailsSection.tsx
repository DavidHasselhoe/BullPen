'use client';

import { StockCarouselRail } from './StockCarouselRail';
import { SECTOR_DISPLAY_ORDER } from '@/lib/discover/discover-config';
import type { DiscoverFeed } from '@/lib/discover/discover-config';

interface Props {
  sectors: DiscoverFeed['sectors'];
}

export function SectorRailsSection({ sectors }: Props) {
  return (
    <section aria-labelledby="sectors-heading" className="space-y-8">
      <div>
        <h2 id="sectors-heading" className="text-sm font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1">
          Browse by Sector
        </h2>
        <p className="text-xs text-muted-foreground/45">
          Top companies in each GICS sector by market capitalization.
        </p>
      </div>

      {SECTOR_DISPLAY_ORDER.map((entry) => {
        const items = sectors[entry.key] ?? [];
        if (items.length === 0) return null;
        const Icon = entry.icon;
        return (
          <StockCarouselRail
            key={entry.key}
            title={entry.label}
            subtitle={entry.tagline}
            accent={entry.accent}
            icon={<Icon className="h-4 w-4" />}
            items={items}
            meta={`${items.length} stocks`}
          />
        );
      })}
    </section>
  );
}
