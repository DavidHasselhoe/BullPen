'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { useHoldings } from '@/hooks/use-holdings';
import { AuthGate } from '@/components/ui/AuthGate';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { TickerFixPopover, type FixedResolution } from './TickerFixPopover';
import type { DateFormat } from '@/lib/import/dates';
import { AlertCircle, CheckCircle2, X, RotateCcw, ChevronLeft, Loader2, GraduationCap, PlusCircle, RefreshCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

// ─── Types mirroring the server draft shape ──────────────────────────────────

interface RawTransaction {
  sourceLine: number;
  action: 'BUY' | 'SELL';
  date: string | null;
  rawDate: string;
  quantity: number | null;
  price: number | null;
  securityKey: string;
  isin: string | null;
  rawSymbol: string | null;
  name: string | null;
  priceCurrency: string | null;
  grossAmount: number | null;
  grossCurrency: string | null;
}

interface ResolvedCandidate {
  symbol: string;
  instrument_name: string;
  exchange: string;
  mic_code: string;
  currency: string;
  instrument_type: string;
}

type SecurityResolution =
  | { status: 'resolved'; candidate: ResolvedCandidate }
  | { status: 'proxy_suggested'; suggestion: ResolvedCandidate; wanted: ResolvedCandidate | null }
  | { status: 'unmatched'; bestGuesses: ResolvedCandidate[] };

interface ImportDraft {
  fileName: string;
  spec: { dateFormat: DateFormat; dateAmbiguous: boolean; fileFormatLabel: string };
  transactions: RawTransaction[];
  ignored: { sourceLine: number; typeValue: string }[];
  resolutions: Record<string, SecurityResolution>;
  removedSourceLines: number[];
}

interface ImportRow {
  id: string;
  status: 'draft' | 'committing' | 'done' | 'failed' | 'undone';
  file_name: string;
  parsed: ImportDraft;
}

function collapseRanges(lines: number[]): string {
  if (lines.length === 0) return '';
  const sorted = [...lines].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    const cur = sorted[i];
    if (cur === prev + 1) {
      prev = cur;
      continue;
    }
    ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = cur;
    prev = cur;
  }
  return ranges.join(', ');
}

