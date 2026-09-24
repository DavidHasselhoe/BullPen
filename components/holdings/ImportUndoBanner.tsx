'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2, RotateCcw, X } from 'lucide-react';

interface RecentImport {
  id: string;
  status: 'done' | 'failed';
  file_name: string | null;
  applied_count: number;
  committed_at: string | null;
}

/** Per-viewer dismissal. Losing it just means the banner comes back once. */
const DISMISSED_KEY = 'bullpen:dismissed-import-undo';

function readDismissed(): string | null {
  try {
    return window.localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

function writeDismissed(importId: string) {
  try {
    window.localStorage.setItem(DISMISSED_KEY, importId);
  } catch {
    // Private window or blocked storage — the banner reappearing is harmless.
  }
}

/**
 * Offers a one-click reversal of the most recent import, for the 24 hours
 * after it commits. The whole point is the moment right after a bad import
 * lands, when the alternative is unpicking dozens of positions by hand.
 */
export function ImportUndoBanner() {
  const { t } = useTranslation('holdings');
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : readDismissed()
  );
  const [undoing, setUndoing] = useState(false);
  const [undoneCount, setUndoneCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery<{ import: RecentImport | null }>({
    queryKey: ['recent-import'],
    queryFn: async () => {
      const res = await fetch('/api/holdings/import/recent');
      if (!res.ok) return { import: null };
      return res.json();
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const recent = data?.import ?? null;

  if (undoneCount != null) {
    return (
      <div
        role="status"
        className="flex items-center gap-2 rounded-xl border border-border/40 px-4 py-3 text-xs text-muted-foreground"
      >
        <RotateCcw className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium text-foreground">{t('importUndoneTitle')}</span>
        <span>{t('importUndoneBody', { count: undoneCount })}</span>
      </div>
    );
  }

  if (!recent || recent.id === dismissed) return null;

  async function handleUndo(importId: string) {
    setUndoing(true);
    setError(null);
    try {
      const res = await fetch(`/api/holdings/import/${importId}/undo`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? t('importUndoFailed'));
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
      queryClient.invalidateQueries({ queryKey: ['holdings-quotes'] });
      queryClient.invalidateQueries({ queryKey: ['recent-import'] });
      setUndoneCount(body.revertedCount ?? 0);
    } catch {
      setError(t('importUndoFailed'));
    } finally {
      setUndoing(false);
    }
  }

  function handleDismiss(importId: string) {
    writeDismissed(importId);
    setDismissed(importId);
  }

  return (
    <div role="status" className="rounded-xl border border-border/40 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground">
            {t('importUndoBannerTitle', { count: recent.applied_count })}
          </p>
          {recent.file_name && (
            <p className="truncate text-xs text-muted-foreground mt-0.5">{recent.file_name}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleUndo(recent.id)} disabled={undoing}>
            {undoing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            {undoing ? t('importUndoing') : t('importUndoAction')}
          </Button>
          <button
            type="button"
            onClick={() => handleDismiss(recent.id)}
            aria-label={t('importUndoDismiss')}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {error && (
        <p className="mt-3 flex items-start gap-1.5 border-t border-border/40 pt-3 text-xs text-amber-600 dark:text-amber-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
