/** Client-safe: shared by the server-rendered dashboard heading and WelcomeMessage. */

/** Cookie the dashboard greeting sets in the browser, so the server can greet in the viewer's own time of day. */
export const TZ_COOKIE = 'bp_tz';

export type Greeting = 'morning' | 'afternoon' | 'evening' | 'back';

export const GREETING_TEXT: Record<Greeting, string> = {
  morning: 'Good morning',
  afternoon: 'Good afternoon',
  evening: 'Good evening',
  back: 'Welcome back',
};

export function greetingForHour(hour: number): Greeting {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

export interface InitialWelcome {
  name: string;
  greeting: Greeting;
}