export function ImportReviewClient({ importId }: { importId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());
  const [flashLine, setFlashLine] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery<{ import: ImportRow }>({
    queryKey: ['holdings-import', importId],
    queryFn: async () => {
      const res = await fetch(`/api/holdings/import/${importId}`);
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to load import');
      return res.json();
    },
    enabled: isAuthenticated,
    staleTime: Infinity,
  });

  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, FixedResolution>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  // Populated only after a failed Save — the server's replay planner caught
  // an oversell / sell-without-position / synced-holding conflict. These are
  // separate from ticker-resolution issues (amber for a different reason)
  // and can only be discovered by actually attempting the replay, since they
  // depend on chronological order across the whole file, not one row.
  const [replayFlags, setReplayFlags] = useState<Map<number, string>>(new Map());
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  // Whether a re-imported ticker should stack on top of what's already
  // there, or replace it outright. Defaults to 'add' — the existing
  // behavior — so nothing changes for anyone who doesn't touch this.
  const [importMode, setImportMode] = useState<'add' | 'replace'>('add');

  const { data: existingHoldings } = useHoldings();

  const draft = data?.import.parsed;

  // Hydrate local edit state once, from whatever the server already had.
  if (draft && !hydrated) {
    setRemoved(new Set(draft.removedSourceLines ?? []));
    setHydrated(true);
  }

  const resolutions = useMemo<Record<string, SecurityResolution>>(() => {
    if (!draft) return {};
    const merged = { ...draft.resolutions };
    for (const [key, fix] of Object.entries(overrides)) {
      merged[key] = { status: 'resolved', candidate: fix };
    }
    return merged;
  }, [draft, overrides]);

  const rows = draft?.transactions ?? [];
  const activeRows = rows.filter((r) => !removed.has(r.sourceLine));
  const readyRows = activeRows.filter((r) => resolutions[r.securityKey]?.status === 'resolved' && !replayFlags.has(r.sourceLine));
  const brokenRows = activeRows.filter((r) => resolutions[r.securityKey]?.status !== 'resolved' || replayFlags.has(r.sourceLine));

  // Manually-entered holdings this import would land on top of. Only
  // 'manual' holdings are eligible for replace — a SnapTrade-synced holding
  // is never something an import should delete or reset.
  const overlappingHoldings = useMemo(() => {
    if (!existingHoldings) return [];
    const importSymbols = new Set<string>();
    for (const t of activeRows) {
      const r = resolutions[t.securityKey];
      if (r?.status === 'resolved') importSymbols.add(r.candidate.symbol);
    }
    return existingHoldings.filter((h) => h.source === 'manual' && importSymbols.has(h.symbol));
  }, [existingHoldings, activeRows, resolutions]);

  const securityLabel = (t: RawTransaction) => t.name ?? t.rawSymbol ?? t.isin ?? 'Unknown security';

  // Warn on tab close / refresh — this whole review is throwaway until Save
  // actually commits it, and losing an AI-mapped, ticker-resolved draft to
  // an accidental reload means starting the entire import over.
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  function scrollToLine(line: number) {
    const el = rowRefs.current.get(line);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setFlashLine(line);
    setTimeout(() => setFlashLine((cur) => (cur === line ? null : cur)), 1200);
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updatedDraft: ImportDraft = {
        ...draft,
        resolutions,
        removedSourceLines: [...removed],
      };
      const patchRes = await fetch(`/api/holdings/import/${importId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parsed: updatedDraft }),
      });
      if (!patchRes.ok) throw new Error((await patchRes.json()).error ?? 'Failed to save changes');

      const commitRes = await fetch(`/api/holdings/import/${importId}/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: importMode }),
      });
      const commitData = await commitRes.json();
      if (!commitRes.ok) {
        if (Array.isArray(commitData.flags) && commitData.flags.length > 0) {
          const flagMap = new Map<number, string>(
            (commitData.flags as { sourceLine: number; detail: string }[]).map((f) => [f.sourceLine, f.detail])
          );
          setReplayFlags(flagMap);
          throw new Error('Some transactions conflict with your existing holdings or each other. Fix or remove them below.');
        }
        throw new Error(commitData.error ?? 'Failed to save your transactions');
      }

      queryClient.invalidateQueries({ queryKey: ['holdings'] });
      queryClient.invalidateQueries({ queryKey: ['holdings-quotes'] });
      router.push('/holdings');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) return <div className="min-h-screen" />;
  if (!isAuthenticated) {
    return (
      <AuthGate
        icon={<GraduationCap className="h-7 w-7" />}
        title="Sign in to review your import"
        description="This import is tied to your account."
        signInHref="/login"
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !draft) {
    return (
      <div className="mx-auto max-w-lg py-24 text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-muted-foreground/60" />
        <p className="mt-3 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "We couldn't find this import."}
        </p>
        <Link href="/holdings" className="mt-4 inline-block text-sm text-primary hover:underline">
          Back to Holdings
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setShowLeaveConfirm(true)}
              className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Back
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold text-foreground">Review your import</h1>
              <p className="truncate text-xs text-muted-foreground">{draft.fileName} · {draft.spec.fileFormatLabel}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        {draft.ignored.length > 0 && (
          <Accordion type="single" collapsible className="mb-4">
            <AccordionItem value="ignored" className="rounded-xl border border-border/40 px-4">
              <AccordionTrigger className="text-xs text-muted-foreground hover:no-underline">
                {draft.ignored.length} rows skipped (dividends, fees, deposits, and similar non-trade activity)
              </AccordionTrigger>
              <AccordionContent className="text-xs text-muted-foreground">
                We only import buys and sells. Dividends, interest, fees, deposits, and corporate actions in your
                file were left out on purpose — nothing to fix here.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        {overlappingHoldings.length > 0 && (
          <div className="mb-4 rounded-xl border border-border/40 p-4">
            <p className="text-xs font-medium text-foreground/80 mb-1">
              You already hold {overlappingHoldings.length === 1 ? overlappingHoldings[0].symbol : `${overlappingHoldings.length} of these tickers`}
            </p>
            <p className="text-[11px] text-muted-foreground/85 leading-relaxed mb-3">
              Choose whether this import should add to those positions or replace them outright.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setImportMode('add')}
                className={cn(
                  'flex items-start gap-2 rounded-lg border p-3 text-left transition-colors',
                  importMode === 'add' ? 'border-primary bg-primary/5' : 'border-border/40 hover:bg-muted/30'
                )}
              >
                <PlusCircle className={cn('h-4 w-4 mt-0.5 shrink-0', importMode === 'add' ? 'text-primary' : 'text-muted-foreground')} />
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-foreground">Add to existing</span>
                  <span className="block text-[11px] text-muted-foreground mt-0.5">
                    Imported buys and sells stack on top of what you already have.
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setImportMode('replace')}
                className={cn(
                  'flex items-start gap-2 rounded-lg border p-3 text-left transition-colors',
                  importMode === 'replace' ? 'border-primary bg-primary/5' : 'border-border/40 hover:bg-muted/30'
                )}
              >
                <RefreshCcw className={cn('h-4 w-4 mt-0.5 shrink-0', importMode === 'replace' ? 'text-primary' : 'text-muted-foreground')} />
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-foreground">Replace existing</span>
                  <span className="block text-[11px] text-muted-foreground mt-0.5">
                    Your current position in {overlappingHoldings.length === 1 ? overlappingHoldings[0].symbol : 'these tickers'} is cleared first, then rebuilt from this file alone.
                  </span>
                </span>
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-border/40">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10">#</TableHead>
                <TableHead>Ticker / Company / ISIN</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Shares</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Total cost</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t, idx) => {
                const isRemoved = removed.has(t.sourceLine);
                const resolution = resolutions[t.securityKey];
                const replayFlagDetail = replayFlags.get(t.sourceLine);
                const isUnresolved = !isRemoved && resolution?.status !== 'resolved';
                const isFlagged = !isRemoved && !isUnresolved && !!replayFlagDetail;
                const isBroken = isUnresolved || isFlagged;
                const totalCost = t.quantity != null && t.price != null ? t.quantity * t.price : null;

                return (
                  <TableRow
                    key={t.sourceLine}
                    ref={(el) => { if (el) rowRefs.current.set(t.sourceLine, el); }}
                    className={cn(
                      'transition-colors',
                      isRemoved && 'opacity-40',
                      isBroken && 'bg-amber-500/[0.06]',
                      flashLine === t.sourceLine && 'ring-2 ring-inset ring-amber-500/60'
                    )}
                  >
                    <TableCell className="font-mono text-xs text-muted-foreground/70">{idx + 1}</TableCell>
                    <TableCell className="max-w-[220px]">
                      {isFlagged ? (
                        <div className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/5 px-2 py-1 text-xs" title={replayFlagDetail}>
                          <AlertCircle className="h-3 w-3 shrink-0 mt-0.5 text-amber-500" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-foreground">{securityLabel(t)}</span>
                            <span className="block truncate text-[11px] text-amber-600 dark:text-amber-400">{replayFlagDetail}</span>
                          </span>
                        </div>
                      ) : isUnresolved ? (
                        <TickerFixPopover
                          defaultQuery={securityLabel(t)}
                          onResolved={(fix) => setOverrides((o) => ({ ...o, [t.securityKey]: fix }))}
                        >
                          <button className="flex w-full items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/5 px-2 py-1 text-left text-xs hover:bg-amber-500/10 transition-colors">
                            <AlertCircle className="h-3 w-3 shrink-0 text-amber-500" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium text-foreground">{securityLabel(t)}</span>
                              <span className="block truncate text-[11px] text-amber-600 dark:text-amber-400">Unmatched, fix ticker</span>
                            </span>
                          </button>
                        </TickerFixPopover>
                      ) : (
                        <div className="min-w-0">
                          <span className="block truncate font-mono text-xs font-semibold">
                            {resolution.status === 'resolved' ? resolution.candidate.symbol : t.rawSymbol}
                          </span>
                          <span className="block truncate text-[11px] text-muted-foreground">{securityLabel(t)}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide',
                          t.action === 'BUY' ? 'border-border/60 text-foreground/75' : 'border-foreground/40 text-foreground font-semibold'
                        )}
                      >
                        {t.action}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                      {t.date ?? <span className="text-red-400">invalid</span>}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">{t.quantity ?? '—'}</TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {t.price != null ? `${t.price.toFixed(2)}${t.priceCurrency ? ` ${t.priceCurrency}` : ''}` : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                      {totalCost != null ? totalCost.toFixed(2) : '—'}
                    </TableCell>
                    <TableCell>
                      {isRemoved ? (
                        <button
                          onClick={() => setRemoved((s) => { const next = new Set(s); next.delete(t.sourceLine); return next; })}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          title="Undo remove"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <button
                          onClick={() => setRemoved((s) => new Set(s).add(t.sourceLine))}
                          className="text-muted-foreground/60 hover:text-red-400 transition-colors"
                          title="Remove this transaction"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </main>

      <div className="sticky bottom-0 border-t border-border/60 bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-xs">
            {brokenRows.length > 0 ? (
              <p className="flex flex-wrap items-center gap-1 text-amber-600 dark:text-amber-400">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                To save, fix {brokenRows.length} incomplete transaction{brokenRows.length === 1 ? '' : 's'}:{' '}
                {collapseRanges(brokenRows.map((r) => r.sourceLine))
                  .split(', ')
                  .map((range, i, arr) => (
                    <span key={range}>
                      <button
                        onClick={() => scrollToLine(Number(range.split('-')[0]))}
                        className="underline underline-offset-2 hover:text-foreground"
                      >
                        {range}
                      </button>
                      {i < arr.length - 1 ? ',' : ''}
                    </span>
                  ))}
              </p>
            ) : (
              <p className="flex items-center gap-1.5 text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                {readyRows.length}/{activeRows.length} transactions ready
              </p>
            )}
            {saveError && <p className="mt-1 text-red-400">{saveError}</p>}
          </div>
          <Button
            onClick={handleSave}
            disabled={brokenRows.length > 0 || activeRows.length === 0 || saving}
            className="shrink-0 gap-1.5"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {saving ? 'Saving…' : `Save ${readyRows.length} transaction${readyRows.length === 1 ? '' : 's'}`}
          </Button>
        </div>
      </div>

      <Dialog open={showLeaveConfirm} onOpenChange={setShowLeaveConfirm}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Leave without saving?</DialogTitle>
            <DialogDescription className="text-xs">
              You haven&apos;t saved this import yet. Going back now discards everything you&apos;ve reviewed here,
              and you&apos;ll need to import the file again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setShowLeaveConfirm(false)}>
              Keep reviewing
            </Button>
            <Button size="sm" variant="destructive" onClick={() => router.push('/holdings')}>
              Leave and discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
