import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { batchFetch, TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { inferAssetType, has24hTrading } from '@/lib/assets/asset-type';
import { strayExtendedPrints } from '@/lib/market-data/extended-hours-spikes';

/** 24h of 5-min bars: a full extended US session, or a day of crypto. Same 1 credit as a smaller request. */
const BARS = 288;
/** An hour of regular-session bars. Below this, today's line is a stub. */
const MIN_TODAY_BARS = 12;

interface TsValue { datetime: string; close: string }
interface TsResponse { values?: TsValue[]; status?: string }

async function handler(
  request: NextRequest,
   
  _ctx: unknown,
   
  _session: { userId: string }
): Promise<NextResponse> {
  const symbols = (new URL(request.url).searchParams.get('symbols') ?? '')
    .split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 20);

  if (symbols.length === 0) {
    return addSecurityHeaders(NextResponse.json({ success: true, sparklines: {} }));
  }

  const apiKey = process.env.TWELVE_DATA_API_KEY ?? '';

  // The most recent bars, not "today from 04:00 ET". That window was empty or
  // a two-point stub for stocks until the US open, which is 15:30 in Oslo, so
  // for most of a European user's day most cards had no chart at all.
  // One HTTP request for all symbols via TwelveData /batch.
  const requests: Record<string, string> = {};
  for (const sym of symbols) {
    // prepost only for stocks: TD rejects it for crypto at 5min ("Pre/post data
    // is available only for 1min interval"), and the batch drops that error
    // silently, which is why crypto cards never had a chart.
    const prepost = has24hTrading(inferAssetType(sym)) ? '' : '&prepost=1';
    requests[sym] = `/time_series?symbol=${encodeURIComponent(sym)}&interval=5min${prepost}&outputsize=${BARS}&apikey=${apiKey}`;
  }
  const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

  try {
    const raw = await batchFetch<TsResponse>(requests);
    const sparklines: Record<string, number[]> = {};
    // Symbols whose line starts at the last session's open and runs up to now,
    // so the card draws the previous close as a baseline: the gap between it
    // and the line's end is exactly the change badge.
    const previousSession: string[] = [];

    for (const [sym, data] of Object.entries(raw)) {
      if (!Array.isArray(data?.values) || data.values.length === 0) continue;
      // TwelveData returns values in descending order; reverse to chronological.
      let bars = [...data.values].reverse();
      if (!has24hTrading(inferAssetType(sym))) {
        // Stray after-hours prints read as a crash at the close of a "last session" line.
        const stray = strayExtendedPrints(bars.map((v) => v.datetime), bars.map((v) => parseFloat(v.close)));
        bars = bars.filter((_, i) => !stray.has(i));
        // Stocks. Datetimes are exchange-local, so the date prefix is the session
        // and the time suffix compares as a string ("09:30" is the open).
        // Pre-market trades are sparse (a 5-min bar only exists when something
        // traded), so until today's regular session has an hour of bars the line
        // is the last session from its open, then its after-hours and today's
        // trades as a tail. It ends at the current price, which is what the
        // change badge describes.
        const today = bars.filter((v) => v.datetime.startsWith(todayET));
        const todayRegular = today.filter((v) => v.datetime.slice(11, 16) >= '09:30');
        if (todayRegular.length >= MIN_TODAY_BARS) {
          bars = today;
        } else {
          const prior = bars.filter((v) => v.datetime.slice(0, 10) < todayET);
          const priorDate = prior.length ? prior[prior.length - 1].datetime.slice(0, 10) : null;
          const fromOpen = priorDate
            ? prior.filter((v) => v.datetime.startsWith(priorDate) && v.datetime.slice(11, 16) >= '09:30')
            : [];
          if (fromOpen.length > 1) {
            bars = [...fromOpen, ...today];
            previousSession.push(sym);
          } else {
            bars = today;
          }
        }
      }
      const closes = bars.map((v) => parseFloat(v.close)).filter((n) => !isNaN(n));
      if (closes.length > 1) sparklines[sym] = closes;
    }

    return addSecurityHeaders(
      NextResponse.json({ success: true, sparklines, previousSession }, {
        headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' },
      })
    );
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 })
      );
    }
    // Non-fatal: return empty sparklines so cards still render without charts
    return addSecurityHeaders(NextResponse.json({ success: true, sparklines: {} }));
  }
}

export const GET = withAuth(handler);
