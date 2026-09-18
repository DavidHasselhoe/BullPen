import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { loadPositions } from '@/lib/holdings/portfolio-positions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/holdings/positions
 *
 * The exact book the AI features would send, for the consent toggle to show
 * before anything is submitted. Same loader, same weights, same basis, so the
 * screen and the request cannot disagree about what the investor owns.
 *
 * Only called once the toggle is actually switched on. Pricing a book costs a
 * quote per position that isn't already in the shared last-price cache, and
 * nobody should pay that for a control they never touched.
 */
async function handler(_req: NextRequest, _context: unknown, session: { userId: string }) {
  const { positions, basis } = await loadPositions(session.userId);
  return addSecurityHeaders(NextResponse.json({ success: true, positions, basis }));
}

export const GET = withAuth(handler, { rateLimit: { windowMs: 60_000, maxRequests: 30 } });
