import { cookies } from 'next/headers';
import { createSessionClient } from '@/lib/auth/server-session';
import { TZ_COOKIE, greetingForHour, type Greeting, type InitialWelcome } from './greeting';

/**
 * The dashboard heading, resolved on the server so it is in the first HTML
 * instead of waiting ~1.5s for the browser to load the profile (it was the
 * Largest Contentful Paint element). Null when signed out, when the user
 * turned the greeting off, or on any failure: the client then renders it
 * exactly as before.
 *
 * get_own_profile runs with the session's JWT, which PostgREST verifies, so a
 * forged cookie gets no row.
 */
export async function getInitialWelcome(): Promise<InitialWelcome | null> {
  try {
    const supabase = await createSessionClient();
    const { data } = await supabase.rpc('get_own_profile');
    const user = data as { full_name?: string | null; username?: string | null; email?: string | null; settings?: Record<string, unknown> | null } | null;
    if (!user || user.settings?.show_welcome_text === false) return null;
    const name = user.full_name || user.username || user.email?.split('@')[0] || 'User';

    // No cookie yet (first visit): a neutral greeting, swapped for the local one after hydration.
    const tz = (await cookies()).get(TZ_COOKIE)?.value;
    let greeting: Greeting = 'back';
    if (tz) {
      try {
        const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
        greeting = greetingForHour(hour);
      } catch { /* invalid zone in the cookie */ }
    }
    return { name, greeting };
  } catch {
    return null;
  }
}
