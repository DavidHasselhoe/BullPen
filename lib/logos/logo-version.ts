/**
 * Logos are stored with a one-year browser cache (logos-storage.ts), so a
 * browser that saw a logo before keeps that copy even after the file changes.
 * Bump this when stored logos are rewritten in bulk, and every surface asks
 * for the new file. 2 = fitted inside the circle (2026-11-05,
 * a one-off backfill script, now in git history); 3 = same day, more margin (0.8 of the
 * radius) and Microsoft/Google-style multicolour marks included.
 */
const LOGO_VERSION = 3;

export function withLogoVersion(url: string): string {
  return url.includes('/company-logos/') && !url.includes('?') ? `${url}?v=${LOGO_VERSION}` : url;
}
