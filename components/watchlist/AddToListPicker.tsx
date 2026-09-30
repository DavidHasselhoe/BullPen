'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Bookmark, BookmarkCheck, ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useWatchlistLists, useAddToWatchlist, useRemoveFromWatchlist, useIsWatched } from '@/hooks/use-watchlist';

interface AddToListPickerProps {
  symbol: string;
  companyName: string;
}

export function AddToListPicker({ symbol, companyName }: AddToListPickerProps) {
  const { t } = useTranslation('watchlist');
  const [open, setOpen] = useState(false);
  const { data: lists } = useWatchlistLists();
  const isWatched = useIsWatched(symbol);
  const addToWatchlist = useAddToWatchlist();
  const removeFromWatchlist = useRemoveFromWatchlist();
  const { isAuthenticated } = useAuth();
  const pathname = usePathname();

  // Signed out, the add can only fail (401). It used to flip to "Watching"
  // anyway and save nothing; now it is the moment to offer an account.
  if (!isAuthenticated) {
    const back = encodeURIComponent(pathname || '/');
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Bookmark className="h-4 w-4" />
            {t('watchlistWatch')}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 space-y-3 p-4">
          <p className="text-sm text-foreground">{t('watchlistSignInPrompt', { ticker: symbol.toUpperCase() })}</p>
          <div className="flex items-center gap-2">
            <Button asChild size="sm">
              <Link href={`/register?redirect=${back}`}>{t('watchlistSignUp')}</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/login?redirect=${back}`}>{t('watchlistSignIn')}</Link>
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  const multiList = (lists?.length ?? 0) > 1;

  if (!multiList) {
    return (
      <Button
        variant={isWatched ? 'default' : 'outline'}
        size="sm"
        onClick={() => {
          if (isWatched) {
            removeFromWatchlist.mutate({ symbol });
          } else {
            const listId = lists?.[0]?.id;
            addToWatchlist.mutate({ symbol, company_name: companyName, listId });
          }
        }}
        disabled={addToWatchlist.isPending || removeFromWatchlist.isPending}
        className="gap-2"
      >
        {isWatched ? (
          <><BookmarkCheck className="h-4 w-4" />{t('watchlistWatching')}</>
        ) : (
          <><Bookmark className="h-4 w-4" />{t('watchlistWatch')}</>
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
            if (isWatched) removeFromWatchlist.mutate({ symbol });
          }}
          disabled={addToWatchlist.isPending || removeFromWatchlist.isPending}
          className="gap-2 rounded-r-none border-r-0"
        >
          {isWatched ? (
            <><BookmarkCheck className="h-4 w-4" />{t('watchlistWatching')}</>
          ) : (
            <><Bookmark className="h-4 w-4" />{t('watchlistWatch')}</>
          )}
        </Button>
        <Button
          variant={isWatched ? 'default' : 'outline'}
          size="sm"
          onClick={() => setOpen((o) => !o)}
          className="rounded-l-none px-2"
          aria-label={t('watchlistChooseListAriaLabel')}
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
