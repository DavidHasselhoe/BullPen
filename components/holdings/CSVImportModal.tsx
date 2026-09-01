'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ProcessingScreen } from '@/components/ui/ProcessingScreen';
import { cn } from '@/lib/utils';
import { Upload, FileText, CheckCircle2, AlertCircle, XCircle, Sparkles, Wallet, GitBranch, ArrowRight } from 'lucide-react';

// How long each simulated phase holds before advancing, while the real
// request is still in flight — this is one request/response, not SSE, so
// the phases have no real server-reported signal. They just give the wait
// a sense of forward motion instead of a single frozen spinner.
const PHASE_HOLD_MS = 3200;
const PHASE_COUNT = 3;

type Step = 'upload' | 'processing' | 'success' | 'error';

interface ParseSummary {
  fileName: string;
  totalTransactions: number;
  needsAttention: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // strip the "data:<mime>;base64," prefix
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function CSVImportModal({ open, onOpenChange }: Props) {
  const { t } = useTranslation('holdings');
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [dragOver, setDragOver] = useState(false);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [summary, setSummary] = useState<ParseSummary | null>(null);
  const [importId, setImportId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // True for a brief hold once the request has actually resolved, before
  // swapping to the success screen — lets the progress bar visibly finish
  // its run to 100% instead of jumping from ~91% straight to the result.
  const [completing, setCompleting] = useState(false);
  const completeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const phaseLabels = [t('csvImportPhaseReading'), t('csvImportPhaseExtracting'), t('csvImportPhaseMatching')];

  const reset = useCallback(() => {
    if (completeTimeoutRef.current) clearTimeout(completeTimeoutRef.current);
    setStep('upload');
    setPhaseIndex(0);
    setSummary(null);
    setImportId(null);
    setErrorMessage(null);
    setCompleting(false);
  }, []);

  const handleClose = useCallback((next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  }, [onOpenChange, reset]);

  useEffect(() => {
    return () => {
      if (completeTimeoutRef.current) clearTimeout(completeTimeoutRef.current);
    };
  }, []);

  // Advance the simulated phase while a parse request is in flight.
  useEffect(() => {
    if (step !== 'processing' || completing) return;
    const id = setInterval(() => {
      setPhaseIndex((i) => Math.min(i + 1, PHASE_COUNT - 1));
    }, PHASE_HOLD_MS);
    return () => clearInterval(id);
  }, [step, completing]);

  const processFile = useCallback(async (file: File) => {
    setStep('processing');
    setPhaseIndex(0);
    setErrorMessage(null);
    try {
      const fileBase64 = await fileToBase64(file);
      const res = await fetch('/api/holdings/import/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileBase64, fileName: file.name }),
      });
      let data: { error?: string; summary?: unknown; importId?: string };
      try {
        data = await res.json();
      } catch {
        // A server crash (e.g. an unhandled upstream error) can return an
        // empty or non-JSON body — don't surface the raw parse TypeError.
        throw new Error(t('csvImportFailed'));
      }
      if (!res.ok) {
        throw new Error(data.error ?? t('csvImportFailed'));
      }
      setSummary(data.summary as ParseSummary);
      setImportId(data.importId ?? null);
      // Hold on the processing screen with the bar driven to 100% for a
      // beat, rather than cutting straight to the result the instant the
      // request resolves — see ProcessingScreen's `complete` prop.
      setCompleting(true);
      completeTimeoutRef.current = setTimeout(() => setStep('success'), 1200);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t('csvImportFailed'));
      setStep('error');
    }
  }, [t]);

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

