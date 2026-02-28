// Notification Database Operations
// Server-side database operations for notifications

import { createServerClient } from '@/lib/supabase/client';

export interface Notification {
  id: string;
  user_id: string;
  type: 'price_move' | 'earnings' | 'ai_insight' | 'market';
  title: string;
  message: string;
  entity_type: 'stock' | 'portfolio' | 'market' | null;
  entity_id: string | null;
  severity: 'info' | 'warning' | 'critical';
  is_read: boolean;
  created_at: string;
}

export interface NotificationDBResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface CreateNotificationInput {
  user_id: string;
  type: 'price_move' | 'earnings' | 'ai_insight' | 'market';
  title: string;
  message: string;
  entity_type?: 'stock' | 'portfolio' | 'market' | null;
  entity_id?: string | null;
  severity?: 'info' | 'warning' | 'critical';
}

/**
 * Creates a notification (server-side only)
 * Includes deduplication: same type + entity_id within 5 minutes updates existing
 */
export async function createNotification(
  input: CreateNotificationInput
): Promise<NotificationDBResult<Notification>> {
  const supabase = createServerClient();

  try {
    // Deduplication: Check for similar notification within last 5 minutes
    if (input.entity_id && input.type) {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      
      const { data: existing } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', input.user_id)
        .eq('type', input.type)
        .eq('entity_id', input.entity_id)
        .gte('created_at', fiveMinutesAgo)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        // Update existing notification instead of creating new one
        const { data, error } = await supabase
          .from('notifications')
          .update({
            title: input.title,
            message: input.message,
            severity: input.severity || 'info',
            is_read: false, // Reset read status on update
            created_at: new Date().toISOString(), // Update timestamp
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) {
          return { success: false, error: error.message };
        }

        return { success: true, data: data as Notification };
      }
    }

    // Create new notification
    const { data, error } = await supabase
      .from('notifications')
      .insert({
        user_id: input.user_id,
        type: input.type,
        title: input.title,
        message: input.message,
        entity_type: input.entity_type || null,
        entity_id: input.entity_id || null,
        severity: input.severity || 'info',
        is_read: false,
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data as Notification };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Gets notifications for a user
 */
export async function getUserNotifications(
  userId: string,
  limit: number = 50
): Promise<NotificationDBResult<Notification[]>> {
  const supabase = createServerClient();

  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: (data || []) as Notification[] };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Gets unread count for a user
 */
export async function getUnreadCount(
  userId: string
): Promise<NotificationDBResult<number>> {
  const supabase = createServerClient();

  try {
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: count || 0 };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Marks a notification as read
 */
export async function markNotificationRead(
  userId: string,
  notificationId: string
): Promise<NotificationDBResult<void>> {
  const supabase = createServerClient();

  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('user_id', userId); // Ensure user owns the notification

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Marks all notifications as read for a user
 */
export async function markAllNotificationsRead(
  userId: string
): Promise<NotificationDBResult<void>> {
  const supabase = createServerClient();

  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
