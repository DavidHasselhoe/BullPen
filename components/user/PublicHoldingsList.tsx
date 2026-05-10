'use client';

import Link from 'next/link';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { cn } from '@/lib/utils';
import { slugToAssetPath } from '@/lib/assets/asset-type';

interface Holding {
  symbol: string;
  company_name: string;
}

interface PublicHoldingsListProps {
  holdings: Holding[];
  className?: string;
}

export function PublicHoldingsList({ holdings, className }: PublicHoldingsListProps) {
  if (holdings.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No public holdings.</p>
    );
  }

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {holdings.map((h) => (
        <Link
          key={h.symbol}
          href={slugToAssetPath(h.symbol)}
          className={cn(
            'flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2',
            'hover:border-primary/50 hover:bg-accent/60 hover:shadow-sm transition-all duration-150'
          )}
        >
          {/* logoUrl=null → CompanyLogo fetches via /api/logo/[ticker] automatically */}
          <CompanyLogo
            name={h.company_name}
            ticker={h.symbol}
            logoUrl={null}
            size={22}
          />
          <div className="flex flex-col">
            <span className="text-xs font-semibold leading-none text-foreground">{h.symbol}</span>
            <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">{h.company_name}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
