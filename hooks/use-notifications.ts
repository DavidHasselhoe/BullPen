'use client';

import { useEffect, useId } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { createBrowserClient } from '@/lib/supabase/client';
import type { Notification } from '@/lib/notifications/notifications-db';

/**
 * TanStack Query hook to fetch user notifications.
 * Uses explicit column selection to avoid overfetching.
 * Polls every 5 minutes — notifications are not real-time critical.
 */
export function useNotifications(limit: number = 50) {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  // This hook mounts several times at once (bell badge, dropdown, toast
  // listener). Each needs its own Realtime channel — reusing the same topic
  // name across instances made every later `.subscribe()` immediately kick
  // the previous one off the socket (phx_join → phx_leave within ms), so only
  // the last-mounted consumer ever stayed connected.
  const instanceId = useId();

  // Supabase Realtime: invalidate query the moment a new notification is inserted.
  // This makes the unread badge update within ~1s of a cron job creating a notification,
  // without waiting up to 5 minutes for the next polling cycle.
  useEffect(() => {
    if (!user?.id) return;
    const supabase = createBrowserClient();
    const channel = supabase
      .channel(`notifications:${user.id}:${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['notifications', user.id] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient, instanceId]);

  return useQuery({
    queryKey: ['notifications', user?.id, limit],
    queryFn: async (): Promise<Notification[]> => {
      if (!isAuthenticated || !user) {
        throw new Error('Authentication required');
      }

      const supabase = createBrowserClient();
      const { data, error } = await supabase
        .from('notifications')
        .select('id, type, title, message, created_at, is_read, severity, entity_type, entity_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw new Error(error.message);
      }

      return (data || []) as Notification[];
    },
    enabled: isAuthenticated && !!user,
    staleTime: 5 * 60 * 1000,      // 5 minutes
    refetchInterval: 5 * 60 * 1000, // Polling fallback (Realtime handles instant updates)
  });
}

/**
 * Derives unread count from the already-cached notifications query.
 * Returns a query-like object so callers don't need to change.
 */
export function useUnreadCount() {
  const { user, isAuthenticated } = useAuth();
  const { data: notifications, isLoading } = useNotifications();

  const data = (notifications || []).filter((n) => !n.is_read).length;

  return { data, isLoading: isLoading && isAuthenticated && !!user };
}

/**
 * TanStack Query mutation to mark a notification as read
 */
export function useMarkNotificationRead() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string): Promise<void> => {
      if (!user?.id) {
        throw new Error('Authentication required');
      }

      const supabase = createBrowserClient();
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId)
        .eq('user_id', user.id); // RLS ensures user can only update their own

      if (error) {
        throw new Error(error.message);
      }
    },
    onSuccess: (_, _notificationId) => {
      // Invalidate notifications queries
      queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count', user?.id] });
    },
  });
}

/**
 * TanStack Query mutation to mark every unread notification for one
 * entity_id as read (e.g. `risk_analysis:<id>`). Used by AI-generated-content
 * pages (Risk Analysis, Deep Dive, Portfolio Builder) to clear the "1" badge
 * the instant the user is actually looking at the thing the notification is
 * about — generated inline, restored from history, or opened via a deep
 * link — instead of requiring a separate trip to the bell dropdown.
 */
export function useMarkEntityNotificationsRead() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (entityId: string): Promise<void> => {
      if (!user?.id) return;
      const supabase = createBrowserClient();
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('entity_id', entityId)
        .eq('is_read', false);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count', user?.id] });
    },
  });
}

/**
 * TanStack Query mutation to mark all notifications as read
 */
export function useMarkAllNotificationsRead() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<void> => {
      if (!user?.id) {
        throw new Error('Authentication required');
      }

      const supabase = createBrowserClient();
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (error) {
        throw new Error(error.message);
      }
    },
    onSuccess: () => {
      // Invalidate notifications queries
      queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count', user?.id] });
    },
  });
}
