import { cookies } from 'next/headers';
import { getServerProfile } from '@/lib/auth/server-session';
import { TZ_COOKIE, greetingName, greetingForHour, type Greeting, type InitialWelcome } from './greeting';

/**
 * The dashboard heading, resolved on the server so it is in the first HTML
 * instead of waiting ~1.5s for the browser to load the profile (it was the
 * Largest Contentful Paint element). Null when signed out, when the user
 * turned the greeting off, or on any failure: the client then renders it
 * exactly as before.
 * The profile is the root layout's (getServerProfile), so no second RPC.
 */
export async function getInitialWelcome(): Promise<InitialWelcome | null> {
  try {
    const user = await getServerProfile();
    if (!user || user.settings?.show_welcome_text === false) return null;
    const name = greetingName(user);

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
