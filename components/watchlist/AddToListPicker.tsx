'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bookmark, BookmarkCheck, ChevronDown, Check, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useWatchlist, useWatchlistLists, useAddToWatchlist, useRemoveFromWatchlist } from '@/hooks/use-watchlist';
import { useWatchlistLimits } from '@/hooks/use-watchlist-limits';
import { useSignupGate, useResumeAction } from '@/components/auth/SignupGate';
import { CreateListDialog } from '@/components/watchlist/CreateListDialog';
import { PaywallDialog } from '@/components/watchlist/PaywallDialog';

interface AddToListPickerProps {
  symbol: string;
  companyName: string;
}

/**
 * Watch button for a stock or asset page. A stock lives in exactly one list
 * (user_watchlist is unique on user + symbol), so the menu is a single choice:
 * the check marks the list it is in, picking another list moves it there.
 */
export function AddToListPicker({ symbol, companyName }: AddToListPickerProps) {
  const { t } = useTranslation('watchlist');
  const symUp = symbol.toUpperCase();
  const { data: lists } = useWatchlistLists();
  const { data: watchlist } = useWatchlist();
  const current = watchlist?.find((w) => w.symbol === symUp);
  const isWatched = !!current;
  const currentList = lists?.find((l) => l.id === current?.list_id);
  const addToWatchlist = useAddToWatchlist();
  const removeFromWatchlist = useRemoveFromWatchlist();
  const { canCreateList } = useWatchlistLimits();
  const [createOpen, setCreateOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const { isAuthenticated } = useAuth();
  const openGate = useSignupGate();
  // Signed up from this button: add the stock they asked for (no list
  // given, so the API uses their first list, creating it if needed).
  useResumeAction('watch', (value) => {
    if (value !== symUp) return false;
    if (!isWatched) addToWatchlist.mutate({ symbol, company_name: companyName });
    return true;
  });

  // Signed out, the add can only fail (401). It used to flip to "Watching"
  // anyway and save nothing; now it is the moment to offer an account.
  if (!isAuthenticated) {
    // Straight to the sign-up dialog with the same promise the popover made
    // (SignupGate); the popover was one more click to a separate page.
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => openGate({ source: 'watch', context: t('watchlistSignInPrompt', { ticker: symUp }), resume: `watch:${symUp}` })}
      >
        <Bookmark className="h-4 w-4" />
        {t('watchlistWatch')}
      </Button>
    );
  }

  const busy = addToWatchlist.isPending || removeFromWatchlist.isPending;
  const addTo = (listId: string) => addToWatchlist.mutate({ symbol, company_name: companyName, listId });

  // No lists yet: nothing to choose between, so one click adds and the API
  // creates their first list.
  if (!isWatched && lists !== undefined && lists.length === 0) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        disabled={busy}
        onClick={() => addToWatchlist.mutate({ symbol, company_name: companyName })}
      >
        <Bookmark className="h-4 w-4" />
        {t('watchlistWatch')}
      </Button>
    );
  }

  return (
    <>
      {/* modal={false}: a modal menu blocks clicks on the rest of the page. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant={isWatched ? 'default' : 'outline'} size="sm" className="gap-2" disabled={busy}>
            {isWatched ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
            {isWatched ? t('watchlistWatching') : t('watchlistWatch')}
            {currentList?.color && (
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: currentList.color }} aria-hidden />
            )}
            <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {isWatched ? t('watchlistPickerMoveHeading', { ticker: symUp }) : t('watchlistPickerAddHeading', { ticker: symUp })}
          </DropdownMenuLabel>
          {(lists ?? []).map((list) => {
            const selected = list.id === current?.list_id;
            return (
              <DropdownMenuItem
                key={list.id}
                role="menuitemradio"
                aria-checked={selected}
                onSelect={() => { if (!selected) addTo(list.id); }}
                className="gap-2 py-2"
              >
                <span
                  className={cn('h-2 w-2 shrink-0 rounded-full', !list.color && 'border border-muted-foreground/50')}
                  style={list.color ? { backgroundColor: list.color } : undefined}
                  aria-hidden
                />
                <span className={cn('flex-1 truncate', selected && 'font-medium')}>{list.name}</span>
                {selected
                  ? <Check className="h-4 w-4 text-foreground" aria-hidden />
                  : <span className="text-xs tabular-nums text-muted-foreground">{list.item_count}</span>}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => (canCreateList ? setCreateOpen(true) : setPaywallOpen(true))}
            className="gap-2 py-2"
          >
            <Plus className="h-4 w-4" aria-hidden />
            {t('watchlistPickerNewList')}
          </DropdownMenuItem>
          {isWatched && (
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => removeFromWatchlist.mutate({ symbol })}
              className="gap-2 py-2"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              {t('watchlistPickerRemove')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* A list made from here gets the stock straight away (moved there if it was already watched). */}
      <CreateListDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={addTo} />
      <PaywallDialog open={paywallOpen} onOpenChange={setPaywallOpen} />
    </>
  );
}
