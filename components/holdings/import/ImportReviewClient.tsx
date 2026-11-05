'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { useHoldings } from '@/hooks/use-holdings';
import { AuthGate } from '@/components/ui/AuthGate';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { TickerFixPopover, type FixedResolution } from './TickerFixPopover';
import { DatePicker } from '@/components/ui/date-picker';
import type { DateFormat } from '@/lib/import/dates';
import { AlertCircle, CheckCircle2, X, RotateCcw, ChevronLeft, Loader2, GraduationCap, PlusCircle, RefreshCcw, Eraser } from 'lucide-react';
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

/**
 * A row's three correctable values, held as raw strings while being typed so
 * a half-deleted number doesn't momentarily read as NaN. `undefined` means
 * untouched, which is how the parser's value stays authoritative until the
 * user actually overrides it.
 */
type RowEdit = { date?: string; quantity?: string; price?: string };

interface RowValues {
  date: string | null;
  quantity: number | null;
  price: number | null;
}

function toNumber(raw: string | undefined, fallback: number | null): number | null {
  if (raw === undefined) return fallback;
  if (raw.trim() === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function effectiveRow(tx: RawTransaction, edit: RowEdit | undefined): RowValues {
  if (!edit) return { date: tx.date, quantity: tx.quantity, price: tx.price };
  return {
    date: edit.date !== undefined ? edit.date || null : tx.date,
    quantity: toNumber(edit.quantity, tx.quantity),
    price: toNumber(edit.price, tx.price),
  };
}

/**
 * Why a row can't be saved as it stands. planReplay silently SKIPS a
 * transaction with a missing date, quantity or price, so without this check
 * a broken row imports as nothing at all and the user is never told which
 * one went missing. Now it blocks the save and can be fixed in place.
 */
function rowIssue(values: RowValues): 'date' | 'quantity' | 'price' | null {
  if (!values.date || !/^\d{4}-\d{2}-\d{2}$/.test(values.date) || Number.isNaN(Date.parse(values.date))) return 'date';
  if (values.quantity == null || !(values.quantity > 0)) return 'quantity';
  if (values.price == null || !(values.price > 0)) return 'price';
  return null;
}

const CELL_INPUT_CLASS =
  'w-full rounded border border-transparent bg-transparent px-1 py-0.5 font-mono text-xs tabular-nums transition-colors hover:border-border/60 focus:border-primary focus:outline-none';

interface ExistingTrade {
  symbol: string;
  action: 'BUY' | 'SELL';
  date: string;
  quantity: number;
  price: number;
}

/** Rounded so a price stored as numeric still matches the file's float. */
function tradeKey(symbol: string, action: string, date: string, quantity: number, price: number): string {
  return `${symbol}|${action}|${date}|${quantity.toFixed(6)}|${price.toFixed(4)}`;
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
  const { t } = useTranslation('holdings');
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());
  const [flashLine, setFlashLine] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery<{ import: ImportRow; existingTrades?: ExistingTrade[] }>({
    queryKey: ['holdings-import', importId],
    queryFn: async () => {
      const res = await fetch(`/api/holdings/import/${importId}`);
      if (!res.ok) throw new Error((await res.json()).error ?? t('importReviewErrorLoad'));
      return res.json();
    },
    enabled: isAuthenticated,
    staleTime: Infinity,
  });

  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [edits, setEdits] = useState<Record<number, RowEdit>>({});
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
  // 'replace_all' clears every manual holding, sale and activity row first.
  const [importMode, setImportMode] = useState<'add' | 'replace' | 'replace_all'>('add');
  const [showReplaceAllConfirm, setShowReplaceAllConfirm] = useState(false);
  // Rows that match an existing trade are left out in Add mode until the
  // user includes them one by one.
  const [includedDuplicates, setIncludedDuplicates] = useState<Set<number>>(new Set());

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

  const rows = useMemo(() => draft?.transactions ?? [], [draft]);

  // File rows already recorded as a purchase or sale (same ticker, side,
  // date, shares, price). Matched one for one, so a file with two identical
  // buys against one recorded buy flags only one of them.
  const duplicateLines = useMemo(() => {
    const remaining = new Map<string, number>();
    for (const tr of data?.existingTrades ?? []) {
      const key = tradeKey(tr.symbol, tr.action, tr.date, tr.quantity, tr.price);
      remaining.set(key, (remaining.get(key) ?? 0) + 1);
    }
    const lines = new Set<number>();
    if (remaining.size === 0) return lines;
    for (const tx of rows) {
      if (removed.has(tx.sourceLine)) continue;
      const r = resolutions[tx.securityKey];
      const v = effectiveRow(tx, edits[tx.sourceLine]);
      if (r?.status !== 'resolved' || !v.date || v.quantity == null || v.price == null) continue;
      const key = tradeKey(r.candidate.symbol, tx.action, v.date, v.quantity, v.price);
      const left = remaining.get(key) ?? 0;
      if (left > 0) {
        lines.add(tx.sourceLine);
        remaining.set(key, left - 1);
      }
    }
    return lines;
  }, [data?.existingTrades, rows, removed, resolutions, edits]);

  // Duplicates only matter when stacking on top: both replace modes clear
  // the old trades first.
  const isDuplicateExcluded = (line: number) =>
    importMode === 'add' && duplicateLines.has(line) && !includedDuplicates.has(line);
  const excludedDuplicateCount = importMode === 'add' ? [...duplicateLines].filter((l) => !includedDuplicates.has(l)).length : 0;
  const isLeftOut = (line: number) => removed.has(line) || isDuplicateExcluded(line);
  const activeRows = rows.filter((r) => !isLeftOut(r.sourceLine));
  const isRowBroken = (r: RawTransaction) =>
    resolutions[r.securityKey]?.status !== 'resolved' ||
    replayFlags.has(r.sourceLine) ||
    rowIssue(effectiveRow(r, edits[r.sourceLine])) !== null;
  const readyRows = activeRows.filter((r) => !isRowBroken(r));
  const brokenRows = activeRows.filter(isRowBroken);

  // Manually-entered holdings this import would land on top of. Only
  // 'manual' holdings are eligible for replace — a SnapTrade-synced holding
  // is never something an import should delete or reset.
  const overlappingHoldings = useMemo(() => {
    if (!existingHoldings) return [];
    const importSymbols = new Set<string>();
    for (const tx of activeRows) {
      const r = resolutions[tx.securityKey];
      if (r?.status === 'resolved') importSymbols.add(r.candidate.symbol);
    }
    return existingHoldings.filter((h) => h.source === 'manual' && importSymbols.has(h.symbol));
  }, [existingHoldings, activeRows, resolutions]);

  // What "Start from scratch" would clear. Recorded sales count too: a sold
  // position leaves no open holding but still sits in History.
  const manualHoldingCount = (existingHoldings ?? []).filter((h) => h.source === 'manual' && (h.quantity ?? 0) > 0).length;
  // Sales of a SnapTrade-synced symbol don't count: the clear never touches them.
  const syncedSymbols = new Set((existingHoldings ?? []).filter((h) => h.source !== 'manual').map((h) => h.symbol));
  const canReplaceAll =
    manualHoldingCount > 0 || (data?.existingTrades ?? []).some((tr) => tr.action === 'SELL' && !syncedSymbols.has(tr.symbol));

  const securityLabel = (tx: RawTransaction) => tx.name ?? tx.rawSymbol ?? tx.isin ?? t('importReviewUnknownSecurity');

  function setEdit(sourceLine: number, patch: RowEdit) {
    setEdits((prev) => ({ ...prev, [sourceLine]: { ...prev[sourceLine], ...patch } }));
  }

  /** What the number input shows: the raw string mid-typing, else the parsed value. */
  function editValue(tx: RawTransaction, field: 'quantity' | 'price', parsed: number | null): string {
    const raw = edits[tx.sourceLine]?.[field];
    if (raw !== undefined) return raw;
    return parsed == null ? '' : String(parsed);
  }

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
      // Per-row corrections are folded into the transactions themselves, so
      // the committed replay and any later reload both read the fixed values
      // rather than the parser's original guess.
      const updatedDraft: ImportDraft = {
        ...draft,
        transactions: draft.transactions.map((tx) => {
          const edit = edits[tx.sourceLine];
          return edit ? { ...tx, ...effectiveRow(tx, edit) } : tx;
        }),
        resolutions,
        removedSourceLines: rows.filter((r) => isLeftOut(r.sourceLine)).map((r) => r.sourceLine),
      };
      const patchRes = await fetch(`/api/holdings/import/${importId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parsed: updatedDraft }),
      });
      if (!patchRes.ok) throw new Error((await patchRes.json()).error ?? t('importReviewErrorSaveChanges'));

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
          throw new Error(t('importReviewErrorConflicts'));
        }
        throw new Error(commitData.error ?? t('importReviewErrorCommit'));
      }

      queryClient.invalidateQueries({ queryKey: ['holdings'] });
      queryClient.invalidateQueries({ queryKey: ['holdings-quotes'] });
      // Replace mode deletes sales and the import adds its own sells.
      queryClient.invalidateQueries({ queryKey: ['holding-sales'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio-performance'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['recent-import'] });
      router.push('/holdings');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('importReviewErrorGeneric'));
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) return <div className="min-h-screen" />;
  if (!isAuthenticated) {
    return (
      <AuthGate
        source="import_review"
        icon={<GraduationCap className="h-7 w-7" />}
        title={t('importReviewAuthTitle')}
        description={t('importReviewAuthDescription')}
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
        <AlertCircle className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : t('importReviewNotFound')}
        </p>
        <Link href="/holdings" className="mt-4 inline-block text-sm text-primary hover:underline">
          {t('importReviewBackToHoldings')}
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
              <ChevronLeft className="h-3.5 w-3.5" /> {t('importReviewBack')}
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold text-foreground">{t('importReviewTitle')}</h1>
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
                {t('importReviewSkippedRows', { count: draft.ignored.length })}
              </AccordionTrigger>
              <AccordionContent className="text-xs text-muted-foreground">
                {t('importReviewSkippedExplainer')}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        {(overlappingHoldings.length > 0 || canReplaceAll) && (
          <div className="mb-4 rounded-xl border border-border/40 p-4">
            <p className="text-xs font-medium text-foreground/80 mb-1">
              {overlappingHoldings.length === 0
                ? t('importReviewModeTitle')
                : overlappingHoldings.length === 1
                  ? t('importReviewOverlapTitleOne', { symbol: overlappingHoldings[0].symbol })
                  : t('importReviewOverlapTitleMany', { count: overlappingHoldings.length })}
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
              {overlappingHoldings.length === 0 ? t('importReviewModeDescription') : t('importReviewOverlapDescription')}
            </p>
            <div className={cn('grid grid-cols-1 gap-2', overlappingHoldings.length > 0 && canReplaceAll ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
              {(
                [
                  { mode: 'add', Icon: PlusCircle, title: t('importReviewModeAddTitle'), description: t('importReviewModeAddDescription'), show: true },
                  {
                    mode: 'replace',
                    Icon: RefreshCcw,
                    title: t('importReviewModeReplaceTitle'),
                    description:
                      overlappingHoldings.length === 1
                        ? t('importReviewModeReplaceDescriptionOne', { symbol: overlappingHoldings[0].symbol })
                        : t('importReviewModeReplaceDescriptionMany'),
                    show: overlappingHoldings.length > 0,
                  },
                  { mode: 'replace_all', Icon: Eraser, title: t('importReviewModeReplaceAllTitle'), description: t('importReviewModeReplaceAllDescription'), show: canReplaceAll },
                ] as const
              )
                .filter((o) => o.show)
                .map(({ mode, Icon, title, description }) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={importMode === mode}
                    onClick={() => setImportMode(mode)}
                    className={cn(
                      'flex items-start gap-2 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      importMode === mode ? 'border-primary bg-primary/5' : 'border-border/40 hover:bg-muted/30'
                    )}
                  >
                    <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', importMode === mode ? 'text-primary' : 'text-muted-foreground')} />
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-foreground">{title}</span>
                      <span className="block text-[11px] text-muted-foreground mt-0.5">{description}</span>
                    </span>
                  </button>
                ))}
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-border/40">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10">#</TableHead>
                <TableHead>{t('importReviewColumnSecurity')}</TableHead>
                <TableHead>{t('importReviewColumnType')}</TableHead>
                <TableHead>{t('importReviewColumnDate')}</TableHead>
                <TableHead className="text-right">{t('importReviewColumnShares')}</TableHead>
                <TableHead className="text-right">{t('importReviewColumnPrice')}</TableHead>
                <TableHead className="text-right">{t('importReviewColumnTotalCost')}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((tx, idx) => {
                const isRemoved = isLeftOut(tx.sourceLine);
                const isDupExcluded = !removed.has(tx.sourceLine) && isDuplicateExcluded(tx.sourceLine);
                const isDuplicate = importMode === 'add' && duplicateLines.has(tx.sourceLine) && !removed.has(tx.sourceLine);
                const resolution = resolutions[tx.securityKey];
                const replayFlagDetail = replayFlags.get(tx.sourceLine);
                const isUnresolved = !isRemoved && resolution?.status !== 'resolved';
                const isFlagged = !isRemoved && !isUnresolved && !!replayFlagDetail;
                const values = effectiveRow(tx, edits[tx.sourceLine]);
                const issue = isRemoved ? null : rowIssue(values);
                const isBroken = isUnresolved || isFlagged || issue !== null;
                const totalCost = values.quantity != null && values.price != null ? values.quantity * values.price : null;

                return (
                  <TableRow
                    key={tx.sourceLine}
                    ref={(el) => { if (el) rowRefs.current.set(tx.sourceLine, el); }}
                    className={cn(
                      'transition-colors',
                      isRemoved && (isDupExcluded ? 'opacity-60' : 'opacity-40'),
                      isBroken && 'bg-amber-500/[0.06]',
                      flashLine === tx.sourceLine && 'ring-2 ring-inset ring-amber-500/60'
                    )}
                  >
                    <TableCell className="font-mono text-xs text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="max-w-[220px]">
                      {isFlagged ? (
                        <div className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/5 px-2 py-1 text-xs" title={replayFlagDetail}>
                          <AlertCircle className="h-3 w-3 shrink-0 mt-0.5 text-amber-500" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-foreground">{securityLabel(tx)}</span>
                            <span className="block truncate text-[11px] text-amber-600 dark:text-amber-400">{replayFlagDetail}</span>
                          </span>
                        </div>
                      ) : isUnresolved ? (
                        <TickerFixPopover
                          defaultQuery={securityLabel(tx)}
                          onResolved={(fix) => setOverrides((o) => ({ ...o, [tx.securityKey]: fix }))}
                        >
                          <button className="flex w-full items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/5 px-2 py-1 text-left text-xs hover:bg-amber-500/10 transition-colors">
                            <AlertCircle className="h-3 w-3 shrink-0 text-amber-500" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium text-foreground">{securityLabel(tx)}</span>
                              <span className="block truncate text-[11px] text-amber-600 dark:text-amber-400">{t('importReviewUnmatched')}</span>
                            </span>
                          </button>
                        </TickerFixPopover>
                      ) : (
                        <div className="min-w-0">
                          <span className="block truncate font-mono text-xs font-semibold">
                            {resolution.status === 'resolved' ? resolution.candidate.symbol : tx.rawSymbol}
                          </span>
                          <span className="block truncate text-[11px] text-muted-foreground">{securityLabel(tx)}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide',
                          tx.action === 'BUY' ? 'border-border/60 text-foreground/75' : 'border-foreground/40 text-foreground font-semibold'
                        )}
                      >
                        {tx.action === 'BUY' ? t('importReviewActionBuy') : t('importReviewActionSell')}
                      </span>
                      {isDuplicate && (
                        <span className="mt-1 block whitespace-nowrap text-[11px] text-muted-foreground">
                          {t('importReviewDuplicateBadge')}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <DatePicker
                        size="sm"
                        value={values.date ?? ''}
                        disabled={isRemoved}
                        placeholder={t('importReviewEditDate')}
                        aria-label={t('importReviewEditDate')}
                        aria-invalid={issue === 'date'}
                        onChange={(date) => setEdit(tx.sourceLine, { date })}
                        className={cn('w-36', issue === 'date' && 'border-amber-500/60')}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <input
                        type="number"
                        inputMode="decimal"
                        step="any"
                        value={editValue(tx, 'quantity', values.quantity)}
                        disabled={isRemoved}
                        aria-label={t('importReviewEditShares')}
                        aria-invalid={issue === 'quantity'}
                        onChange={(e) => setEdit(tx.sourceLine, { quantity: e.target.value })}
                        className={cn(CELL_INPUT_CLASS, 'text-right', issue === 'quantity' && 'border-amber-500/60')}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          value={editValue(tx, 'price', values.price)}
                          disabled={isRemoved}
                          aria-label={t('importReviewEditPrice')}
                          aria-invalid={issue === 'price'}
                          onChange={(e) => setEdit(tx.sourceLine, { price: e.target.value })}
                          className={cn(CELL_INPUT_CLASS, 'text-right', issue === 'price' && 'border-amber-500/60')}
                        />
                        {tx.priceCurrency && (
                          <span className="shrink-0 text-[11px] text-muted-foreground">{tx.priceCurrency}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                      {totalCost != null ? totalCost.toFixed(2) : '—'}
                    </TableCell>
                    <TableCell>
                      {isDupExcluded ? (
                        <button
                          type="button"
                          onClick={() => setIncludedDuplicates((s) => new Set(s).add(tx.sourceLine))}
                          className="-my-1.5 whitespace-nowrap rounded px-1 py-1.5 text-[11px] font-medium text-foreground/80 underline underline-offset-2 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {t('importReviewDuplicateInclude')}
                        </button>
                      ) : isRemoved ? (
                        <button
                          onClick={() => setRemoved((s) => { const next = new Set(s); next.delete(tx.sourceLine); return next; })}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          title={t('importReviewUndoRemove')}
                          aria-label={t('importReviewUndoRemove')}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <button
                          aria-label={t('importReviewRemoveRow')}
                          onClick={() =>
                            isDuplicate
                              ? setIncludedDuplicates((s) => { const next = new Set(s); next.delete(tx.sourceLine); return next; })
                              : setRemoved((s) => new Set(s).add(tx.sourceLine))
                          }
                          className="text-muted-foreground hover:text-red-400 transition-colors"
                          title={t('importReviewRemoveRow')}
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
                {t('importReviewFixPrompt', { count: brokenRows.length })}{' '}
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
                {t('importReviewReadyCount', { ready: readyRows.length, total: activeRows.length })}
              </p>
            )}
            {excludedDuplicateCount > 0 && (
              <p className="mt-1 text-muted-foreground">{t('importReviewDuplicatesLeftOut', { count: excludedDuplicateCount })}</p>
            )}
            {saveError && <p role="alert" className="mt-1 text-red-400">{saveError}</p>}
          </div>
          <Button
            onClick={() => (importMode === 'replace_all' ? setShowReplaceAllConfirm(true) : handleSave())}
            disabled={brokenRows.length > 0 || activeRows.length === 0 || saving}
            variant={importMode === 'replace_all' ? 'destructive' : 'default'}
            className="shrink-0 gap-1.5"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {saving
              ? t('importReviewSaving')
              : importMode === 'replace_all'
                ? t('importReviewReplaceAllSave')
                : t('importReviewSave', { count: readyRows.length })}
          </Button>
        </div>
      </div>

      <Dialog open={showReplaceAllConfirm} onOpenChange={setShowReplaceAllConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">{t('importReviewReplaceAllConfirmTitle')}</DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              {t('importReviewReplaceAllConfirmBody', { count: manualHoldingCount, transactions: readyRows.length })}
            </DialogDescription>
          </DialogHeader>
          <p className="text-xs leading-relaxed text-muted-foreground">{t('importReviewReplaceAllConfirmSafety')}</p>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setShowReplaceAllConfirm(false)}>
              {t('importReviewReplaceAllConfirmCancel')}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                setShowReplaceAllConfirm(false);
                void handleSave();
              }}
            >
              {t('importReviewReplaceAllConfirmAction')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showLeaveConfirm} onOpenChange={setShowLeaveConfirm}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">{t('importReviewLeaveTitle')}</DialogTitle>
            <DialogDescription className="text-xs">
              {t('importReviewLeaveDescription')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setShowLeaveConfirm(false)}>
              {t('importReviewLeaveKeep')}
            </Button>
            <Button size="sm" variant="destructive" onClick={() => router.push('/holdings')}>
              {t('importReviewLeaveDiscard')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
