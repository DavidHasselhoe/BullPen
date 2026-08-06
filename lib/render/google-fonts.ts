/**
 * Shared font-byte loader for next/og (`ImageResponse`) routes.
 *
 * Satori (next/og's renderer) can't read next/font's build-time-generated
 * files or the app's CSS variables at all, so the only way to get a real
 * brand typeface into a rendered image is to fetch the actual font bytes
 * from Google's CSS2 API at request time — same technique for any
 * next/og-based route in this project.
 *
 * Module-level cache: fetched once per cold start, reused across warm
 * invocations. Keyed by family/weight/style so different callers requesting
 * different fonts don't collide.
 */

const fontCache = new Map<string, ArrayBuffer>();

export async function loadGoogleFont(
  family: string,
  weight: number,
  italic = false,
  /** Restrict the fetched glyph set to only what a given route actually
   *  renders. Defaults to a broad practical charset covering Latin text,
   *  digits, and common financial/currency symbols. */
  text = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-.,%$€£kr·@_ '
): Promise<ArrayBuffer> {
  const cacheKey = `${family}:${weight}:${italic}:${text}`;
  const cached = fontCache.get(cacheKey);
  if (cached) return cached;

  const axis = italic ? `ital,wght@1,${weight}` : `wght@${weight}`;
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:${axis}&text=${encodeURIComponent(text)}`;
  const css = await (await fetch(cssUrl)).text();
  const match = css.match(/src: url\(([^)]+)\)/);
  if (!match) throw new Error(`Google Fonts CSS for ${family} did not contain a src url()`);
  const fontRes = await fetch(match[1]);
  const data = await fontRes.arrayBuffer();
  fontCache.set(cacheKey, data);
  return data;
}
