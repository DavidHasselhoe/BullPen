'use client';

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Layers } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { useHoldings } from '@/hooks/use-holdings';
import { cn } from '@/lib/utils';

/**
 * "Let this read my holdings" — the consent and the preview in one control.
 *
 * Shared by every surface that offers to send the reader's positions to a
 * model (the portfolio builder's foundation, the deep dive's fit check), each
 * passing its own title and description so the control always names the thing
 * it is actually about to do.
 *
 * Nothing about someone's portfolio should reach a model because of a setting
 * they turned on months ago, so this is per generation and off by default, and
 * the positions it would send are listed right here before anything is
 * submitted. The weights shown are the same cost-basis weights the prompt
 * sends, so the screen and the request cannot disagree.
 *
 * Hidden entirely for an investor with no holdings: a toggle that silently
 * does nothing is worse than no toggle.
 */
export function HoldingsContextToggle({
  enabled,
  onChange,
  disabled,
  title,
  description,
}: {
  enabled: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Each surface names the thing it is about to do with the positions. */
  title: string;
  description: string;
}) {
  const { t } = useTranslation('tools');
  const { data: holdings } = useHoldings();
  const [listOpen, setListOpen] = useState(false);

  const positions = useMemo(() => {
    const rows = (holdings ?? []).filter(
      (h) => (h.quantity ?? 0) > 1e-9 && (h.avg_price ?? 0) > 0,
    );
    const total = rows.reduce((sum, h) => sum + (h.quantity ?? 0) * (h.avg_price ?? 0), 0);
    if (total <= 0) return [];
    return rows
      .map((h) => ({
        ticker: h.symbol.toUpperCase(),
        company: h.company_name ?? h.symbol.toUpperCase(),
        logoUrl: h.logo_url ?? null,
        weightPct: (((h.quantity ?? 0) * (h.avg_price ?? 0)) / total) * 100,
      }))
      .sort((a, b) => b.weightPct - a.weightPct);
  }, [holdings]);

  if (positions.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/60 bg-card/60">
      <div className="flex items-center gap-3 px-4 py-3">
        <Layers className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {description}
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={onChange}
          disabled={disabled}
          aria-label={title}
        />
      </div>

      {enabled && (
        <div className="border-t border-border/40 px-4 py-2.5">
          <button
            type="button"
            onClick={() => setListOpen((v) => !v)}
            aria-expanded={listOpen}
            className={cn(
              'flex w-full items-center justify-between gap-2 text-xs text-muted-foreground',
              'transition-colors duration-150 hover:text-foreground',
            )}
          >
            <span>{t('portfolioBuilderUseHoldingsCount', { count: positions.length })}</span>
            <ChevronDown
              className={cn('h-3.5 w-3.5 shrink-0 transition-transform duration-200', listOpen && 'rotate-180')}
              aria-hidden
            />
          </button>

          {listOpen && (
            <ul className="mt-2.5 max-h-56 space-y-1.5 overflow-y-auto pr-1">
              {positions.map((p) => (
                <li key={p.ticker} className="flex items-center gap-2">
                  <CompanyLogo ticker={p.ticker} name={p.company} logoUrl={p.logoUrl} size={18} />
                  <span className="font-mono text-xs font-semibold text-foreground">{p.ticker}</span>
                  <span className="truncate text-xs text-muted-foreground/85">{p.company}</span>
                  <span className="ml-auto shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {p.weightPct.toFixed(1)}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
