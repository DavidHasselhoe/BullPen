/**
 * User Alerts — single-alert mutations.
 *
 *  PATCH  /api/alerts/[id]   → toggle pause/resume (body: { isActive: boolean })
 *  DELETE /api/alerts/[id]   → permanently remove
 *
 * Ownership is enforced by RLS in addition to the user_id eq() filter below.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { humanizeError } from '@/lib/errors/humanize';
import { PatchAlertPayloadSchema } from '@/types/alerts';

async function patchHandler(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
  session: { userId: string }
): Promise<NextResponse> {
  const { id } = await context.params;

  let payload;
  try {
    payload = PatchAlertPayloadSchema.parse(await req.json());
  } catch (err) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: humanizeError(err) }, { status: 400 })
    );
  }

  const supabase = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { error } = await db
    .from('user_alerts')
    .update({ is_active: payload.isActive })
    .eq('id', id)
    .eq('user_id', session.userId);

  if (error) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: humanizeError(error) }, { status: 500 })
    );
  }
  return addSecurityHeaders(NextResponse.json({ success: true }));
}

async function deleteHandler(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
  session: { userId: string }
): Promise<NextResponse> {
  const { id } = await context.params;
  const supabase = createServerClient();
  const { error } = await supabase
    .from('user_alerts')
    .delete()
    .eq('id', id)
    .eq('user_id', session.userId);

  if (error) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: humanizeError(error) }, { status: 500 })
    );
  }
  return addSecurityHeaders(NextResponse.json({ success: true }));
}

export const PATCH  = withAuth(patchHandler,  { rateLimit: { windowMs: 60_000, maxRequests: 60 } });
export const DELETE = withAuth(deleteHandler, { rateLimit: { windowMs: 60_000, maxRequests: 60 } });
