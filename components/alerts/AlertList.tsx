'use client';

import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AlertCard } from './AlertCard';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { cn } from '@/lib/utils';
import type { UserAlert } from '@/types/alerts';

type Filter = 'all' | 'active' | 'paused';

const FILTER_LABEL_KEYS: Record<Filter, 'filterAll' | 'filterActive' | 'filterPaused'> = {
  all: 'filterAll',
  active: 'filterActive',
  paused: 'filterPaused',
};

interface Props {
  alerts: UserAlert[];
  onToggle: (id: string, isActive: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onAddCondition: (symbol: string, companyName: string | null) => void;
}

interface StockGroup {
  symbol: string;
  companyName: string | null;
  alerts: UserAlert[];
}

export function AlertList({ alerts, onToggle, onDelete, onAddCondition }: Props) {
  const { t } = useTranslation('alerts');
  const [filter, setFilter] = useState<Filter>('all');

  // Group all alerts by symbol, preserving insertion order of first occurrence
  const grouped = useMemo<StockGroup[]>(() => {
    const map = new Map<string, StockGroup>();
    for (const alert of alerts) {
      if (!map.has(alert.symbol)) {
        map.set(alert.symbol, { symbol: alert.symbol, companyName: alert.companyName, alerts: [] });
      }
      map.get(alert.symbol)!.alerts.push(alert);
    }
    return Array.from(map.values());
  }, [alerts]);

  // Apply filter within each group; drop groups that become empty
  const filteredGroups = useMemo<StockGroup[]>(() => {
    return grouped
      .map((g) => ({
        ...g,
        alerts: g.alerts.filter((a) =>
          filter === 'all' ? true : filter === 'active' ? a.isActive : !a.isActive
        ),
      }))
      .filter((g) => g.alerts.length > 0);
  }, [grouped, filter]);

  const activeStockCount = grouped.filter((g) => g.alerts.some((a) => a.isActive)).length;
  const totalConditions = alerts.length;

  return (
    <div className="space-y-3">
      {/* Section header + filter chips */}
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground/80">
            {t('sectionTitle')}
          </h2>
          <span className="text-[11px] font-mono text-muted-foreground/80">
            {t('stockCount', { count: activeStockCount })}
            {totalConditions > 0 && ` · ${t('conditionCount', { count: totalConditions })}`}
          </span>
        </div>
        <div className="flex items-center gap-0.5 rounded-md border border-border/40 bg-card/30 p-0.5">
          {(['all', 'active', 'paused'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                'text-[11px] font-medium uppercase tracking-wider px-2 py-0.5 rounded transition-colors',
                filter === f
                  ? 'bg-foreground/10 text-foreground'
                  : 'text-muted-foreground/80 hover:text-foreground'
              )}
            >
              {t(FILTER_LABEL_KEYS[f])}
            </button>
          ))}
        </div>
      </div>

      {/* Groups */}
      {filteredGroups.length === 0 ? (
        <div className="rounded-2xl border border-border/30 border-dashed py-10 text-center">
          <p className="text-xs text-muted-foreground/80">
            {filter === 'paused' ? t('emptyPaused') : t('emptyDefault')}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredGroups.map((group) => (
            <div
              key={group.symbol}
              className="rounded-2xl border border-border/40 bg-card/30 overflow-hidden"
            >
              {/* Stock header */}
              <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border/30 bg-muted/20">
                <CompanyLogo
                  name={group.companyName ?? group.symbol}
                  ticker={group.symbol}
                  logoUrl={null}
                  size={26}
                  className="rounded-md"
                />
                <span className="font-mono font-bold text-sm text-foreground leading-none">
                  {group.symbol}
                </span>
                {group.companyName && (
                  <span className="text-xs text-muted-foreground/80 truncate leading-none">
                    {group.companyName}
                  </span>
                )}
                <span className="ml-auto text-[11px] font-mono text-muted-foreground/80 shrink-0">
                  {t('conditionCount', { count: group.alerts.length })}
                </span>
                <button
                  type="button"
                  onClick={() => onAddCondition(group.symbol, group.companyName)}
                  className="h-6 w-6 shrink-0 rounded flex items-center justify-center text-muted-foreground/80 hover:text-foreground hover:bg-muted/60 transition-colors"
                  title={t('addConditionTo', { symbol: group.symbol })}
                  aria-label={t('addConditionTo', { symbol: group.symbol })}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Sub-alert rows */}
              <div className="divide-y divide-border/20">
                {group.alerts.map((alert) => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    onToggle={onToggle}
                    onDelete={onDelete}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
