'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Share2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';

interface ShareSheetProps {
  /** True when today's figure doesn't exist yet — disables the trigger with an explanatory tooltip. */
  disabled?: boolean;
}

type Phase = 'idle' | 'creating' | 'ready' | 'error';

export function ShareSheet({ disabled }: ShareSheetProps) {
  const { t } = useTranslation('holdings');
  const [open, setOpen] = useState(false);
  const [includeAmount, setIncludeAmount] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const createShare = async (opts: { includeAmount: boolean; anonymous: boolean }) => {
    setPhase('creating');
    try {
      const res = await fetch('/api/shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts),
      });
      const json = await res.json();
      if (!json.success) {
        setErrorCode(typeof json.error === 'string' ? json.error : null);
        setPhase('error');
        return;
      }
      setShareUrl(json.url);
      setPhase('ready');
    } catch {
      setErrorCode(null);
      setPhase('error');
    }
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next && phase === 'idle') void createShare({ includeAmount, anonymous });
  };

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const handleShare = async () => {
    if (!shareUrl) return;
    if (canNativeShare) {
      try {
        await navigator.share({ url: shareUrl });
      } catch {
        // user cancelled the native share sheet — not an error
      }
      return;
    }
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={disabled}
          title={disabled ? t('shareSheetNotReadyTitle') : t('shareSheetTriggerTitle')}
          aria-label={t('shareSheetTriggerTitle')}
        >
          <Share2 className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-72 space-y-3">
        {phase === 'creating' && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t('shareSheetPreparing')}
          </div>
        )}

        {phase === 'error' && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {errorCode === 'no_data_yet'
              ? t('shareSheetErrorNoData')
              : t('shareSheetErrorGeneric')}
          </p>
        )}

        {phase === 'ready' && shareUrl && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- external OG route, not a static/optimizable local asset */}
            <img
              src={shareUrl.replace('/share/', '/api/og/share/')}
              alt={t('shareSheetPreviewAlt')}
              className="w-full rounded-lg border border-border"
            />

            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{t('shareSheetIncludeAmount')}</span>
              <Switch
                checked={includeAmount}
                onCheckedChange={(checked) => {
                  setIncludeAmount(checked);
                  setPhase('idle');
                  void createShare({ includeAmount: checked, anonymous });
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{t('shareSheetPostAnonymously')}</span>
              <Switch
                checked={anonymous}
                onCheckedChange={(checked) => {
                  setAnonymous(checked);
                  setPhase('idle');
                  void createShare({ includeAmount, anonymous: checked });
                }}
              />
            </div>

            <Button size="sm" className="w-full" onClick={handleShare}>
              {canNativeShare ? t('shareSheetShareButton') : (copied ? t('shareSheetCopied') : t('shareSheetCopyLink'))}
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">
              {t('shareSheetReferralNote')}
            </p>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
