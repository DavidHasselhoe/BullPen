import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';

export type FeedbackType = 'bug' | 'feature';

interface SubmitFeedbackBody {
  type?: FeedbackType;
  title?: string;
  description?: string;
  pageUrl?: string;
}

const TITLE_MIN = 3;
const TITLE_MAX = 150;
const DESCRIPTION_MIN = 10;
const DESCRIPTION_MAX = 4000;

/**
 * POST /api/feedback — any signed-in user submits a bug report or feature
 * request. `page_url` is captured client-side (whatever route they were on),
 * not asked for — free debugging context for bugs without adding a field.
 */
async function handler(
  request: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  let body: SubmitFeedbackBody;
  try {
    body = await request.json();
  } catch {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 })
    );
  }

  const { type } = body;
  const title = body.title?.trim();
  const description = body.description?.trim();
  const pageUrl = body.pageUrl?.trim();

  if (type !== 'bug' && type !== 'feature') {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Invalid report type' }, { status: 400 })
    );
  }
  if (!title || title.length < TITLE_MIN || title.length > TITLE_MAX) {
    return addSecurityHeaders(
      NextResponse.json(
        { success: false, error: `Title must be between ${TITLE_MIN} and ${TITLE_MAX} characters` },
        { status: 400 }
      )
    );
  }
  if (!description || description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX) {
    return addSecurityHeaders(
      NextResponse.json(
        {
          success: false,
          error: `Description must be between ${DESCRIPTION_MIN} and ${DESCRIPTION_MAX} characters`,
        },
        { status: 400 }
      )
    );
  }

  const supabase = createServerClient();
  const { error } = await supabase.from('feedback_reports').insert({
    user_id: session.userId,
    type,
    title,
    description,
    page_url: pageUrl || null,
  } as never);

  if (error) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to submit report' }, { status: 500 })
    );
  }

  return addSecurityHeaders(NextResponse.json({ success: true }));
}

// A low-frequency action — the cap exists to stop spam, not to constrain
// legitimate use, so it's generous relative to how often anyone would
// realistically file reports in an hour.
export const POST = withAuth(handler, { rateLimit: { windowMs: 60 * 60 * 1000, maxRequests: 10 } });
