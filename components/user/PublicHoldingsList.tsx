'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { cn } from '@/lib/utils';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { displayCompanyName } from '@/lib/market-data/company-name';

interface Holding {
  symbol: string;
  company_name: string;
}

interface PublicHoldingsListProps {
  holdings: Holding[];
  className?: string;
}

export function PublicHoldingsList({ holdings, className }: PublicHoldingsListProps) {
  const { t } = useTranslation('user');
  if (holdings.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{t('publicHoldingsEmpty')}</p>
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
          <div className="flex min-w-0 flex-col">
            {/* clamp-ok: company name in a chip, full name in title */}
            <span className="max-w-[120px] truncate text-xs font-semibold leading-tight text-foreground" title={h.company_name ?? undefined}>
              {displayCompanyName(h.company_name || h.symbol, h.symbol)}
            </span>
            <span className="text-[11px] text-muted-foreground">{h.symbol}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
