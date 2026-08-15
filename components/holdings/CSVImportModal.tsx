'use client';

import { useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Upload, FileText, CheckCircle2, AlertCircle, XCircle,
  Download, ArrowRight, RotateCcw,
} from 'lucide-react';
import type { ImportRow } from '@/app/api/holdings/import/route';

// ─── CSV parsing ─────────────────────────────────────────────────────────────

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  if (nonEmpty.length < 2) return [];

  function splitRow(line: string): string[] {
    const fields: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        fields.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    fields.push(cur.trim());
    return fields;
  }

  const headers = splitRow(nonEmpty[0]).map((h) => h.replace(/^["']|["']$/g, '').trim());
  return nonEmpty.slice(1).map((line) => {
    const vals = splitRow(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
    return obj;
  });
}

// ─── Column name normalisation ────────────────────────────────────────────────
// Maps common brokerage export column names → our field names.

function normaliseKey(raw: string): string {
  const k = raw.toLowerCase().replace(/[\s_\-\.]+/g, '_');
  if (['symbol', 'ticker', 'stock', 'security'].includes(k)) return 'symbol';
  if (['quantity', 'shares', 'qty', 'number_of_shares', 'units'].includes(k)) return 'quantity';
  if ([
    'avg_price', 'average_price', 'cost_basis', 'cost_per_share',
    'average_cost', 'average_cost_basis', 'cost_basis_per_share',
    'price', 'purchase_price', 'unit_cost',
  ].includes(k)) return 'avg_price';
  if (['company_name', 'company', 'name', 'description', 'security_name', 'instrument'].includes(k)) return 'company_name';
  if (['date_purchased', 'date', 'purchase_date', 'date_acquired', 'acquisition_date', 'open_date'].includes(k)) return 'date_purchased';
  if (['asset_type', 'type', 'instrument_type', 'security_type'].includes(k)) return 'asset_type';
  if (['trading_currency', 'currency'].includes(k)) return 'trading_currency';
  if (['purchase_currency', 'account_currency'].includes(k)) return 'purchase_currency';
  return k;
}

function rowToImportRow(raw: Record<string, string>): ParsedRow {
  const mapped: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    mapped[normaliseKey(k)] = v;
  }

  const symbol = mapped['symbol']?.trim().toUpperCase() ?? '';
  const company_name = mapped['company_name']?.trim() || null;

  const rawQty = mapped['quantity']?.replace(/[^0-9.\-]/g, '');
  const quantity = rawQty ? parseFloat(rawQty) : null;

  const rawPrice = mapped['avg_price']?.replace(/[^0-9.\-]/g, '');
  const avg_price = rawPrice ? parseFloat(rawPrice) : null;

  const rawDate = mapped['date_purchased']?.trim() ?? '';
  const date_purchased = rawDate ? normaliseDate(rawDate) : null;

  const asset_type = normaliseAssetType(mapped['asset_type'] ?? '');
  const trading_currency = mapped['trading_currency']?.trim().toUpperCase() || null;
  const purchase_currency = mapped['purchase_currency']?.trim().toUpperCase() || null;

  const errors: string[] = [];
  if (!symbol) errors.push('Symbol is required');
  if (quantity !== null && (isNaN(quantity) || quantity <= 0)) errors.push('Quantity must be > 0');
  if (avg_price !== null && (isNaN(avg_price) || avg_price <= 0)) errors.push('Avg price must be > 0');
  if (date_purchased && !isValidDate(date_purchased)) errors.push('Invalid date');

  return {
    symbol,
    company_name,
    quantity: quantity !== null && !isNaN(quantity) ? quantity : null,
    avg_price: avg_price !== null && !isNaN(avg_price) ? avg_price : null,
    date_purchased: date_purchased && isValidDate(date_purchased) ? date_purchased : null,
    asset_type,
    trading_currency,
    purchase_currency,
    errors,
  };
}

function normaliseDate(raw: string): string {
  // Handle MM/DD/YYYY, DD/MM/YYYY (ambiguous), YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parts = raw.split(/[\/\-\.]/);
  if (parts.length === 3) {
    const [a, b, c] = parts;
    if ((c?.length ?? 0) === 4) {
      // MM/DD/YYYY
      return `${c}-${a?.padStart(2, '0')}-${b?.padStart(2, '0')}`;
    }
    if ((a?.length ?? 0) === 4) {
      // YYYY/MM/DD
      return `${a}-${b?.padStart(2, '0')}-${c?.padStart(2, '0')}`;
    }
  }
  return raw;
}

function isValidDate(s: string): boolean {
  const d = new Date(s);
  return !isNaN(d.getTime()) && s.length >= 8;
}

function normaliseAssetType(raw: string): ImportRow['asset_type'] {
  const v = raw.toLowerCase().trim();
  if (['stock', 'equity', 'common stock', 'common_stock'].includes(v)) return 'stock';
  if (['etf', 'exchange traded fund', 'exchange_traded_fund'].includes(v)) return 'etf';
  if (['crypto', 'cryptocurrency', 'digital currency'].includes(v)) return 'crypto';
  if (['commodity', 'commodities'].includes(v)) return 'commodity';
  if (['forex', 'fx', 'currency'].includes(v)) return 'forex';
  return null;
}

// ─── Template CSV ─────────────────────────────────────────────────────────────

const TEMPLATE_CSV = `symbol,company_name,quantity,avg_price,date_purchased
AAPL,Apple Inc.,10,150.00,2023-01-15
MSFT,Microsoft Corporation,5,280.50,2023-03-20
NVDA,,3,450.00,2023-06-01
BTC/USD,,0.5,30000,2023-07-10
`;

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'bullpen-holdings-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedRow extends ImportRow {
  errors: string[];
}

type Step = 'upload' | 'preview' | 'result';

interface ImportResult {
  imported: number;
  skipped: number;
  errors: { symbol: string; error: string }[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CSVImportModal({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const reset = useCallback(() => {
    setStep('upload');
    setRows([]);
    setFileName('');
    setParseError(null);
    setResult(null);
    setImporting(false);
  }, []);

  const handleClose = useCallback((open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  }, [onOpenChange, reset]);

  const processFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      setParseError('Please upload a .csv file.');
      return;
    }
    setFileName(file.name);
    setParseError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rawRows = parseCSV(text);
      if (rawRows.length === 0) {
        setParseError('The file appears to be empty or has no valid rows.');
        return;
      }
      const parsed = rawRows.map(rowToImportRow).filter((r) => r.symbol || r.errors.length > 0);
      if (parsed.length === 0) {
        setParseError('No symbol column found. Make sure your CSV has a "symbol" or "ticker" column.');
        return;
      }
      setRows(parsed);
      setStep('preview');
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  }, [processFile]);

  const handleImport = useCallback(async () => {
    const validRows = rows.filter((r) => r.errors.length === 0 && r.symbol);
    if (validRows.length === 0) return;
    setImporting(true);
    try {
      const res = await fetch('/api/holdings/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: validRows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Import failed');
      setResult({ imported: data.imported, skipped: data.skipped, errors: data.errors ?? [] });
      if (data.imported > 0) {
        queryClient.invalidateQueries({ queryKey: ['holdings', user?.id] });
        queryClient.invalidateQueries({ queryKey: ['holdings-quotes'] });
      }
      setStep('result');
    } catch (err) {
      setResult({ imported: 0, skipped: 0, errors: [{ symbol: 'all', error: err instanceof Error ? err.message : 'Import failed' }] });
      setStep('result');
    } finally {
      setImporting(false);
    }
  }, [rows, queryClient, user?.id]);

  const validCount = rows.filter((r) => r.errors.length === 0 && r.symbol).length;
  const invalidCount = rows.filter((r) => r.errors.length > 0).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/40">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Upload className="h-4 w-4 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">Import holdings from CSV</DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                {step === 'upload' && 'Upload a CSV file with your holdings'}
                {step === 'preview' && `${fileName} — ${rows.length} row${rows.length !== 1 ? 's' : ''} parsed`}
                {step === 'result' && 'Import complete'}
              </DialogDescription>
            </div>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mt-3">
            {(['upload', 'preview', 'result'] as Step[]).map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div className={cn(
                  'h-1.5 w-8 rounded-full transition-colors',
                  step === s ? 'bg-primary' :
                  (step === 'preview' && s === 'upload') || step === 'result' ? 'bg-primary/40' : 'bg-border'
                )} />
              </div>
            ))}
          </div>
        </DialogHeader>

        <div className="px-6 py-5">
          {/* ── STEP 1: Upload ── */}
          {step === 'upload' && (
            <div className="space-y-4">
              {/* Drop zone */}
              <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-colors',
                  dragOver
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-border/80 hover:bg-muted/30'
                )}
              >
                <FileText className="h-8 w-8 mx-auto mb-3 text-muted-foreground/85" />
                <p className="text-sm font-medium text-foreground">Drop your CSV file here</p>
                <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              {parseError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2.5">
                  <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-px" />
                  <p className="text-xs text-red-300">{parseError}</p>
                </div>
              )}

              {/* Format reference */}
              <div className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-2">
                <p className="text-xs font-medium text-foreground/80">Expected columns</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {[
                    ['symbol / ticker', 'Required — e.g. AAPL'],
                    ['quantity / shares', 'Number of shares'],
                    ['avg_price / cost_basis', 'Cost per share'],
                    ['date_purchased / date', 'YYYY-MM-DD or MM/DD/YYYY'],
                    ['company_name / description', 'Optional — auto-resolved'],
                    ['trading_currency / currency', 'Optional — e.g. USD'],
                  ].map(([col, note]) => (
                    <div key={col} className="flex items-baseline gap-1.5">
                      <code className="text-[11px] font-mono text-primary/80 shrink-0">{col}</code>
                      <span className="text-[11px] text-muted-foreground/80 truncate">{note}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={(e) => { e.stopPropagation(); downloadTemplate(); }}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                Download template CSV
              </button>
            </div>
          )}

          {/* ── STEP 2: Preview ── */}
          {step === 'preview' && (
            <div className="space-y-3">
              {/* Summary chips */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 text-xs font-medium text-emerald-500">
                  <CheckCircle2 className="h-3 w-3" />
                  {validCount} valid
                </span>
                {invalidCount > 0 && (
                  <span className="flex items-center gap-1.5 rounded-full bg-red-500/10 border border-red-500/20 px-2.5 py-1 text-xs font-medium text-red-400">
                    <XCircle className="h-3 w-3" />
                    {invalidCount} invalid (will be skipped)
                  </span>
                )}
                <span className="text-xs text-muted-foreground/80 ml-auto">
                  company names auto-resolved from BullPen database
                </span>
              </div>

              {/* Table */}
              <div className="rounded-xl border border-border/40 overflow-hidden">
                <div className="overflow-x-auto max-h-72 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted/60 backdrop-blur-sm border-b border-border/40">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground/85 uppercase tracking-wider text-[11px]">Symbol</th>
                        <th className="text-right px-3 py-2 font-semibold text-muted-foreground/85 uppercase tracking-wider text-[11px]">Quantity</th>
                        <th className="text-right px-3 py-2 font-semibold text-muted-foreground/85 uppercase tracking-wider text-[11px]">Avg Price</th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground/85 uppercase tracking-wider text-[11px]">Date</th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground/85 uppercase tracking-wider text-[11px]">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {rows.map((row, i) => (
                        <tr
                          key={i}
                          className={cn(
                            'transition-colors',
                            row.errors.length > 0
                              ? 'bg-red-500/5 opacity-60'
                              : 'hover:bg-muted/20'
                          )}
                        >
                          <td className="px-3 py-2 font-mono font-semibold tracking-tight">
                            {row.symbol || <span className="text-muted-foreground italic">empty</span>}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                            {row.quantity ?? '—'}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                            {row.avg_price != null ? `$${row.avg_price.toFixed(2)}` : '—'}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {row.date_purchased ?? '—'}
                          </td>
                          <td className="px-3 py-2">
                            {row.errors.length === 0 ? (
                              <span className="flex items-center gap-1 text-emerald-500">
                                <CheckCircle2 className="h-3 w-3" /> Ready
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-red-400" title={row.errors.join('; ')}>
                                <XCircle className="h-3 w-3" />
                                {row.errors[0]}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {validCount === 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
                  <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-px" />
                  <p className="text-xs text-amber-300">
                    No valid rows to import. Check that your CSV has a <code className="font-mono">symbol</code> column.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 3: Result ── */}
          {step === 'result' && result && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                {result.imported > 0 && (
                  <div className="flex-1 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
                    <p className="text-2xl font-bold text-emerald-400 tabular-nums">{result.imported}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">imported</p>
                  </div>
                )}
                {result.skipped > 0 && (
                  <div className="flex-1 rounded-xl border border-border/40 bg-muted/20 p-4 text-center">
                    <p className="text-2xl font-bold tabular-nums">{result.skipped}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">skipped (already in portfolio)</p>
                  </div>
                )}
                {result.errors.length > 0 && (
                  <div className="flex-1 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center">
                    <p className="text-2xl font-bold text-red-400 tabular-nums">{result.errors.length}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">failed</p>
                  </div>
                )}
              </div>

              {result.errors.length > 0 && (
                <div className="rounded-xl border border-border/40 overflow-hidden max-h-40 overflow-y-auto">
                  <div className="px-3 py-2 bg-muted/40 border-b border-border/40">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">Errors</p>
                  </div>
                  {result.errors.map((e, i) => (
                    <div key={i} className="flex items-center gap-2.5 px-3 py-2 border-b border-border/20 last:border-0">
                      <code className="font-mono text-xs font-semibold shrink-0">{e.symbol}</code>
                      <span className="text-xs text-muted-foreground">{e.error}</span>
                    </div>
                  ))}
                </div>
              )}

              {result.imported === 0 && result.skipped === 0 && result.errors.length === 0 && (
                <p className="text-sm text-center text-muted-foreground py-4">Nothing was imported.</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border/40 flex items-center justify-between gap-3">
          {step === 'upload' && (
            <>
              <Button variant="ghost" size="sm" onClick={() => handleClose(false)}>Cancel</Button>
              <Button size="sm" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                Choose file
              </Button>
            </>
          )}

          {step === 'preview' && (
            <>
              <Button variant="ghost" size="sm" onClick={reset} className="gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" />
                Start over
              </Button>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {validCount} holding{validCount !== 1 ? 's' : ''} will be added
                </span>
                <Button
                  size="sm"
                  disabled={validCount === 0 || importing}
                  onClick={handleImport}
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {importing ? (
                    <>Importing…</>
                  ) : (
                    <>Import <ArrowRight className="h-3.5 w-3.5" /></>
                  )}
                </Button>
              </div>
            </>
          )}

          {step === 'result' && (
            <>
              <Button variant="ghost" size="sm" onClick={reset} className="gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" />
                Import another file
              </Button>
              <Button size="sm" onClick={() => handleClose(false)}>
                Done
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
