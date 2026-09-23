/**
 * GET /api/congress/photo/[slug]
 *
 * Official congressional headshot for a curated member.
 *
 * A proxy rather than a stored asset, unlike the fund logos in
 * scripts/backfill-institution-logos.ts: the vendor's photo endpoint is free
 * (measured 2026-09-23 — it returns no x-credits-charged header at all), so
 * there is nothing to save by copying the bytes into our own bucket, and a
 * proxy needs no backfill script and no storage to keep in sync.
 *
 * The API key must stay server-side, which is the other reason this is a
 * route and not an <img src> pointed straight at the vendor.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';

/** Headshots effectively never change. */
const CACHE_SECONDS = 60 * 60 * 24 * 30;

export async function GET(_request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;

  const key = process.env.DISCLOSED_CAPITOL_API_KEY;
  if (!key) {
    // Logged, not silent. Without the key every headshot 404s and the whole
    // grid falls back to initials, which looks like a design choice rather
    // than a missing environment variable — it shipped to production that way
    // on 2026-09-23 and was only caught by eye.
    console.error('[api/congress/photo] DISCLOSED_CAPITOL_API_KEY is not set');
    return new NextResponse(null, { status: 404 });
  }

  const supabase = createServerClient();
  const { data: member } = await supabase
    .from('congress_politicians')
    .select('dc_politician_id')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle<{ dc_politician_id: number }>();

  if (!member) return new NextResponse(null, { status: 404 });

  try {
    const res = await fetch(
      `https://api.disclosedcapitol.com/politicians/${member.dc_politician_id}/photo`,
      { headers: { 'DC-API-Key': key } },
    );
    if (!res.ok) return new NextResponse(null, { status: 404 });

    const body = await res.arrayBuffer();
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': res.headers.get('content-type') ?? 'image/jpeg',
        'Cache-Control': `public, max-age=${CACHE_SECONDS}, immutable`,
      },
    });
  } catch {
    // A missing headshot is not an error worth surfacing — the avatar falls
    // back to initials on its own.
    return new NextResponse(null, { status: 404 });
  }
}
