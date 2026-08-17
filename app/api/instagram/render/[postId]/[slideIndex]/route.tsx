/**
 * GET /api/instagram/render/[postId]/[slideIndex]
 *
 * Renders one slide of a staged Instagram post as a PNG. This is the URL
 * Instagram's own Graph API servers fetch (as `image_url`) when building a
 * media container — see lib/instagram/client.ts. Same technique as
 * app/api/og/share/[id]/route.tsx: next/og's ImageResponse, Node runtime.
 *
 * Only serves 'ready' or 'published' posts — a 'draft'/'failed' row (still
 * mid-generation, or one that never got reviewed) 404s, so nothing
 * unreviewed is ever publicly fetchable by slide URL alone.
 */

import { ImageResponse } from 'next/og';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import {
  SLIDE_WIDTH,
  SLIDE_HEIGHT,
  COMPANIES_PER_LIST_SLIDE,
  loadSlideFonts,
  slideKindAt,
  totalSlideCount,
  HookSlide,
  EarningsListSlide,
  CTASlide,
} from '@/lib/instagram/render/slides';
import type { EarningsCalendarSlides } from '@/lib/instagram/content/schema';

export const runtime = 'nodejs';

interface InstagramPostRow {
  status: string;
  content_type: string;
  slides: unknown;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ postId: string; slideIndex: string }> }
): Promise<Response> {
  const { postId, slideIndex: slideIndexParam } = await context.params;
  const slideIndex = parseInt(slideIndexParam, 10);
  if (!Number.isFinite(slideIndex) || slideIndex < 0) {
    return NextResponse.json({ error: 'invalid_slide_index' }, { status: 400 });
  }

  const supabase = createServerClient();
  // instagram_posts is new — the generated Supabase Database type doesn't
  // carry it yet, so an untyped select infers as `never` (same issue
  // lib/ai/picks/ground-candidates.ts hit for screener_universe; same fix
  // app/api/screener/refresh/route.ts uses for screener_universe writes).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: post } = await db
    .from('instagram_posts')
    .select('status, content_type, slides')
    .eq('id', postId)
    .maybeSingle() as { data: InstagramPostRow | null };

  if (!post || (post.status !== 'ready' && post.status !== 'published')) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  if (post.content_type !== 'earnings_calendar') {
    // Only content type built so far — a future content type would branch here.
    return NextResponse.json({ error: 'unsupported_content_type' }, { status: 500 });
  }

  const slides = post.slides as unknown as EarningsCalendarSlides;
  const companyCount = slides.companies.length;
  const total = totalSlideCount(companyCount);
  if (slideIndex >= total) {
    return NextResponse.json({ error: 'slide_index_out_of_range' }, { status: 404 });
  }

  const fonts = await loadSlideFonts();
  const kind = slideKindAt(slideIndex, companyCount);

  let element: React.ReactElement;
  if (kind === 'hook') {
    element = (
      <HookSlide
        headline={slides.headline}
        weekLabel={slides.weekLabel}
        companyCount={companyCount}
        slideIndex={slideIndex}
        totalSlides={total}
      />
    );
  } else if (kind === 'cta') {
    element = <CTASlide slideIndex={slideIndex} totalSlides={total} />;
  } else {
    const listSlideIdx = slideIndex - 1;
    const pageCompanies = slides.companies.slice(
      listSlideIdx * COMPANIES_PER_LIST_SLIDE,
      (listSlideIdx + 1) * COMPANIES_PER_LIST_SLIDE
    );
    element = (
      <EarningsListSlide
        companies={pageCompanies}
        overflowCount={slides.overflowCount}
        slideIndex={slideIndex}
        totalSlides={total}
      />
    );
  }

  return new ImageResponse(element, {
    width: SLIDE_WIDTH,
    height: SLIDE_HEIGHT,
    fonts,
    // Was `immutable, max-age=31536000` — a same-URL cache with no version
    // key, so a code fix to the rendering component silently never took
    // effect for an already-cached post (the 2026-08-17 mascot z-index bug:
    // Discord's link preview cached the buggy render before the fix
    // deployed, and the CDN kept serving those bytes straight through the
    // Monday publish). 1 hour comfortably covers the review-to-publish
    // window (staged Sunday, published Monday) while letting a same-day
    // fix actually reach the next fetch.
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}
