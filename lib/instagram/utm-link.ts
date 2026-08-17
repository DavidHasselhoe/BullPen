/**
 * Instagram only allows one clickable link (the bio link), and captions
 * can't contain clickable URLs — so per-post attribution isn't automatic.
 * This builds the UTM-tagged URL a human copies into the bio link field
 * when a new carousel goes live, so PostHog can later break down signup
 * conversion by utm_content (the period key) and tell which post/week
 * actually converted, not just which one got taps.
 */
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://bullpen.no';

export function instagramBioLink(contentType: string, periodKey: string): string {
  const params = new URLSearchParams({
    utm_source: 'instagram',
    utm_medium: 'social',
    utm_campaign: contentType,
    utm_content: periodKey,
  });
  return `${BASE_URL}/?${params.toString()}`;
}
