/**
 * Shrinks a logo until its whole mark fits inside the circle every surface
 * shows it in (CompanyLogo, the Instagram slides, OG images all clip to a
 * circle). Most logos arrive as a mark drawn edge to edge on a white or
 * transparent square, and the circle cut the corners off: Apple's leaf and
 * bite, Palantir's ring, Micron's swoosh.
 *
 * Only plain backgrounds are touched. A full-bleed colour logo (Airbnb pink,
 * Qualcomm blue) already fills the circle as intended; shrinking it would leave
 * a coloured square inside a white ring. Returns null when nothing changes.
 *
 * sharp comes with Next (optional dependency); without it uploads go through
 * unchanged, as before.
 */

/** The farthest drawn pixel lands at this share of the circle's radius. 0.9 read as cramped (Google's G, 11-05). */
const FIT = 0.8;
/** Only marks reaching past this are refitted; the gap above FIT keeps a second run a no-op (JPEG re-encoding leaves stray pixels just past the fitted edge). */
const TRIGGER = 0.85;

export async function fitLogoToCircle(buf: Buffer, mimeType: string): Promise<Buffer | null> {
  if (!/png|jpe?g/.test(mimeType)) return null; // SVG: no pixels to measure
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const at = (x: number, y: number) => (y * w + x) * 4;

  // The background is what all four corners agree on: transparent or white.
  const corners = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)];
  const transparent = corners.every((i) => data[i + 3] < 16);
  const white = corners.every((i) => data[i + 3] > 240 && data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235);
  if (!transparent && !white) return null;

  const isInk = (i: number) => (transparent ? data[i + 3] > 32 : Math.min(data[i], data[i + 1], data[i + 2]) < 225);
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  // The circle is the centered square's inscribed circle (object-cover crops a non-square image to that square).
  const r = Math.min(w, h) / 2;
  const target = r * FIT;
  const SECTORS = 72;
  const rim = new Set<number>();
  const rimSum = [0, 0, 0];
  const rimSq = [0, 0, 0];
  let rimN = 0;
  let far2 = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isInk(at(x, y))) continue;
      const d2 = (x - cx) ** 2 + (y - cy) ** 2;
      far2 = Math.max(far2, d2);
      if (d2 >= (r * 0.93) ** 2 && d2 <= r * r) {
        rim.add(Math.floor(((Math.atan2(y - cy, x - cx) + Math.PI) / (2 * Math.PI)) * SECTORS) % SECTORS);
        const i = at(x, y);
        for (let k = 0; k < 3; k++) { rimSum[k] += data[i + k]; rimSq[k] += data[i + k] ** 2; }
        rimN++;
      }
    }
  }
  const far = Math.sqrt(far2);
  if (far <= r * TRIGGER) return null;
  // A logo that is itself a one-colour disc (Arm, a badge) touches the rim all the way round and is meant to fill
  // the circle. Microsoft's four squares also reach round the rim, but in four colours: that is a mark, and it fits.
  const rimSpread = rimN ? Math.sqrt([0, 1, 2].reduce((t, k) => t + rimSq[k] / rimN - (rimSum[k] / rimN) ** 2, 0) / 3) : 0;
  if (rim.size >= SECTORS * 0.85 && rimSpread < 30) return null;

  const scale = target / far;
  const nw = Math.max(1, Math.round(w * scale));
  const nh = Math.max(1, Math.round(h * scale));
  // Pad with the logo's own off-white (Microsoft's is 243), or the old edge shows as a faint square.
  const avg = (k: number) => Math.round(corners.reduce((s, i) => s + data[i + k], 0) / 4);
  const paper = { r: avg(0), g: avg(1), b: avg(2) };
  const background = transparent ? { r: 0, g: 0, b: 0, alpha: 0 } : { ...paper, alpha: 1 };
  const left = Math.floor((w - nw) / 2);
  const top = Math.floor((h - nh) / 2);
  const out = sharp(buf)
    .resize(nw, nh)
    .extend({ left, right: w - nw - left, top, bottom: h - nh - top, background });
  return /png/.test(mimeType) ? out.png().toBuffer() : out.flatten({ background: paper }).jpeg({ quality: 92 }).toBuffer();
}
