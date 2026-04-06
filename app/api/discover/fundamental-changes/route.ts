import { NextResponse } from 'next/server';

/**
 * Fundamental changes used to be powered by SEC ingestion pipeline.
 * That pipeline has been removed. This stub returns an empty list so
 * the client gracefully shows an empty state instead of a 404 error.
 */
export async function GET() {
  return NextResponse.json({ success: true, changes: [] });
}
