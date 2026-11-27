import { ImageResponse } from 'next/og';
import { loadOgFont } from '@/lib/render/og-fonts';

export const runtime = 'nodejs';
export const alt = 'BullPen: investing, explained for you.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Site-wide fallback social-share card — Next.js serves this for any page
 * that doesn't define its own opengraph-image (everything except
 * /share/[id], which has a real per-share dynamic card at
 * app/api/og/share/[id]/route.tsx). Same brand tokens and font-loading
 * approach as that route, deliberately: two different rendered cards from
 * one visual language, not two competing ones.
 */
export default async function OpengraphImage() {
  const bg = '#070b09';
  const fg = '#fafafa';
  const muted = '#a1a1a1';
  const accent = '#34d399';

  const [monoFont, sansFont] = await Promise.all([
    loadOgFont('Geist Mono', 600),
    loadOgFont('Geist', 700),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          justifyContent: 'center', paddingLeft: 80, backgroundColor: bg, color: fg,
          fontFamily: 'Geist Mono',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'absolute', top: 48, left: 56 }}>
          <div style={{ display: 'flex', width: 10, height: 10, borderRadius: 5, backgroundColor: accent }} />
          <div style={{ display: 'flex', fontSize: 20, letterSpacing: 4, color: muted }}>BULLPEN</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 980 }}>
          {/* One face, one weight, one color: DESIGN.md's No Serif Accent Rule. */}
          <div style={{ display: 'flex', flexDirection: 'column', fontFamily: 'Geist', fontSize: 84, fontWeight: 700, lineHeight: 1.08, letterSpacing: -2, color: fg }}>
            <div style={{ display: 'flex' }}>Investing, explained</div>
            <div style={{ display: 'flex' }}>for you.</div>
          </div>
        </div>

        <div style={{ display: 'flex', fontSize: 26, color: muted, marginTop: 28, maxWidth: 760 }}>
          Every stock in plain English, every move with a reason. No finance degree needed.
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Geist Mono', data: monoFont, weight: 600, style: 'normal' },
        { name: 'Geist', data: sansFont, weight: 700, style: 'normal' },
      ],
    }
  );
}
