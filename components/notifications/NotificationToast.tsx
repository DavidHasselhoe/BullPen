'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X, AlertTriangle, AlertCircle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useMarkNotificationRead } from '@/hooks/use-notifications';
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
  const markRead = useMarkNotificationRead();

  useEffect(() => {
    // Auto-dismiss after 6 seconds
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => onDismiss(notification.id), 300); // Wait for animation
    }, 6000);

    return () => clearTimeout(timer);
  }, [notification.id, onDismiss]);

  // Warning/critical notifications always toast (price moves worth interrupting
  // for). ai_insight also toasts regardless of severity — these are things the
  // user actively started and is waiting on (a Deep Dive, a portfolio build),
  // so "info" severity shouldn't mean "quiet"; they should hear about it now,
  // not just via the bell badge.
  if (notification.severity !== 'warning' && notification.severity !== 'critical' && notification.type !== 'ai_insight') {
    return null;
  }

  // Get link URL based on entity type
  const getLinkUrl = (): string => {
    if (notification.type === 'ai_insight' && notification.entity_id?.endsWith(':deep_dive')) {
      return `/tools/deep-dive/${notification.entity_id.replace(/:deep_dive$/, '')}`;
    }
    if (notification.type === 'ai_insight' && notification.entity_id?.startsWith('portfolio_builder:')) {
      return `/tools/portfolio-builder?id=${notification.entity_id.replace(/^portfolio_builder:/, '')}`;
    }
    if (notification.type === 'ai_insight' && notification.entity_id?.startsWith('risk_analysis:')) {
      return `/holdings?riskAnalysisId=${notification.entity_id.replace(/^risk_analysis:/, '')}`;
    }
    if (notification.entity_type === 'stock' && notification.entity_id) {
      return `/stock/${notification.entity_id}`;
    }
    if (notification.entity_type === 'portfolio') {
      return '/holdings';
    }
    return '/';
  };

  const linkUrl = getLinkUrl();
  const isAiInsight = notification.type === 'ai_insight';
  const Icon = isAiInsight ? Sparkles : notification.severity === 'critical' ? AlertCircle : AlertTriangle;
  const iconColor = isAiInsight ? 'text-violet-400' : notification.severity === 'critical' ? 'text-red-500' : 'text-amber-500';

  if (!isVisible) return null;

  return (
    <div
      className={cn(
        // left-4, not right-4 — the "Ask Bull" toggle (AIPanelToggle) sits fixed
        // bottom-right with the same z-50 and rendered later in the DOM, so a
        // right-anchored toast here was getting covered by it. Mobile tab bar
        // clearance mirrors AIPanelToggle's own offset for the same reason.
        'fixed bottom-5 left-4 max-md:[bottom:calc(3.5rem+1.25rem+env(safe-area-inset-bottom))] z-50 w-full max-w-md rounded-lg border bg-background shadow-lg transition-all duration-300',
        isVisible ? 'animate-in slide-in-from-bottom-2' : 'animate-out slide-out-to-bottom-2'
      )}
    >
      <div className="flex items-start gap-3 p-4">
        <Icon className={cn('h-5 w-5 shrink-0 mt-0.5', iconColor)} />
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm mb-1">{notification.title}</h4>
          <p className="text-sm text-muted-foreground">{notification.message}</p>
        </div>
        <div className="flex items-start gap-2 shrink-0">
          {linkUrl !== '/' && (
            <Link href={linkUrl} onClick={() => markRead.mutate(notification.id)}>
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
