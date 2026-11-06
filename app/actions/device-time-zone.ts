'use server';

import { createServerClient } from '@/lib/supabase/client';
import { getCurrentUserId } from '@/lib/auth/server-session';
import { isValidTimeZone } from '@/lib/dates/clock';

/** Records the signed-in user's device time zone (users.device_time_zone), so server-sent mail can land in their morning. */
export async function saveDeviceTimeZone(timeZone: string): Promise<{ success: boolean }> {
  const userId = await getCurrentUserId();
  if (!userId || typeof timeZone !== 'string' || timeZone.length > 64 || !isValidTimeZone(timeZone)) return { success: false };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (createServerClient() as any).from('users').update({ device_time_zone: timeZone }).eq('id', userId);
  if (error) console.error('[device-tz] save:', error.message);
  return { success: !error };
}
