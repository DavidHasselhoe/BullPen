import { createHash } from 'crypto';

/**
 * Short, deterministic fingerprint of a post's slide content, for appending
 * to preview-link query strings (`?v=<hash>`) wherever they're built.
 *
 * The render route serves `Cache-Control: public, max-age=3600` on a URL
 * that's otherwise stable for the post's whole lifetime — necessary so a
 * cold Discord/CDN fetch isn't repeated on every re-open, but it means a
 * same-URL data fix (a manual DB patch, a regeneration) has no way to reach
 * an already-cached fetch. This bit twice: the 2026-08-17 mascot z-index
 * bug (see the render route's Cache-Control comment) and again on
 * 2026-08-27, when a market-movers post was regenerated with corrected data
 * but the Discord notification reused the exact same slide URLs — Discord's
 * own link-unfurler had already cached the broken first render and kept
 * serving it regardless of what the server or CDN cache did afterward.
 *
 * The query string itself is never read by the render route — it exists
 * purely so a content change produces a genuinely different URL, which is
 * what actually busts both Vercel's edge cache and Discord's independent
 * per-URL embed cache. A plain timestamp would work too; hashing the real
 * content instead makes it deterministic (the same data always produces the
 * same link) and byte-for-byte tied to what actually changed.
 */
export function contentVersion(content: unknown): string {
  return createHash('sha1').update(JSON.stringify(content)).digest('hex').slice(0, 8);
}
