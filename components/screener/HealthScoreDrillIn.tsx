'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { HealthRing, type HealthGrade } from '@/components/finance/HealthRing';
import { CategoryBar } from '@/components/stock/HealthScoreCard';
import type { CategoryScore } from '@/lib/finance/health-score';

interface HealthScoreHistoryResponse {
  success: boolean;
  data?: { categories: CategoryScore[] }[];
}

interface Props {
  ticker: string;
  score: number;
  grade: HealthGrade;
}

/**
 * Health Score column cell — click-to-expand into the same five-pillar
 * breakdown the stock page shows, without a per-row fetch on table render.
 * screener_stats only persists the aggregate score/grade, but
 * health_score_history (written the same time the score is computed) already
 * has the full category breakdown per fiscal quarter, so this reuses that
 * existing route and takes the latest entry — no new backend needed, and no
 * TwelveData credits spent just from hovering table rows.
 */
export function HealthScoreDrillIn({ ticker, score, grade }: Props) {
  const { t } = useTranslation('tools');
  const [categories, setCategories] = useState<CategoryScore[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const handleOpenChange = async (open: boolean) => {
    if (!open || categories !== null || loading) return;
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/stock/${ticker}/health-score/history`);
      const body: HealthScoreHistoryResponse = await res.json();
      const latest = body.success && body.data && body.data.length > 0 ? body.data[body.data.length - 1] : null;
      setCategories(latest?.categories ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popover onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          aria-label={t('screenerHealthDrillInAriaLabel', { ticker })}
        >
          <HealthRing score={score} grade={grade} size={34} className="text-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-2.5 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground">{t('screenerHealthDrillInTitle', { ticker })}</span>
          <span className="text-xs font-semibold tabular-nums text-foreground">
            {score}<span className="text-muted-foreground/80">/100</span>
          </span>
        </div>
        {loading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {!loading && error && (
          <p className="text-xs text-muted-foreground">{t('screenerHealthDrillInError')}</p>
        )}
        {!loading && !error && categories?.length === 0 && (
          <p className="text-xs text-muted-foreground">{t('screenerHealthDrillInEmpty')}</p>
        )}
        {!loading && !error && categories && categories.length > 0 && (
          <div className="space-y-2">
            {categories.map((cat) => <CategoryBar key={cat.name} cat={cat} />)}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
