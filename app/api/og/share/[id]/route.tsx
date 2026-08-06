import { ImageResponse } from 'next/og';
import { NextRequest, NextResponse } from 'next/server';
import { getShareById } from '@/lib/shares/get-share';
import { formatCurrency, type CurrencyCode } from '@/lib/currency/currency-conversion';
import { loadGoogleFont } from '@/lib/render/google-fonts';

export const runtime = 'nodejs';

const WIDTH = 1200;
const HEIGHT = 630;

/**
 * Both fonts used on this card are already this project's real brand fonts —
 * Geist Mono for numerals (app/layout.tsx imports both via next/font/google),
 * Instrument Serif for the italic lead-in (DESIGN.md: reserved for marketing
 * headlines, which is exactly what a share card is — external-facing content
 * meant to drive a signup, not in-app product UI). See lib/render/google-fonts.ts
 * for why fonts must be fetched as raw bytes here rather than referenced normally.
 */

function sparklinePoints(values: number[], width: number, height: number): string {
  if (values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params;
  const share = await getShareById(id);
  if (!share) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const positive = share.pct >= 0;
  const color = positive ? '#34d399' : '#f87171';
  // share.username is the snapshot taken at creation time (Task 5) — never a
  // live lookup, and never present at all when the share was made anonymous.
  const handle = !share.anonymous && share.username ? `@${share.username}` : 'A BullPen investor';
  const directionWord = positive ? 'up' : 'down';
  const pctLabel = `${positive ? '+' : ''}${share.pct.toFixed(2)}%`;
  const dateLabel = new Date(share.date + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
  const points = sparklinePoints(share.sparkline, 260, 60);
  // Percent-only unless the sharer explicitly opted in per-share (Task 10's
  // "Include dollar amount" toggle) — pnl_usd is null whenever they didn't.
  const amountLabel = share.pnl_usd != null
    ? `${share.pnl_usd >= 0 ? '+' : ''}${formatCurrency(share.pnl_usd, share.currency as CurrencyCode, { round: true })} today`
    : 'today, tracked on BullPen';

  // Real app tokens, resolved to sRGB from this project's own running dark
  // theme (--background, --muted-foreground) — Satori can't consume CSS
  // custom properties at all, so there's no way to reference the variables
  // themselves here; these are that same theme's actual computed values,
  // not an eyeballed approximation of it.
  const bg = '#070b09';
  const fg = '#fafafa';
  const muted = '#a1a1a1';
  const mutedDim = 'rgba(161, 161, 161, 0.7)';

  const [monoFont, serifFont] = await Promise.all([
    loadGoogleFont('Geist Mono', 600),
    loadGoogleFont('Instrument Serif', 400, true),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          justifyContent: 'center', paddingLeft: 72, backgroundColor: bg, color: fg,
          fontFamily: 'Geist Mono',
        }}
      >
        <div style={{ display: 'flex', position: 'absolute', top: 32, left: 48, fontSize: 20, letterSpacing: 4, color: muted }}>
          BULLPEN
        </div>
        <div style={{ display: 'flex', fontFamily: 'Instrument Serif', fontStyle: 'italic', fontSize: 30, color: muted }}>
          {handle} is {directionWord}
        </div>
        <div style={{ display: 'flex', fontSize: 118, fontWeight: 600, color, lineHeight: 1.05 }}>
          {pctLabel}
        </div>
        <div style={{ display: 'flex', fontSize: 20, color: muted, marginTop: 8 }}>
          {amountLabel}
        </div>
        <svg
          width="260" height="60"
          style={{ position: 'absolute', bottom: 56, right: 72, opacity: 0.7 }}
          viewBox="0 0 260 60"
        >
          <polyline points={points} fill="none" stroke={color} strokeWidth="3" />
        </svg>
        <div style={{ display: 'flex', position: 'absolute', bottom: 32, left: 48, fontSize: 18, color: mutedDim }}>
          {handle} &middot; {dateLabel}
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      fonts: [
        { name: 'Geist Mono', data: monoFont, weight: 600, style: 'normal' },
        { name: 'Instrument Serif', data: serifFont, weight: 400, style: 'italic' },
      ],
      headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
    }
  );
}