  const handleContinueToReview = useCallback(() => {
    if (!importId) return;
    handleClose(false);
    router.push(`/holdings/import/${importId}`);
  }, [importId, router, handleClose]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl gap-0 p-0 overflow-hidden">
        {step === 'upload' && (
          <>
            <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/40">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Upload className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <DialogTitle className="flex items-center gap-1.5 text-base font-semibold">
                    {t('csvImportTitle')}
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                  </DialogTitle>
                  <DialogDescription className="text-xs mt-0.5">
                    {t('csvImportSubtitle')}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="px-6 py-5 space-y-4">
              <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-colors',
                  dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-border/80 hover:bg-muted/30'
                )}
              >
                <FileText className="h-8 w-8 mx-auto mb-3 text-muted-foreground/85" />
                <p className="text-sm font-medium text-foreground">{t('csvImportDropHere')}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('csvImportBrowseHint')}</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
                <p className="text-xs font-medium text-foreground/80 mb-1">{t('csvImportWhatToInclude')}</p>
                <p className="text-[11px] text-muted-foreground/85 leading-relaxed">{t('csvImportWhatToIncludeBody')}</p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-border/40 flex items-center justify-between gap-3">
              <Button variant="ghost" size="sm" onClick={() => handleClose(false)}>{t('csvImportCancel')}</Button>
              <Button size="sm" onClick={() => fileInputRef.current?.click()} className="gap-1.5">
                <Upload className="h-3.5 w-3.5" />
                {t('csvImportChooseFile')}
              </Button>
            </div>
          </>
        )}

        {step === 'processing' && (
          <div className="px-6 py-4">
            <ProcessingScreen
              phase={{ index: phaseIndex, total: PHASE_COUNT, label: phaseLabels[phaseIndex] }}
              subtext={t('csvImportProcessingSubtext')}
              complete={completing}
              completeMessage={t('csvImportProcessingComplete')}
            />
          </div>
        )}

        {step === 'success' && summary && (
          <>
            <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/40">
              <DialogTitle className="flex items-center gap-2 text-base font-semibold">
                {t('csvImportSuccessTitle')}
                <CheckCircle2 className="h-4 w-4 text-primary" />
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5 truncate">{summary.fileName}</DialogDescription>
            </DialogHeader>

            <div className="px-6 py-5 space-y-5">
              <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
                <p className="text-xs text-muted-foreground">{t('csvImportTotalImported')}</p>
                <p className="text-3xl font-bold tabular-nums mt-0.5">{summary.totalTransactions}</p>
                {summary.needsAttention > 0 && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {t('csvImportNeedsAttention', { count: summary.needsAttention })}
                  </p>
                )}
              </div>

              <div>
                <p className="text-xs font-medium text-foreground/80 mb-2">{t('csvImportRemindersTitle')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="rounded-lg border border-border/40 p-3">
                    <Wallet className="h-4 w-4 text-muted-foreground mb-1.5" />
                    <p className="text-xs font-medium text-foreground">{t('csvImportReminderDividendsTitle')}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{t('csvImportReminderDividendsBody')}</p>
                  </div>
                  <div className="rounded-lg border border-border/40 p-3">
                    <GitBranch className="h-4 w-4 text-muted-foreground mb-1.5" />
                    <p className="text-xs font-medium text-foreground">{t('csvImportReminderSplitsTitle')}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{t('csvImportReminderSplitsBody')}</p>
                  </div>
                  <div className="rounded-lg border border-border/40 p-3">
                    <CheckCircle2 className="h-4 w-4 text-muted-foreground mb-1.5" />
                    <p className="text-xs font-medium text-foreground">{t('csvImportReminderTickersTitle')}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{t('csvImportReminderTickersBody')}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-border/40 flex items-center justify-end">
              <Button size="sm" onClick={handleContinueToReview} className="gap-1.5">
                {t('csvImportContinueToReview')} <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </>
        )}

        {step === 'error' && (
          <>
            <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/40">
              <DialogTitle className="text-base font-semibold">{t('csvImportErrorTitle')}</DialogTitle>
            </DialogHeader>
            <div className="px-6 py-5">
              <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2.5">
                <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-px" />
                <p className="text-xs text-red-300">{errorMessage}</p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-border/40 flex items-center justify-between gap-3">
              <Button variant="ghost" size="sm" onClick={() => handleClose(false)}>{t('csvImportClose')}</Button>
              <Button size="sm" onClick={reset}>{t('csvImportTryAgain')}</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
