'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Check, Copy, Gift, Share2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface InviteInfo {
  url: string;
  joined: number;
  monthsEarned: number;
}

/**
 * The account's personal invite link. A friend who signs up through it and
 * the sender each get a month of Pro; the limits (new accounts only, 3 months
 * per 30 days, 12 in total) live in record_referral, migration 173.
 */
export function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation('navigation');
  const [copied, setCopied] = useState(false);

  const { data, isLoading, isError } = useQuery<InviteInfo>({
    queryKey: ['invite-link'],
    queryFn: async () => {
      const res = await fetch('/api/invite');
      if (!res.ok) throw new Error('invite');
      return res.json();
    },
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copy = async () => {
    if (!data) return;
    await navigator.clipboard.writeText(data.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const share = async () => {
    if (!data) return;
    try {
      await navigator.share({ title: t('inviteShareTitle'), text: t('inviteShareText'), url: data.url });
    } catch {
      // Dismissed share sheet: nothing to do.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Gift className="h-5 w-5 text-primary" aria-hidden />
          </div>
          <DialogTitle>{t('inviteTitle')}</DialogTitle>
          <DialogDescription>{t('inviteDescription')}</DialogDescription>
        </DialogHeader>

        {isError ? (
          <p className="text-sm text-muted-foreground">{t('inviteLoadError')}</p>
        ) : (
          <div className="space-y-3">
            <label htmlFor="invite-link" className="sr-only">{t('inviteLinkLabel')}</label>
            <div className="flex gap-2">
              <Input
                id="invite-link"
                readOnly
                value={data?.url ?? ''}
                placeholder={isLoading ? t('inviteLoading') : ''}
                onFocus={(e) => e.currentTarget.select()}
                className="min-h-11 font-mono text-xs"
              />
              <Button onClick={copy} disabled={!data} variant="outline" className="min-h-11 shrink-0" aria-live="polite">
                {copied ? <Check className="mr-1.5 h-4 w-4" aria-hidden /> : <Copy className="mr-1.5 h-4 w-4" aria-hidden />}
                {copied ? t('inviteCopied') : t('inviteCopy')}
              </Button>
            </div>
            {canNativeShare && (
              <Button onClick={share} disabled={!data} className="min-h-11 w-full">
                <Share2 className="mr-1.5 h-4 w-4" aria-hidden />
                {t('inviteShare')}
              </Button>
            )}
            {data && data.joined > 0 && (
              <p className="text-xs text-muted-foreground">
                {t('inviteStats', { count: data.joined, months: data.monthsEarned })}
              </p>
            )}
            <p className="text-xs text-muted-foreground">{t('inviteLimits')}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
