'use client';

import { useTranslation } from 'react-i18next';
import { Pin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUserSettings } from '@/hooks/use-user-settings';
import { cn } from '@/lib/utils';

const MAX_PINNED = 5;

export function PinToggleButton({ symbol }: { symbol: string }) {
  const { t } = useTranslation('navigation');
  const { pinnedTickers, updatePinnedTickers } = useUserSettings();
  const upper = symbol.toUpperCase();
  const isPinned = pinnedTickers.includes(upper);
  const atLimit = !isPinned && pinnedTickers.length >= MAX_PINNED;

  function toggle() {
    if (isPinned) updatePinnedTickers(pinnedTickers.filter((s) => s !== upper));
    else if (!atLimit) updatePinnedTickers([...pinnedTickers, upper]);
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggle}
      disabled={atLimit}
      title={atLimit ? t('pinToggleMaxTitle', { max: MAX_PINNED }) : isPinned ? t('navUnpin') : t('navPin')}
      className="gap-2"
    >
      {/* Filled + primary = pinned. Not emerald — DESIGN.md reserves emerald/red
          for gain/loss direction only, not general UI selection state. */}
      <Pin className={cn('h-4 w-4', isPinned && 'fill-current text-primary')} />
      {isPinned ? t('navPinned') : t('navPin')}
    </Button>
  );
}
