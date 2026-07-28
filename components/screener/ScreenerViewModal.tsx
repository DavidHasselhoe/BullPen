'use client';

import { useEffect, useReducer, useRef } from 'react';
import { X, Search, Plus } from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  useCreateScreenerView,
  useUpdateScreenerView,
  type ScreenerView,
} from '@/hooks/use-screener-views';
import { SP500_TICKERS } from '@/lib/market-data/sp500';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pass a view to edit it; omit to create a new one */
  editingView?: ScreenerView | null;
  onCreated?: (view: ScreenerView) => void;
}

type FormState = { name: string; tickers: string[]; search: string; error: string };
type FormAction =
  | { type: 'reset'; name: string; tickers: string[] }
  | { type: 'setName'; name: string }
  | { type: 'setSearch'; search: string }
  | { type: 'addTicker'; ticker: string }
  | { type: 'removeTicker'; ticker: string }
  | { type: 'setError'; error: string };

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'reset': return { name: action.name, tickers: action.tickers, search: '', error: '' };
    case 'setName': return { ...state, name: action.name, error: '' };
    case 'setSearch': return { ...state, search: action.search };
    case 'addTicker': return state.tickers.includes(action.ticker)
      ? state
      : { ...state, tickers: [...state.tickers, action.ticker], search: '' };
    case 'removeTicker': return { ...state, tickers: state.tickers.filter((t) => t !== action.ticker) };
    case 'setError': return { ...state, error: action.error };
  }
}

export function ScreenerViewModal({ open, onOpenChange, editingView, onCreated }: Props) {
  const isEditing = !!editingView;

  const [form, dispatch] = useReducer(formReducer, { name: '', tickers: [], search: '', error: '' });

  const createView = useCreateScreenerView();
  const updateView = useUpdateScreenerView();
  const isPending = createView.isPending || updateView.isPending;

  const nameRef = useRef<HTMLInputElement>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (!open) return;
    dispatch({ type: 'reset', name: editingView?.name ?? '', tickers: editingView?.tickers ?? [] });
    setTimeout(() => nameRef.current?.focus(), 50);
  }, [open, editingView]);

  const { name, tickers, search, error } = form;

  // Filter SP500 tickers by search, exclude already-added ones
  const suggestions = search.trim().length > 0
    ? SP500_TICKERS
        .filter((t) =>
          t.includes(search.trim().toUpperCase()) &&
          !tickers.includes(t)
        )
        .slice(0, 8)
    : [];

  const handleSave = async () => {
    dispatch({ type: 'setError', error: '' });
    const trimmedName = name.trim();
    if (!trimmedName) { dispatch({ type: 'setError', error: 'Please enter a name for this view.' }); return; }
    if (tickers.length === 0) { dispatch({ type: 'setError', error: 'Add at least one stock.' }); return; }

    try {
      if (isEditing && editingView) {
        await updateView.mutateAsync({ id: editingView.id, name: trimmedName, tickers });
      } else {
        const created = await createView.mutateAsync({ name: trimmedName, tickers });
        onCreated?.(created);
      }
      onOpenChange(false);
    } catch (e) {
      dispatch({ type: 'setError', error: e instanceof Error ? e.message : 'Something went wrong.' });
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm animate-brief-overlay-in" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
            'w-[92vw] max-w-md bg-card border border-border/50 rounded-2xl shadow-2xl',
            'flex flex-col outline-none animate-brief-modal-in'
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            {isEditing ? 'Edit view' : 'New view'}
          </DialogPrimitive.Title>

          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border/30">
            <h2 className="text-sm font-semibold text-foreground">
              {isEditing ? 'Edit view' : 'New view'}
            </h2>
            <DialogPrimitive.Close className="text-muted-foreground/85 hover:text-foreground transition-colors p-1 rounded-lg hover:bg-muted/40">
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>

          <div className="px-5 py-4 space-y-4">
            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/85">
                Name
              </label>
              <Input
                ref={nameRef}
                value={name}
                onChange={(e) => dispatch({ type: 'setName', name: e.target.value })}
                placeholder="e.g. My Tech Picks"
                maxLength={60}
                className="h-9 text-sm"
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              />
            </div>

            {/* Ticker search */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/85">
                Stocks
              </label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/85" />
                <Input
                  value={search}
                  onChange={(e) => dispatch({ type: 'setSearch', search: e.target.value })}
                  placeholder="Search S&P 500 tickers…"
                  className="h-9 pl-8 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && suggestions.length > 0) {
                      dispatch({ type: 'addTicker', ticker: suggestions[0] });
                    }
                  }}
                />
              </div>

              {/* Suggestions dropdown */}
              {suggestions.length > 0 && (
                <div className="border border-border/40 rounded-lg overflow-hidden bg-popover shadow-md">
                  {suggestions.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => dispatch({ type: 'addTicker', ticker: t })}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/60 transition-colors text-left"
                    >
                      <Plus className="h-3 w-3 text-muted-foreground/85 shrink-0" />
                      <span className="font-mono font-semibold text-foreground">{t}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Added tickers */}
              {tickers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1 max-h-32 overflow-y-auto">
                  {tickers.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/60 border border-border/40 text-xs font-mono font-medium text-foreground"
                    >
                      {t}
                      <button
                        type="button"
                        onClick={() => dispatch({ type: 'removeTicker', ticker: t })}
                        className="text-muted-foreground/85 hover:text-foreground transition-colors ml-0.5"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {tickers.length === 0 && search.trim() === '' && (
                <p className="text-[11px] text-muted-foreground/85 pt-0.5">
                  Search and add stocks from the S&amp;P 500 universe.
                </p>
              )}
            </div>

            {/* Error */}
            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 px-5 pb-5 pt-1">
            <span className="text-[11px] text-muted-foreground/85 tabular-nums">
              {tickers.length} stock{tickers.length !== 1 ? 's' : ''}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="h-8 text-xs">
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={isPending} className="h-8 text-xs">
                {isPending ? 'Saving…' : isEditing ? 'Save changes' : 'Create view'}
              </Button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
