'use client';

import { useState } from 'react';
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
  const [open, setOpen] = useState(false);
  const [includeAmount, setIncludeAmount] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copyLabel, setCopyLabel] = useState('Copy link');

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
        setPhase('error');
        return;
      }
      setShareUrl(json.url);
      setPhase('ready');
    } catch {
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
    setCopyLabel('Copied!');
    setTimeout(() => setCopyLabel('Copy link'), 2000);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={disabled}
          title={disabled ? "Today's figure isn't ready yet" : "Share today's performance"}
          aria-label="Share today's performance"
        >
          <Share2 className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-72 space-y-3">
        {phase === 'creating' && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Preparing your card…
          </div>
        )}

        {phase === 'error' && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Couldn&apos;t create a share link right now. Try again in a moment.
          </p>
        )}

        {phase === 'ready' && shareUrl && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- external OG route, not a static/optimizable local asset */}
            <img
              src={shareUrl.replace('/share/', '/api/og/share/')}
              alt="Share preview"
              className="w-full rounded-lg border border-border"
            />

            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Include dollar amount</span>
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
              <span className="text-xs text-muted-foreground">Post anonymously</span>
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
              {canNativeShare ? 'Share' : copyLabel}
            </Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
