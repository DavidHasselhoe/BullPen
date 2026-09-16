/**
 * POST /api/holdings/import/[id]/undo
 *
 * Reverses a committed import. All of the real work (and every guard) lives
 * in lib/import/undo-import.ts — see that file's header for why it walks the
 * journal backwards rather than recomputing from the lots.
 *
 * A refusal ("you've traded these positions since") is a 409, not a 500: it
 * means nothing was touched and the user needs to fix it by hand instead.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { undoImport } from '@/lib/import/undo-import';

export const maxDuration = 300;

async function handler(_request: NextRequest, context: unknown, session: { userId: string }): Promise<NextResponse> {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;

  const result = await undoImport(session.userId, id);

  if (!result.success) {
    return addSecurityHeaders(
      NextResponse.json(
        { error: result.error ?? 'Could not undo this import.', revertedCount: result.revertedCount ?? 0 },
        { status: result.blocked ? 409 : 500 }
      )
    );
  }

  return addSecurityHeaders(NextResponse.json({ success: true, revertedCount: result.revertedCount ?? 0 }));
}

export const POST = withAuth(handler);
