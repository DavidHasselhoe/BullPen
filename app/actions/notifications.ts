'use server';

// Server Actions for Notifications
// Server-side actions for notification management

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
 * Server Action: Get user notifications
 */
export async function getUserNotificationsAction(
  userId: string,
  limit?: number
): Promise<{
  success: boolean;
  notifications?: Notification[];
  error?: string;
}> {
  if (!userId) {
    return {
      success: false,
      error: 'User ID is required',
    };
  }

  return await getUserNotificationsDb(userId, limit);
}

/**
 * Server Action: Get unread count
 */
export async function getUnreadCountAction(
  userId: string
): Promise<{
  success: boolean;
  count?: number;
  error?: string;
}> {
  if (!userId) {
    return {
      success: false,
      error: 'User ID is required',
    };
  }

  return await getUnreadCountDb(userId);
}

/**
 * Server Action: Mark notification as read
 */
export async function markNotificationReadAction(
  userId: string,
  notificationId: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  if (!userId || !notificationId) {
    return {
      success: false,
      error: 'User ID and notification ID are required',
    };
  }

  return await markNotificationReadDb(userId, notificationId);
}

/**
 * Server Action: Mark all notifications as read
 */
export async function markAllNotificationsReadAction(
  userId: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  if (!userId) {
    return {
      success: false,
      error: 'User ID is required',
    };
  }

  return await markAllNotificationsReadDb(userId);
}
