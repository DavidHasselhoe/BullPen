/**
 * POST /api/holdings/import/parse
 *
 * Entry point for the AI-powered transaction importer (lib/import/). Takes
 * a base64-encoded file, runs the decode -> delimiter-sniff -> AI schema
 * mapping -> apply-mapping pipeline, resolves every distinct security
 * against TwelveData (ISIN/name search + mandatory quote verification —
 * see lib/import/resolve-security.ts), and persists the result as a draft
 * row for the review-grid UI. Never writes to user_holdings itself — that
 * only happens on POST .../[id]/commit, after the user has reviewed and
 * fixed anything ambiguous.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders, rejectIfTooLarge } from '@/lib/security/api-security';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { checkQuota } from '@/lib/billing/quotas';
import { logAiCall } from '@/lib/billing/log-ai-call';
import { classifyAiError } from '@/lib/ai/provider-error';
import { createServerClient } from '@/lib/supabase/client';
import { parseImportFile, ImportParseError } from '@/lib/import/parse-file';
import { resolveSecurity } from '@/lib/import/resolve-security';
import type { RawTransaction } from '@/lib/import/types';

export const maxDuration = 300;

// Raw file cap — base64 transport runs ~33% larger, checked against the
// decoded byte length below, not the wire size.
const MAX_FILE_BYTES = 3 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_FILE_BYTES * 2;
const RESOLVE_CONCURRENCY = 6;

async function handler(request: NextRequest, _ctx: unknown, session: { userId: string }): Promise<NextResponse> {
  const tooLarge = rejectIfTooLarge(request, MAX_REQUEST_BYTES);
  if (tooLarge) return tooLarge;

  const quota = await checkQuota(session.userId, 'csv_import');
  if (!quota.allowed) {
    return addSecurityHeaders(NextResponse.json({ error: 'quota_exceeded', quota }, { status: 402 }));
  }
  const limit = await checkRateLimit(`csv-import:${session.userId}`, { windowMs: 60_000, maxRequests: 3 });
  if (!limit.allowed) {
    return addSecurityHeaders(NextResponse.json({ error: 'Too many imports in a short time. Please wait a moment and try again.' }, { status: 429 }));
  }

  let body: { fileBase64?: string; fileName?: string };
  try {
    body = await request.json();
  } catch {
    return addSecurityHeaders(NextResponse.json({ error: 'Invalid request body' }, { status: 400 }));
  }
  if (!body.fileBase64 || !body.fileName) {
    return addSecurityHeaders(NextResponse.json({ error: 'fileBase64 and fileName are required' }, { status: 400 }));
  }

  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(Buffer.from(body.fileBase64, 'base64'));
  } catch {
    return addSecurityHeaders(NextResponse.json({ error: 'Invalid file encoding' }, { status: 400 }));
  }
  if (bytes.byteLength > MAX_FILE_BYTES) {
    return addSecurityHeaders(NextResponse.json({ error: `File is too large. Max ${(MAX_FILE_BYTES / 1024 / 1024).toFixed(0)}MB.` }, { status: 413 }));
  }

  let parsed;
  try {
    parsed = await parseImportFile(bytes, body.fileName);
  } catch (err) {
    if (err instanceof ImportParseError) {
      return addSecurityHeaders(NextResponse.json({ error: err.message }, { status: 422 }));
    }
    console.error('[holdings/import/parse] parse failed:', err);
    void logAiCall({ userId: session.userId, feature: 'csv_import', model: 'unknown', status: 'error' });
    const classified = classifyAiError(err);
    return addSecurityHeaders(NextResponse.json({ error: classified.message }, { status: classified.status }));
  }

  void logAiCall({
    userId: session.userId,
    feature: 'csv_import',
    model: parsed.model ?? 'heuristic',
    inputTokens: parsed.inputTokens,
    outputTokens: parsed.outputTokens,
    metadata: {
      fileName: body.fileName,
      rows: parsed.grid.rows.length,
      transactions: parsed.transactions.length,
      specSource: parsed.specSource,
    },
  });

  // Resolve every distinct security, bounded concurrency (each resolution
  // fires 2-4 TwelveData calls — see resolve-security.ts).
  const bySecurity = new Map<string, RawTransaction[]>();
  for (const t of parsed.transactions) {
    const list = bySecurity.get(t.securityKey) ?? [];
    list.push(t);
    bySecurity.set(t.securityKey, list);
  }

  const resolutions: Record<string, Awaited<ReturnType<typeof resolveSecurity>>> = {};
  const entries = [...bySecurity.entries()];
  for (let i = 0; i < entries.length; i += RESOLVE_CONCURRENCY) {
    const batch = entries.slice(i, i + RESOLVE_CONCURRENCY);
    await Promise.all(
      batch.map(async ([key, txns]) => {
        const first = txns[0];
        resolutions[key] = await resolveSecurity({
          isin: first.isin,
          rawSymbol: first.rawSymbol,
          name: first.name,
          priceCurrency: first.priceCurrency,
        });
      })
    );
  }

  const supabase = createServerClient();
  const draft = {
    fileName: parsed.fileName,
    encoding: parsed.encoding,
    delimiter: parsed.delimiter,
    spec: parsed.spec,
    specSource: parsed.specSource,
    transactions: parsed.transactions,
    ignored: parsed.ignored,
    rowErrors: parsed.rowErrors,
    resolutions,
    removedSourceLines: [] as number[],
    overrides: {} as Record<string, { securityKey: string; symbol: string; name: string; currency: string; micCode: string }>,
  };

  const { data: row, error } = await supabase
    .from('holdings_imports')
    .insert({
      user_id: session.userId,
      status: 'draft',
      file_name: parsed.fileName,
      format_label: parsed.spec.fileFormatLabel,
      content_hash: parsed.contentHash,
      total_rows: parsed.grid.rows.length,
      transaction_count: parsed.transactions.length,
      parsed: draft,
    })
    .select('id')
    .single();

  if (error || !row) {
    console.error('[holdings/import/parse] failed to persist draft:', error);
    return addSecurityHeaders(NextResponse.json({ error: 'Failed to save import draft' }, { status: 500 }));
  }

  const resolvedSecurities = Object.values(resolutions).filter((r) => r.status === 'resolved').length;
  const rowsNeedingAttention =
    (bySecurity.size - resolvedSecurities > 0
      ? [...bySecurity.entries()].filter(([key]) => resolutions[key]?.status !== 'resolved').reduce((n, [, txns]) => n + txns.length, 0)
      : 0) + parsed.rowErrors.length;

  return addSecurityHeaders(
    NextResponse.json({
      success: true,
      importId: row.id,
      summary: {
        fileName: parsed.fileName,
        totalTransactions: parsed.transactions.length,
        needsAttention: rowsNeedingAttention,
      },
    })
  );
}

export const POST = withAuth(handler);
