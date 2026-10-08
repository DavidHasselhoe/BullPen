'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import type { DirectorySector, DirectoryStock } from '@/lib/market-data/stock-directory';

interface Props {
  sector: Omit<DirectorySector, 'stocks'>;
  peers: DirectoryStock[];
}

/**
 * Same-sector companies under a stock page. Rendered with the page's server
 * HTML, so these are real links a crawler follows from one stock page to the
 * next, not ones that only exist after hydration.
 */
export function SectorPeers({ sector, peers }: Props) {
  const { t } = useTranslation('stock');
  if (peers.length === 0) return null;

  return (
    <section aria-labelledby="sector-peers-heading" className="mt-12 border-t border-border/50 pt-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="sector-peers-heading" className="text-lg font-semibold tracking-tight text-foreground">
            {t('sectorPeersHeading', { sector: sector.label })}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">{t('sectorPeersSubtitle')}</p>
        </div>
        <Link
          href={`/stocks#${sector.key}`}
          className="inline-flex min-h-10 items-center gap-1 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
        >
          {t('sectorPeersSeeAll')}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
        {peers.map((p) => (
          <li key={p.ticker}>
            <Link
              href={`/stock/${p.ticker}`}
              className="flex min-h-14 items-center gap-2.5 rounded-xl border border-border/50 bg-card/50 px-3 py-2 transition-colors duration-150 hover:border-border hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <CompanyLogo name={p.name} ticker={p.ticker} logoUrl={null} size={28} className="shrink-0" />
              <span className="min-w-0">
                {/* clamp-ok: a company name, not prose; full name in title */}
                <span className="block truncate text-sm font-medium text-foreground" title={p.name}>{p.name}</span>
                {p.name !== p.ticker && (
                  <span className="block font-mono text-xs text-muted-foreground">{p.ticker}</span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
