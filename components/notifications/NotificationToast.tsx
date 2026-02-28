'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X, AlertTriangle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Notification } from '@/lib/notifications/notifications-db';

interface NotificationToastProps {
  notification: Notification;
  onDismiss: (notificationId: string) => void;
}

/**
 * NotificationToast
 * Ephemeral toast notification (only for warning/critical severity)
 * Auto-dismisses after 6 seconds
 */
export function NotificationToast({ notification, onDismiss }: NotificationToastProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Auto-dismiss after 6 seconds
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => onDismiss(notification.id), 300); // Wait for animation
    }, 6000);

    return () => clearTimeout(timer);
  }, [notification.id, onDismiss]);

  // Only show warning and critical notifications as toasts
  if (notification.severity !== 'warning' && notification.severity !== 'critical') {
    return null;
  }

  // Get link URL based on entity type
  const getLinkUrl = (): string => {
    if (notification.entity_type === 'stock' && notification.entity_id) {
      return `/stock/${notification.entity_id}`;
    }
    if (notification.entity_type === 'portfolio') {
      return '/holdings';
    }
    return '/';
  };

  const linkUrl = getLinkUrl();
  const Icon = notification.severity === 'critical' ? AlertCircle : AlertTriangle;

  if (!isVisible) return null;

  return (
    <div
      className={cn(
        'fixed bottom-4 right-4 z-50 w-full max-w-md rounded-lg border bg-background shadow-lg transition-all duration-300',
        isVisible ? 'animate-in slide-in-from-bottom-2' : 'animate-out slide-out-to-bottom-2'
      )}
    >
      <div
        className={cn(
          'flex items-start gap-3 p-4 border-l-4',
          notification.severity === 'critical'
            ? 'border-l-red-500 bg-red-50/50 dark:bg-red-950/20'
            : 'border-l-yellow-500 bg-yellow-50/50 dark:bg-yellow-950/20'
        )}
      >
        <Icon
          className={cn(
            'h-5 w-5 shrink-0 mt-0.5',
            notification.severity === 'critical' ? 'text-red-600' : 'text-yellow-600'
          )}
        />
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm mb-1">{notification.title}</h4>
          <p className="text-sm text-muted-foreground">{notification.message}</p>
        </div>
        <div className="flex items-start gap-2 shrink-0">
          {linkUrl !== '/' && (
            <Link href={linkUrl}>
              <Button variant="ghost" size="sm" className="h-7 text-xs">
                View
              </Button>
            </Link>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => {
              setIsVisible(false);
              setTimeout(() => onDismiss(notification.id), 300);
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
