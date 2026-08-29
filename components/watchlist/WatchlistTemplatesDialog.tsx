'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Plus } from 'lucide-react';
import { useCreateWatchlistList, useAddToWatchlist } from '@/hooks/use-watchlist';
import { WATCHLIST_TEMPLATES, type WatchlistTemplate } from '@/lib/watchlist/templates';
import { PaywallDialog } from './PaywallDialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired with the new list id once a template has been added. */
  onCreated?: (listId: string) => void;
}

export function WatchlistTemplatesDialog({ open, onOpenChange, onCreated }: Props) {
  const { t } = useTranslation('watchlist');
  const createList = useCreateWatchlistList();
  const addItem = useAddToWatchlist();
  const [addingId, setAddingId] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(template: WatchlistTemplate) {
    if (addingId) return;
    setError(null);
    setAddingId(template.id);
    try {
      const res = await createList.mutateAsync({ name: template.name, color: template.color });
      if (!res.success || !res.list) {
        if (res.status === 403) setShowPaywall(true);
        else setError(res.error ?? t('templatesGenericError'));
        return;
      }
      const listId = res.list.id;
      // Best-effort: add every symbol; one failure shouldn't abort the rest.
      await Promise.allSettled(
        template.symbols.map((s) => addItem.mutateAsync({ symbol: s.symbol, company_name: s.name, listId }))
      );
      onCreated?.(listId);
      onOpenChange(false);
    } catch {
      setError(t('templatesGenericError'));
    } finally {
      setAddingId(null);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t('templatesTitle')}</DialogTitle>
            <DialogDescription>
              {t('templatesDescription')}
            </DialogDescription>
          </DialogHeader>

          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
              {error}
            </p>
          )}

          <div className="grid gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            {WATCHLIST_TEMPLATES.map((template) => {
              const busy = addingId === template.id;
              const preview = template.symbols.slice(0, 6);
              const extra = template.symbols.length - preview.length;
              return (
                <div
                  key={template.id}
                  className="flex flex-col gap-3 rounded-xl border border-border bg-card/50 p-4"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: template.color }}
                      />
                      <span className="truncate text-sm font-semibold text-foreground">{template.name}</span>
                      <span className="shrink-0 text-[11px] font-medium text-muted-foreground tabular-nums">
                        {template.symbols.length}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{template.description}</p>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {preview.map((s) => (
                      <span
                        key={s.symbol}
                        className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums"
                      >
                        {s.symbol}
                      </span>
                    ))}
                    {extra > 0 && (
                      <span className="px-1 py-0.5 text-[11px] font-medium text-muted-foreground/80">
                        {t('templatesMoreCount', { count: extra })}
                      </span>
                    )}
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-auto w-full"
                    onClick={() => handleAdd(template)}
                    disabled={!!addingId}
                  >
                    {busy ? (
                      <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />{t('templatesAdding')}</>
                    ) : (
                      <><Plus className="mr-1.5 h-3.5 w-3.5" />{t('templatesAddButton')}</>
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <PaywallDialog open={showPaywall} onOpenChange={setShowPaywall} />
    </>
  );
}
