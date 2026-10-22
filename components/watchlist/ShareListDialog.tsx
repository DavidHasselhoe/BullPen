'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, ExternalLink, Loader2, Share2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useShareWatchlistList, type WatchlistList } from '@/hooks/use-watchlist';
import { trackEvent } from '@/lib/analytics/track';
import { cn } from '@/lib/utils';

/**
 * Opt-in sharing of one list as a read-only public page (/lists/<token>).
 * Says exactly what a visitor sees before anything is made public, and
 * stopping kills the link for good.
 */
export function ShareListDialog({ list }: { list: WatchlistList }) {
  const { t } = useTranslation('watchlist');
  const share = useShareWatchlistList();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = list.share_token ?? null;
  const url = token && typeof window !== 'undefined' ? `${window.location.origin}/lists/${token}` : '';

  const toggle = async (on: boolean) => {
    setError(null);
    try {
      await share.mutateAsync({ listId: list.id, share: on });
      trackEvent(on ? 'watchlist_list_shared' : 'watchlist_list_unshared');
    } catch {
      setError(t('shareError'));
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      trackEvent('watchlist_share_link_copied');
    } catch {
      // Clipboard refused (permissions, an embedded view): the field is selectable.
      (document.getElementById('share-list-url') as HTMLInputElement | null)?.select();
    }
  };

  return (
    <Dialog onOpenChange={() => { setError(null); setCopied(false); }}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium transition-colors hover:bg-muted',
            token ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
          title={t('shareButtonTitle', { name: list.name })}
          aria-label={t('shareButtonTitle', { name: list.name })}
        >
          <Share2 className={cn('h-4 w-4', token && 'text-primary')} />
          <span className="sr-only sm:not-sr-only">{token ? t('shareButtonShared') : t('shareButtonLabel')}</span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('shareTitle', { name: list.name })}</DialogTitle>
          <DialogDescription>{t('shareWhatVisitorsSee')}</DialogDescription>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">{t('shareWhatStaysPrivate')}</p>

        {token ? (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <Input id="share-list-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label={t('shareLinkLabel')} className="font-mono text-xs" />
              <Button type="button" variant="outline" onClick={copy} className="shrink-0 gap-1.5">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? t('shareCopied') : t('shareCopy')}
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:text-primary/80">
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                {t('shareOpenPage')}
              </a>
              <Button type="button" variant="ghost" size="sm" disabled={share.isPending} onClick={() => toggle(false)} className="text-destructive hover:bg-destructive/10 hover:text-destructive">
                {share.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {t('shareStop')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('shareStopHint')}</p>
          </div>
        ) : (
          <Button type="button" disabled={share.isPending} onClick={() => toggle(true)} className="w-fit gap-2">
            {share.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
            {t('shareCreate')}
          </Button>
        )}

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
