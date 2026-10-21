/**
 * Query keys the Discover page prefetches on the server and the client reads.
 * In a plain module because a server component importing a value from a
 * 'use client' file gets a client reference, not the value: the prefetch
 * would land under a key nothing reads.
 */
export const DISCOVER_FEED_KEY = ['discover-feed'] as const;
export const CURRENT_PICK_KEY = ['weekly-pick-current'] as const;
