/**
 * GET /api/holdings/import/[id]     — fetch a draft for the review-grid UI
 * PATCH /api/holdings/import/[id]   — save edits made in the review grid
 *
 * The review grid holds the full editable state client-side (row removal,
 * per-row date/quantity/price overrides, re-resolved ticker picks) and
 * PATCHes the whole updated `parsed` blob back on every change — simpler
 * and safer than partial-patch semantics for a JSON blob nobody else
 * writes concurrently, and the payload is small (one file's worth of
 * transactions, capped at 1500).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';

async function getHandler(
  _request: NextRequest,
  context: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const supabase = createServerClient();

  const { data: row, error } = await supabase
    .from('holdings_imports')
    .select('id, status, file_name, format_label, total_rows, transaction_count, applied_count, parsed, error_message, created_at')
    .eq('id', id)
    .eq('user_id', session.userId)
    .maybeSingle();

  if (error || !row) {
    return addSecurityHeaders(NextResponse.json({ error: 'Import not found' }, { status: 404 }));
  }

  return addSecurityHeaders(NextResponse.json({ success: true, import: row }));
}

async function patchHandler(
  request: NextRequest,
  context: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const supabase = createServerClient();

  const { data: existing, error: lookupErr } = await supabase
    .from('holdings_imports')
    .select('id, status')
    .eq('id', id)
    .eq('user_id', session.userId)
    .maybeSingle();

  if (lookupErr || !existing) {
    return addSecurityHeaders(NextResponse.json({ error: 'Import not found' }, { status: 404 }));
  }
  if (existing.status !== 'draft') {
    return addSecurityHeaders(NextResponse.json({ error: `Cannot edit an import with status "${existing.status}"` }, { status: 409 }));
  }

  let body: { parsed?: unknown };
  try {
    body = await request.json();
  } catch {
    return addSecurityHeaders(NextResponse.json({ error: 'Invalid request body' }, { status: 400 }));
  }
  if (!body.parsed || typeof body.parsed !== 'object') {
    return addSecurityHeaders(NextResponse.json({ error: 'parsed is required' }, { status: 400 }));
  }

  const { error: updateErr } = await supabase
    .from('holdings_imports')
    .update({ parsed: body.parsed })
    .eq('id', id)
    .eq('user_id', session.userId);

  if (updateErr) {
    return addSecurityHeaders(NextResponse.json({ error: 'Failed to save changes' }, { status: 500 }));
  }

  return addSecurityHeaders(NextResponse.json({ success: true }));
}

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);
