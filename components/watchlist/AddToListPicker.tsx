'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bookmark, BookmarkCheck, ChevronDown, Check, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useListMembership, type WatchlistList } from '@/hooks/use-watchlist';
import { useWatchlistLimits } from '@/hooks/use-watchlist-limits';
import { useSignupGate, useResumeAction } from '@/components/auth/SignupGate';
import { CreateListDialog } from '@/components/watchlist/CreateListDialog';
import { PaywallDialog } from '@/components/watchlist/PaywallDialog';

interface AddToListPickerProps {
  symbol: string;
  companyName: string;
}

/**
 * Watch button for a stock or asset page. A stock can be in any number of
 * lists (one user_watchlist row per list), so the menu is a set of checkboxes
 * that stays open while you tick several. Unticking the last list unwatches it.
 */
export function AddToListPicker({ symbol, companyName }: AddToListPickerProps) {
  const { t } = useTranslation('watchlist');
  const symUp = symbol.toUpperCase();
  const { lists, inLists, isWatched, isPending, addTo, toggle } = useListMembership(symbol, companyName);
  const memberLists = (lists ?? []).filter((l) => inLists.has(l.id));
  const { canCreateList } = useWatchlistLimits();
  const [createOpen, setCreateOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const { isAuthenticated } = useAuth();
  const openGate = useSignupGate();
  // Signed up from this button: add the stock they asked for (no list
  // given, so the API uses their first list, creating it if needed).
  useResumeAction('watch', (value) => {
    if (value !== symUp) return false;
    if (!isWatched) addTo();
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

  // No lists yet: nothing to choose between, so one click adds and the API
  // creates their first list.
  if (!isWatched && lists !== undefined && lists.length === 0) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        disabled={isPending}
        onClick={() => addTo()}
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
          <Button variant={isWatched ? 'default' : 'outline'} size="sm" className="gap-2">
            {isWatched ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
            {isWatched ? t('watchlistWatching') : t('watchlistWatch')}
            {memberLists.some((l) => l.color) && (
              <span className="flex -space-x-0.5" aria-hidden>
                {memberLists.filter((l) => l.color).slice(0, 3).map((l) => (
                  <span key={l.id} className="h-2 w-2 shrink-0 rounded-full ring-1 ring-background" style={{ backgroundColor: l.color! }} />
                ))}
              </span>
            )}
            <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {isWatched ? t('watchlistPickerInHeading', { ticker: symUp }) : t('watchlistPickerAddHeading', { ticker: symUp })}
          </DropdownMenuLabel>
          {(lists ?? []).map((list) => {
            const selected = inLists.has(list.id);
            return (
              <DropdownMenuItem
                key={list.id}
                role="menuitemcheckbox"
                aria-checked={selected}
                // Stay open so several lists can be ticked in one go.
                onSelect={(e) => {
                  e.preventDefault();
                  toggle(list.id);
                }}
                className="gap-2 py-2"
              >
                <ListRowContent list={list} selected={selected} />
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
        </DropdownMenuContent>
      </DropdownMenu>

      {/* A list made from here gets the stock straight away, alongside any lists it is already in. */}
      <CreateListDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={addTo} />
      <PaywallDialog open={paywallOpen} onOpenChange={setPaywallOpen} />
    </>
  );
}

/** One list as a checkbox row: tick, colour dot, name, stock count. Shared with the company hover card. */
export function ListRowContent({ list, selected }: { list: WatchlistList; selected: boolean }) {
  return (
    <>
      <span
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
          selected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'
        )}
        aria-hidden
      >
        {selected && <Check className="h-3 w-3 text-primary-foreground" />}
      </span>
      <span
        className={cn('h-2 w-2 shrink-0 rounded-full', !list.color && 'border border-muted-foreground/50')}
        style={list.color ? { backgroundColor: list.color } : undefined}
        aria-hidden
      />
      <span className={cn('flex-1 truncate', selected && 'font-medium')}>{list.name}</span>
      <span className="text-xs tabular-nums text-muted-foreground">{list.item_count}</span>
    </>
  );
}
