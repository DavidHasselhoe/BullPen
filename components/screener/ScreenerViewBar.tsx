'use client';

import { useRef, useState } from 'react';
import { Plus, ChevronDown, Pencil, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useWatchlist, useWatchlistLists } from '@/hooks/use-watchlist';
import {
  useScreenerViews,
  useCreateScreenerView,
  useUpdateScreenerView,
  useDeleteScreenerView,
  type ScreenerView,
} from '@/hooks/use-screener-views';
import { useAuth } from '@/hooks/use-auth';

export type ActiveView =
  | { type: 'sp500' }
  | { type: 'watchlist'; listId: string | null }
  | { type: 'custom'; view: ScreenerView };

interface Props {
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
}

const pillBase =
  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 whitespace-nowrap select-none';
const pillActive = 'bg-primary text-primary-foreground shadow-sm';
const pillInactive =
  'text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-border/40 hover:border-border/70';

/** Inline rename input — uncontrolled so re-renders can't wipe the typed value */
function RenamePill({
  view,
  isActive,
  onDone,
  onViewChange,
}: {
  view: ScreenerView;
  isActive: boolean;
  onDone: () => void;
  onViewChange: (v: ActiveView) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const updateView = useUpdateScreenerView();
  const didSave = useRef(false);

  const save = async () => {
    if (didSave.current) return;
    didSave.current = true;
    const trimmed = (inputRef.current?.value ?? '').trim();
    if (trimmed && trimmed !== view.name) {
      await updateView.mutateAsync({ id: view.id, name: trimmed }).catch(() => {});
    }
    onDone();
  };

  return (
    <span
      className={cn(pillBase, isActive ? pillActive : pillInactive, 'gap-0 px-1.5')}
      onClick={() => onViewChange({ type: 'custom', view })}
    >
      <input
        ref={inputRef}
        autoFocus
        defaultValue={view.name}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); save(); }
          if (e.key === 'Escape') { didSave.current = true; onDone(); }
          e.stopPropagation();
        }}
        onClick={(e) => e.stopPropagation()}
        className="bg-transparent outline-none w-28 text-xs font-medium placeholder:text-current/40"
        maxLength={60}
        placeholder="View name…"
      />
    </span>
  );
}

