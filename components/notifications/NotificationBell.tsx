'use client';

import { useTranslation } from 'react-i18next';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useUnreadCount } from '@/hooks/use-notifications';
import { NotificationCenter } from './NotificationCenter';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { trackEvent } from '@/lib/analytics/track';

interface NotificationBellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * NotificationBell
 * Bell icon with unread count badge, opens NotificationCenter on click
 */
export function NotificationBell({ open, onOpenChange }: NotificationBellProps) {
  const { t } = useTranslation('navigation');
  const { data: unreadCount = 0, isLoading } = useUnreadCount();

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) trackEvent('notifications_opened', { unread: unreadCount });
        onOpenChange(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'relative transition-all hover:scale-105',
            open && 'bg-accent'
          )}
          aria-label={unreadCount > 0 ? t('notifBellAriaLabelNew', { count: unreadCount }) : t('notifBellAriaLabel')}
        >
          <Bell className="h-5 w-5" />
          {!isLoading && unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs font-semibold"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[400px] max-w-[calc(100vw-2rem)] p-0"
      >
        <NotificationCenter open={open} onOpenChange={onOpenChange} />
      </PopoverContent>
    </Popover>
  );
}
