'use server';

// Server Actions for Notifications
// Server-side actions for notification management

import { getCurrentUserId } from '@/lib/auth/server-session';
import { createNotification as createNotificationDb, markNotificationRead as markNotificationReadDb, markAllNotificationsRead as markAllNotificationsReadDb, getUserNotifications as getUserNotificationsDb, getUnreadCount as getUnreadCountDb } from '@/lib/notifications/notifications-db';
import type { Notification, CreateNotificationInput } from '@/lib/notifications/notifications-db';

/**
 * Server Action: Create a notification (server-side only)
 * Notifications can only be created server-side for security
 */
export async function createNotification(
  input: CreateNotificationInput
): Promise<{
  success: boolean;
  notification?: Notification;
  error?: string;
}> {
  // Validate input
  if (!input.user_id || !input.type || !input.title || !input.message) {
    return {
      success: false,
      error: 'Missing required fields: user_id, type, title, message',
    };
  }

  // Validate type
  const validTypes = ['price_move', 'earnings', 'ai_insight', 'market'];
  if (!validTypes.includes(input.type)) {
    return {
      success: false,
      error: `Invalid type. Must be one of: ${validTypes.join(', ')}`,
    };
  }

  // Validate severity
  if (input.severity && !['info', 'warning', 'critical'].includes(input.severity)) {
    return {
      success: false,
      error: 'Invalid severity. Must be one of: info, warning, critical',
    };
  }

  return await createNotificationDb(input);
}

/**
 * Server Action: Get the calling user's own notifications.
 * userId from session only — never trust a client-provided userId.
 */
export async function getUserNotificationsAction(
  limit?: number
): Promise<{
  success: boolean;
  notifications?: Notification[];
  error?: string;
}> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return { success: false, error: 'Authentication required' };
  }

  return await getUserNotificationsDb(userId, limit);
}

/**
 * Server Action: Get the calling user's own unread count.
 * userId from session only — never trust a client-provided userId.
 */
export async function getUnreadCountAction(): Promise<{
  success: boolean;
  count?: number;
  error?: string;
}> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return { success: false, error: 'Authentication required' };
  }

  return await getUnreadCountDb(userId);
}

/**
 * Server Action: Mark one of the calling user's own notifications as read.
 * userId from session only — never trust a client-provided userId.
 */
export async function markNotificationReadAction(
  notificationId: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return { success: false, error: 'Authentication required' };
  }
  if (!notificationId) {
    return { success: false, error: 'Notification ID is required' };
  }

  return await markNotificationReadDb(userId, notificationId);
}

/**
 * Server Action: Mark all of the calling user's own notifications as read.
 * userId from session only — never trust a client-provided userId.
 */
export async function markAllNotificationsReadAction(): Promise<{
  success: boolean;
  error?: string;
}> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return { success: false, error: 'Authentication required' };
  }

  return await markAllNotificationsReadDb(userId);
}
