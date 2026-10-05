/**
 * Who can see a member's profile and holdings. One rule, read by every surface
 * that shows another member: search/browse, the profile page and its metadata,
 * activity, the social feed and the leaderboard.
 *
 * Opt-in. Until 2026-10-05 a profile was public unless its owner had turned it
 * off (`!== false`), which listed 20 of 21 accounts, 14 under real names from
 * Google sign-in, on an unauthenticated page search engines could crawl. Only
 * an explicit `true` makes a profile public now.
 */

type Settings = Record<string, unknown> | null | undefined;

export function isProfilePublic(settings: Settings): boolean {
  return settings?.profile_public === true;
}

/** Holdings are a second opt-in on top of a public profile. */
export function areHoldingsPublic(settings: Settings): boolean {
  return isProfilePublic(settings) && settings?.holdings_public === true;
}
