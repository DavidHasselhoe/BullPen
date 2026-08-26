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
  EarningsResultsListSlide,
  MoversListSlide,
  CTASlide,
  DeepDiveHeroSlide,
  DeepDiveRevenueSlide,
  DeepDiveProfitabilitySlide,
  DeepDiveGuidanceSlide,
  DeepDiveReactionSlide,
} from '@/lib/instagram/render/slides';
import type { EarningsCalendarSlides, EarningsResultsSlides, EarningsDeepDiveSlides, InstagramPostSlides } from '@/lib/instagram/content/schema';

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

  if (
    post.content_type !== 'earnings_calendar' &&
    post.content_type !== 'earnings_results' &&
    post.content_type !== 'market_movers' &&
    post.content_type !== 'earnings_deep_dive'
  ) {
    // Only content types built so far — a future content type would branch here.
    return NextResponse.json({ error: 'unsupported_content_type' }, { status: 500 });
  }

  const slides = post.slides as unknown as InstagramPostSlides;
  const total = totalSlideCount(slides);
  if (slideIndex >= total) {
    return NextResponse.json({ error: 'slide_index_out_of_range' }, { status: 404 });
  }

  const fonts = await loadSlideFonts();
  const kind = slideKindAt(slideIndex, slides);

  let element: React.ReactElement;
  if (slides.contentType === 'earnings_deep_dive') {
    const d = (slides as EarningsDeepDiveSlides).data;
    const commonProps = { data: d, slideIndex, totalSlides: total };
    if (kind === 'deepdive_hero') element = <DeepDiveHeroSlide {...commonProps} />;
    else if (kind === 'deepdive_revenue') element = <DeepDiveRevenueSlide {...commonProps} />;
    else if (kind === 'deepdive_profitability') element = <DeepDiveProfitabilitySlide {...commonProps} />;
    else if (kind === 'deepdive_guidance') element = <DeepDiveGuidanceSlide {...commonProps} />;
    else element = <DeepDiveReactionSlide {...commonProps} />;
  } else if (slides.contentType === 'market_movers') {
    if (kind === 'winners') {
      element = (
        <MoversListSlide
          title="Daily Winners"
          subtitle={`S&P 500 & Nasdaq 100 · ${slides.dateLabel}`}
          entries={slides.winners}
          positive
          slideIndex={slideIndex}
          totalSlides={total}
        />
      );
    } else if (kind === 'losers') {
      element = (
        <MoversListSlide
          title="Daily Losers"
          subtitle={`S&P 500 & Nasdaq 100 · ${slides.dateLabel}`}
          entries={slides.losers}
          positive={false}
          slideIndex={slideIndex}
          totalSlides={total}
        />
      );
    } else {
      element = <CTASlide slideIndex={slideIndex} totalSlides={total} />;
    }
  } else {
    const isResults = slides.contentType === 'earnings_results';
    const companyCount = slides.companies.length;

    if (kind === 'hook') {
      const pillText = isResults
        ? `${(slides as EarningsResultsSlides).beatCount} OF ${companyCount} BEAT ESTIMATES`
        : undefined;
      element = (
        <HookSlide
          headline={slides.headline}
          weekLabel={slides.weekLabel}
          companyCount={companyCount}
          slideIndex={slideIndex}
          totalSlides={total}
          pillText={pillText}
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
      element = isResults ? (
        <EarningsResultsListSlide
          companies={pageCompanies as EarningsResultsSlides['companies']}
          overflowCount={slides.overflowCount}
          slideIndex={slideIndex}
          totalSlides={total}
        />
      ) : (
        <EarningsListSlide
          companies={pageCompanies as EarningsCalendarSlides['companies']}
          overflowCount={slides.overflowCount}
          slideIndex={slideIndex}
          totalSlides={total}
        />
      );
    }
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
