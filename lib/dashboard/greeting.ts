/** Client-safe: shared by the server-rendered dashboard heading and WelcomeMessage. */

/** Cookie the dashboard greeting sets in the browser, so the server can greet in the viewer's own time of day. */
export const TZ_COOKIE = 'bp_tz';

export type Greeting = 'morning' | 'afternoon' | 'evening' | 'back';

/** discover-namespace translation key for each greeting (rendered by WelcomeMessage). */
export const GREETING_KEY: Record<Greeting, string> = {
  morning: 'greetingMorning',
  afternoon: 'greetingAfternoon',
  evening: 'greetingEvening',
  back: 'greetingBack',
};

export function greetingForHour(hour: number): Greeting {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

/** The name the person set in their profile, in full. */
export function greetingName(u: { full_name?: string | null; username?: string | null; email?: string | null }): string {
  return u.full_name?.trim() || u.username || u.email?.split('@')[0] || 'User';
}

export interface InitialWelcome {
  name: string;
  greeting: Greeting;
}
