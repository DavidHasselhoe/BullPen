'use client';

import { useState } from 'react';
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
  const createList = useCreateWatchlistList();
  const addItem = useAddToWatchlist();
  const [addingId, setAddingId] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(t: WatchlistTemplate) {
    if (addingId) return;
    setError(null);
    setAddingId(t.id);
    try {
      const res = await createList.mutateAsync({ name: t.name, color: t.color });
      if (!res.success || !res.list) {
        if (res.status === 403) setShowPaywall(true);
        else setError(res.error ?? 'Could not create the list. Please try again.');
        return;
      }
      const listId = res.list.id;
      // Best-effort: add every symbol; one failure shouldn't abort the rest.
      await Promise.allSettled(
        t.symbols.map((s) => addItem.mutateAsync({ symbol: s.symbol, company_name: s.name, listId }))
      );
      onCreated?.(listId);
      onOpenChange(false);
    } catch {
      setError('Could not create the list. Please try again.');
    } finally {
      setAddingId(null);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Starter watchlists</DialogTitle>
            <DialogDescription>
              Add a ready-made list, then rename, add, or remove stocks however you like — these are
              just suggestions to get you going.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
              {error}
            </p>
          )}

          <div className="grid gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            {WATCHLIST_TEMPLATES.map((t) => {
              const busy = addingId === t.id;
              const preview = t.symbols.slice(0, 6);
              const extra = t.symbols.length - preview.length;
              return (
                <div
                  key={t.id}
                  className="flex flex-col gap-3 rounded-xl border border-border bg-card/50 p-4"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: t.color }}
                      />
                      <span className="truncate text-sm font-semibold text-foreground">{t.name}</span>
                      <span className="shrink-0 text-[11px] font-medium text-muted-foreground tabular-nums">
                        {t.symbols.length}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.description}</p>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {preview.map((s) => (
                      <span
                        key={s.symbol}
                        className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums"
                      >
                        {s.symbol}
                      </span>
                    ))}
                    {extra > 0 && (
                      <span className="px-1 py-0.5 text-[10px] font-medium text-muted-foreground/60">
                        +{extra} more
                      </span>
                    )}
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-auto w-full"
                    onClick={() => handleAdd(t)}
                    disabled={!!addingId}
                  >
                    {busy ? (
                      <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Adding…</>
                    ) : (
                      <><Plus className="mr-1.5 h-3.5 w-3.5" />Add to my watchlists</>
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
