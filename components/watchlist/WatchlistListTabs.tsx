'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WatchlistList } from '@/hooks/use-watchlist';
import { CreateListDialog } from '@/components/watchlist/CreateListDialog';
import { PaywallDialog } from '@/components/watchlist/PaywallDialog';
import { useWatchlistLimits } from '@/hooks/use-watchlist-limits';

interface WatchlistListTabsProps {
  lists: WatchlistList[];
  activeListId: string | null;
  onSelect: (listId: string) => void;
  onListCreated: (listId: string) => void;
}

export function WatchlistListTabs({ lists, activeListId, onSelect, onListCreated }: WatchlistListTabsProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const { canCreateList } = useWatchlistLimits();

  function handleNewList() {
    if (canCreateList) {
      setCreateOpen(true);
    } else {
      setPaywallOpen(true);
    }
  }

  return (
    <>
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {lists.map((list) => (
          <button
            key={list.id}
            onClick={() => onSelect(list.id)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
              activeListId === list.id
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
            {list.name}
            <span className={cn(
              'text-xs px-1.5 py-0.5 rounded-full',
              activeListId === list.id ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'
            )}>
              {list.item_count}
            </span>
          </button>
        ))}

        <button
          onClick={handleNewList}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors whitespace-nowrap"
          aria-label="New list"
        >
          <Plus className="h-3.5 w-3.5" />
          New list
        </button>
      </div>

      <CreateListDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => {
          onListCreated(id);
          setCreateOpen(false);
        }}
      />
      <PaywallDialog open={paywallOpen} onOpenChange={setPaywallOpen} />
    </>
  );
}
