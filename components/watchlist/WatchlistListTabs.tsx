'use client';

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WatchlistList } from '@/hooks/use-watchlist';
import { useUpdateWatchlistList, useDeleteWatchlistList } from '@/hooks/use-watchlist';
import { CreateListDialog } from '@/components/watchlist/CreateListDialog';
import { PaywallDialog } from '@/components/watchlist/PaywallDialog';
import { useWatchlistLimits } from '@/hooks/use-watchlist-limits';

interface WatchlistListTabsProps {
  lists: WatchlistList[];
  activeListId: string | null;
  onSelect: (listId: string | null) => void;
  onListCreated: (listId: string) => void;
  onListDeleted?: (deletedId: string) => void;
}

/** Inline rename — uncontrolled so re-renders can't wipe the typed value */
function RenameInput({
  list,
  isActive,
  onDone,
}: {
  list: WatchlistList;
  isActive: boolean;
  onDone: () => void;
}) {
  const { t } = useTranslation('watchlist');
  const inputRef = useRef<HTMLInputElement>(null);
  const updateList = useUpdateWatchlistList();
  const didSave = useRef(false);

  const save = async () => {
    if (didSave.current) return;
    didSave.current = true;
    const trimmed = (inputRef.current?.value ?? '').trim();
    if (trimmed && trimmed !== list.name) {
      await updateList.mutateAsync({ listId: list.id, name: trimmed }).catch(() => {});
    }
    onDone();
  };

  return (
    <input
      ref={inputRef}
      autoFocus
      defaultValue={list.name}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); save(); }
        if (e.key === 'Escape') { didSave.current = true; onDone(); }
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'bg-transparent outline-none w-28 text-sm font-medium border-b',
        isActive ? 'border-primary-foreground/50 text-primary-foreground' : 'border-muted-foreground/50'
      )}
      maxLength={60}
      placeholder={t('watchlistRenamePlaceholder')}
    />
  );
}

export function WatchlistListTabs({
  lists,
  activeListId,
  onSelect,
  onListCreated,
  onListDeleted,
}: WatchlistListTabsProps) {
  const { t } = useTranslation('watchlist');
  const [createOpen, setCreateOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const { canCreateList } = useWatchlistLimits();
  const deleteList = useDeleteWatchlistList();

  function handleNewList() {
    if (canCreateList) {
      setCreateOpen(true);
    } else {
      setPaywallOpen(true);
    }
  }

  async function handleDelete(e: React.MouseEvent, list: WatchlistList) {
    e.stopPropagation();
    // If deleting the active list, navigate away first
    if (activeListId === list.id) onSelect(null);
    await deleteList.mutateAsync(list.id);
    onListDeleted?.(list.id);
  }

  return (
    <>
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {lists.map((list) => {
          const isActive = activeListId === list.id;
          const isRenaming = renamingId === list.id;

          return (
            <div
              key={list.id}
              className={cn(
                'group relative flex items-center gap-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
                isRenaming ? 'px-3 py-1.5' : 'pr-16 pl-3 py-1.5',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {list.color && (
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: list.color }}
                />
              )}

              {isRenaming ? (
                <RenameInput
                  list={list}
                  isActive={isActive}
                  onDone={() => setRenamingId(null)}
                />
              ) : (
                <button
                  onClick={() => onSelect(list.id)}
                  className="flex items-center gap-1.5 min-w-0"
                  title={t('watchlistTabTitle')}
                >
                  <span className="truncate max-w-[160px]">{list.name}</span>
                  <span className={cn(
                    'text-xs px-1.5 py-0.5 rounded-full shrink-0',
                    isActive
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  )}>
                    {list.item_count}
                  </span>
                </button>
              )}

              {/* Pencil + trash — visible on hover or when active */}
              {!isRenaming && (
                <div className={cn(
                  'absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5',
                  'opacity-0 group-hover:opacity-100 transition-opacity',
                  isActive && 'opacity-100'
                )}>
                  <button
                    type="button"
                    title={t('watchlistRenameTitle')}
                    onClick={(e) => { e.stopPropagation(); setRenamingId(list.id); }}
                    className={cn(
                      'h-5 w-5 rounded flex items-center justify-center transition-colors',
                      isActive
                        ? 'text-primary-foreground/60 hover:text-primary-foreground hover:bg-white/15'
                        : 'text-muted-foreground/80 hover:text-foreground hover:bg-muted'
                    )}
                  >
                    <Pencil className="h-2.5 w-2.5" />
                  </button>
                  <button
                    type="button"
                    title={t('watchlistDeleteTitle')}
                    onClick={(e) => handleDelete(e, list)}
                    disabled={deleteList.isPending}
                    className={cn(
                      'h-5 w-5 rounded flex items-center justify-center transition-colors',
                      isActive
                        ? 'text-primary-foreground/60 hover:text-red-300 hover:bg-white/15'
                        : 'text-muted-foreground/80 hover:text-destructive hover:bg-destructive/10'
                    )}
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </button>
                </div>
              )}
            </div>
          );
        })}

        <button
          onClick={handleNewList}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors whitespace-nowrap"
          aria-label={t('watchlistNewList')}
        >
          <Plus className="h-3.5 w-3.5" />
          {t('watchlistNewList')}
        </button>
      </div>

      <CreateListDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => {
          onListCreated(id);
          setCreateOpen(false);
          // Start renaming the new list immediately
          setRenamingId(id);
        }}
      />
      <PaywallDialog open={paywallOpen} onOpenChange={setPaywallOpen} />
    </>
  );
}
