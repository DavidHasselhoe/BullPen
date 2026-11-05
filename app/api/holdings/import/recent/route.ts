/**
 * GET /api/holdings/import/recent
 *
 * The most recent import that can still be undone, for the banner on
 * /holdings. Scoped to the last 24 hours: undo rewrites cost basis, and
 * offering that indefinitely invites someone to reverse an import they've
 * been trading against for a week. Returns `{ import: null }` when there
 * is nothing to offer, which is the common case.
 *
 * Sits beside the [id] route as a static segment, same as parse/.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { STUCK_COMMIT_MS } from '@/lib/import/undo-import';

const UNDO_WINDOW_HOURS = 24;

async function handler(_request: NextRequest, _context: unknown, session: { userId: string }): Promise<NextResponse> {
  const supabase = createServerClient();
  const since = new Date(Date.now() - UNDO_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const stuckBefore = new Date(Date.now() - STUCK_COMMIT_MS).toISOString();

  // A whole-portfolio replace whose replay died mid-way (function timeout)
  // stays 'committing' with the old portfolio saved on the row. Offering
  // Undo for it is the only way back short of support.
  const { data, error } = await supabase
    .from('holdings_imports')
    .select('id, status, file_name, applied_count, committed_at')
    .eq('user_id', session.userId)
    .or(`status.in.(done,failed),and(status.eq.committing,replaced_snapshot.not.is.null,committed_at.lt.${stuckBefore})`)
    .gt('committed_at', since)
    .order('committed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return addSecurityHeaders(NextResponse.json({ import: null }));
  }

  return addSecurityHeaders(NextResponse.json({ import: data ?? null }));
}

export const GET = withAuth(handler);