export function ScreenerViewBar({ activeView, onViewChange }: Props) {
  const { isAuthenticated } = useAuth();
  const { data: watchlistItems = [] } = useWatchlist();
  const { data: watchlistLists = [] } = useWatchlistLists();
  const { data: customViews = [] } = useScreenerViews();
  const createView = useCreateScreenerView();
  const deleteView = useDeleteScreenerView();

  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const isActive = (v: ActiveView) => {
    if (v.type !== activeView.type) return false;
    if (v.type === 'watchlist' && activeView.type === 'watchlist') return v.listId === activeView.listId;
    if (v.type === 'custom' && activeView.type === 'custom') return v.view.id === activeView.view.id;
    return true;
  };

  const handleCreate = async () => {
    const name = `View ${customViews.length + 1}`;
    try {
      const view = await createView.mutateAsync({ name, tickers: [] });
      onViewChange({ type: 'custom', view });
      // Start rename mode immediately
      setRenamingId(view.id);
    } catch {}
  };

  const handleDelete = async (e: React.MouseEvent, view: ScreenerView) => {
    e.stopPropagation();
    if (activeView.type === 'custom' && activeView.view.id === view.id) {
      onViewChange({ type: 'sp500' });
    }
    await deleteView.mutateAsync(view.id);
  };

  const activeWatchlistLabel = () => {
    if (activeView.type !== 'watchlist') return 'Watchlist';
    if (!activeView.listId) return 'Watchlist';
    return watchlistLists.find((l) => l.id === activeView.listId)?.name ?? 'Watchlist';
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* S&P 500 */}
      <button
        onClick={() => onViewChange({ type: 'sp500' })}
        className={cn(pillBase, isActive({ type: 'sp500' }) ? pillActive : pillInactive)}
      >
        S&amp;P 500
      </button>

      {/* Watchlist */}
      {isAuthenticated && watchlistItems.length > 0 && (
        watchlistLists.length > 0 ? (
          <DropdownMenu open={watchlistOpen} onOpenChange={setWatchlistOpen}>
            <DropdownMenuTrigger asChild>
              <button className={cn(pillBase, activeView.type === 'watchlist' ? pillActive : pillInactive)}>
                {activeWatchlistLabel()}
                <ChevronDown className="h-3 w-3 opacity-70" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem
                onClick={() => { onViewChange({ type: 'watchlist', listId: null }); setWatchlistOpen(false); }}
                className="text-xs"
              >
                All watchlists
                <span className="ml-auto text-[10px] text-muted-foreground/60">{watchlistItems.length}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {watchlistLists.map((list) => (
                <DropdownMenuItem
                  key={list.id}
                  onClick={() => { onViewChange({ type: 'watchlist', listId: list.id }); setWatchlistOpen(false); }}
                  className="text-xs"
                >
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: list.color ?? '#888' }} />
                  {list.name}
                  <span className="ml-auto text-[10px] text-muted-foreground/60">
                    {watchlistItems.filter((i) => i.list_id === list.id).length}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <button
            onClick={() => onViewChange({ type: 'watchlist', listId: null })}
            className={cn(pillBase, isActive({ type: 'watchlist', listId: null }) ? pillActive : pillInactive)}
          >
            Watchlist
          </button>
        )
      )}

      {/* Custom views */}
      {customViews.map((view) => {
        const active = isActive({ type: 'custom', view });
        if (renamingId === view.id) {
          return (
            <RenamePill
              key={view.id}
              view={view}
              isActive={active}
              onDone={() => setRenamingId(null)}
              onViewChange={onViewChange}
            />
          );
        }
        return (
          <div key={view.id} className="relative group flex items-center">
            <button
              onClick={() => onViewChange({ type: 'custom', view })}
              className={cn(pillBase, active ? pillActive : pillInactive, 'pr-14')}
            >
              {view.name}
              {view.tickers.length > 0 && (
                <span className={cn('text-[10px] opacity-60', active ? 'text-primary-foreground' : 'text-muted-foreground')}>
                  {view.tickers.length}
                </span>
              )}
            </button>

            {/* Pencil (rename) + delete menu — visible on hover or when active */}
            <div className={cn(
              'absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5',
              'opacity-0 group-hover:opacity-100 transition-opacity',
              active && 'opacity-100'
            )}>
              <button
                type="button"
                title="Rename"
                onClick={(e) => { e.stopPropagation(); setRenamingId(view.id); }}
                className={cn(
                  'h-5 w-5 rounded flex items-center justify-center transition-colors',
                  active
                    ? 'text-primary-foreground/60 hover:text-primary-foreground hover:bg-white/15'
                    : 'text-muted-foreground/60 hover:text-foreground hover:bg-muted'
                )}
              >
                <Pencil className="h-2.5 w-2.5" />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                      'h-5 w-5 rounded flex items-center justify-center transition-colors',
                      active
                        ? 'text-primary-foreground/60 hover:text-primary-foreground hover:bg-white/15'
                        : 'text-muted-foreground/60 hover:text-foreground hover:bg-muted'
                    )}
                  >
                    <ChevronDown className="h-2.5 w-2.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-32">
                  <DropdownMenuItem className="text-xs gap-2" onClick={() => setRenamingId(view.id)}>
                    <Pencil className="h-3 w-3" /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-xs gap-2 text-destructive focus:text-destructive"
                    onClick={(e) => handleDelete(e, view)}
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        );
      })}

      {/* + New view */}
      {isAuthenticated && (
        <button
          onClick={handleCreate}
          disabled={createView.isPending}
          className={cn(pillBase, pillInactive, 'border-dashed')}
        >
          <Plus className="h-3 w-3" />
          {createView.isPending ? 'Creating…' : 'New view'}
        </button>
      )}
    </div>
  );
}
