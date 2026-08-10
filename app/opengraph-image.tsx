import { ImageResponse } from 'next/og';
import { loadGoogleFont } from '@/lib/render/google-fonts';

export const runtime = 'nodejs';
export const alt = 'BullPen — The market, explained.';
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

  const [monoFont, serifFont] = await Promise.all([
    loadGoogleFont('Geist Mono', 600),
    loadGoogleFont('Instrument Serif', 400, true, 'Themarkte,xplaind.ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz '),
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
          <div style={{ display: 'flex', fontSize: 76, fontWeight: 600, lineHeight: 1.08, color: fg }}>
            The market,
          </div>
          <div style={{ display: 'flex', fontFamily: 'Instrument Serif', fontStyle: 'italic', fontSize: 92, lineHeight: 1.08, color: accent }}>
            explained.
          </div>
        </div>

        <div style={{ display: 'flex', fontSize: 26, color: muted, marginTop: 28, maxWidth: 760 }}>
          Track your portfolio, screen stocks, and get AI-powered market insights, all in one place.
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Geist Mono', data: monoFont, weight: 600, style: 'normal' },
        { name: 'Instrument Serif', data: serifFont, weight: 400, style: 'italic' },
      ],
    }
  );
}
