/**
 * GET /api/search/index
 *
 * The whole searchable symbol catalogue in one response. The browser fetches
 * this once per session and then answers every keystroke locally in under a
 * millisecond — no request per character, which is the only way search can be
 * genuinely instant rather than merely fast.
 *
 * Payload is tab-separated lines, not JSON: `TICKER\tName\tkind\trank`. Across
 * ~17k rows the punctuation JSON would add costs more than the parse it saves,
 * and splitting two characters is not slower than JSON.parse at this size.
 *
 * Cached at the CDN for 6 hours with a day of stale-while-revalidate, so almost
 * every hit is served from the edge without touching Postgres, and a refresh
 * never makes a user wait for one.
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

const PAGE = 1000;

export async function GET() {
  try {
    const supabase = createServerClient();
    const lines: string[] = [];

    // PostgREST caps an unbounded select at 1000 rows, silently. Page it.
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('search_index')
        .select('ticker, name, kind, rank')
        .order('ticker', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as Array<{ ticker: string; name: string; kind: string; rank: number }>;
      for (const r of rows) {
        // Tabs and newlines would corrupt the row format; a name containing one
        // is bad data, not a reason to break every row after it.
        const name = r.name.replace(/[\t\n\r]+/g, ' ');
        lines.push(`${r.ticker}\t${name}\t${r.kind}\t${r.rank}`);
      }
      if (rows.length < PAGE) break;
    }

    return new NextResponse(lines.join('\n'), {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    logger.error('Search index build failed', error);
    // An empty body is a valid empty index: search falls back to the remote
    // endpoint and the user sees slower results, not an error.
    return new NextResponse('', {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
}
