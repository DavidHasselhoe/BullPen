'use client';

import { useState } from 'react';
import { Bookmark, BookmarkCheck, ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useWatchlistLists, useAddToWatchlist, useRemoveFromWatchlist, useIsWatched } from '@/hooks/use-watchlist';

interface AddToListPickerProps {
  symbol: string;
  companyName: string;
}

export function AddToListPicker({ symbol, companyName }: AddToListPickerProps) {
  const [open, setOpen] = useState(false);
  const { data: lists } = useWatchlistLists();
  const isWatched = useIsWatched(symbol);
  const addToWatchlist = useAddToWatchlist();
  const removeFromWatchlist = useRemoveFromWatchlist();

  const multiList = (lists?.length ?? 0) > 1;

  if (!multiList) {
    return (
      <Button
        variant={isWatched ? 'default' : 'outline'}
        size="sm"
        onClick={() => {
          if (isWatched) {
            removeFromWatchlist.mutate(symbol);
          } else {
            const listId = lists?.[0]?.id;
            addToWatchlist.mutate({ symbol, company_name: companyName, listId });
          }
        }}
        disabled={addToWatchlist.isPending || removeFromWatchlist.isPending}
        className="gap-2"
      >
        {isWatched ? (
          <><BookmarkCheck className="h-4 w-4" />Watching</>
        ) : (
          <><Bookmark className="h-4 w-4" />Watch</>
        )}
      </Button>
    );
  }

  return (
    <div className="relative">
      <div className="flex">
        <Button
          variant={isWatched ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            if (isWatched) removeFromWatchlist.mutate(symbol);
          }}
          disabled={addToWatchlist.isPending || removeFromWatchlist.isPending}
          className="gap-2 rounded-r-none border-r-0"
        >
          {isWatched ? (
            <><BookmarkCheck className="h-4 w-4" />Watching</>
          ) : (
            <><Bookmark className="h-4 w-4" />Watch</>
          )}
        </Button>
        <Button
          variant={isWatched ? 'default' : 'outline'}
          size="sm"
          onClick={() => setOpen((o) => !o)}
          className="rounded-l-none px-2"
          aria-label="Choose watchlist"
        >
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
        </Button>
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-xl border border-border bg-popover shadow-lg overflow-hidden">
            {lists!.map((list) => (
              <button
                key={list.id}
                onClick={() => {
                  addToWatchlist.mutate({ symbol, company_name: companyName, listId: list.id });
                  setOpen(false);
                }}
                className="flex items-center gap-2 w-full px-3 py-2.5 text-left text-sm hover:bg-accent transition-colors"
              >
                {list.color && (
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: list.color }} />
                )}
                <span className="flex-1 truncate">{list.name}</span>
                {list.item_count > 0 && <Check className="h-3.5 w-3.5 text-primary opacity-50" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
