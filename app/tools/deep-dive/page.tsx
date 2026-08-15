'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Telescope, ChevronRight, Trash2, Clock, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBackground } from '@/hooks/use-background';
import { QuotaIndicator } from '@/components/billing/QuotaIndicator';
import { LensPicker } from '@/components/deep-dive/LensPicker';
import { TickerSelector, type SearchResult } from '@/components/tools/buy-here/TickerSelector';
import { LENS_LABELS, type DeepDiveLens, type Verdict } from '@/lib/ai/deep-dive/schema';
import type { SavedDivePreview } from '@/app/api/ai/deep-dive/route';

const POPULAR = ['NVDA', 'AAPL', 'MSFT', 'TSLA', 'AMZN', 'GOOGL'];

const STANCE_DOT: Record<Verdict['stance'], string> = {
  bullish: 'bg-emerald-500',
  bearish: 'bg-red-500',
  neutral: 'bg-muted-foreground/40',
  mixed: 'bg-amber-500',
};

export default function DeepDiveLanding() {
  const router = useRouter();
  const { hasAnimatedBackground } = useBackground();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [lens, setLens] = useState<DeepDiveLens>('full');

  const { data, isLoading } = useQuery<{ dives: SavedDivePreview[] }>({
    queryKey: ['deep-dive-list'],
    queryFn: () => fetch('/api/ai/deep-dive').then((r) => r.json()),
    staleTime: 30_000,
  });
  const dives = data?.dives ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch('/api/ai/deep-dive', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deep-dive-list'] }),
  });

  const go = (sym: string) => {
    const clean = sym.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, '');
    if (!clean) return;
    router.push(`/tools/deep-dive/${clean}?lens=${lens}`);
  };

  return (
    <div className={cn('min-h-screen', hasAnimatedBackground ? '' : 'bg-background')}>
      <main className="container mx-auto max-w-3xl py-10 px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="mb-8">
          <Link
            href="/tools"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-5 group"
          >
            <ArrowLeft className="h-3 w-3 transition-transform group-hover:-translate-x-0.5" />
            All tools
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 shrink-0">
              <Telescope className="h-5 w-5 text-primary" aria-hidden />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">AI Deep Dive</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Analyst-grade reports: results, guidance, valuation, bull vs bear, risks.</p>
            </div>
          </div>
        </div>

        {/* Generate panel */}
        <Card className="mb-8">
          <CardContent className="p-5 sm:p-6 space-y-4">
            <form
              onSubmit={(e) => { e.preventDefault(); if (selected) go(selected.ticker); }}
              className="flex flex-col sm:flex-row gap-2.5"
            >
              <TickerSelector
                value={selected}
                onChange={setSelected}
                placeholder="Search by ticker or company name..."
                className="flex-1"
              />
              <Button type="submit" size="lg" disabled={!selected} className="gap-2 shrink-0 rounded-full animate-ai-pill-shine">
                <Telescope className="h-4 w-4" /> Analyze
              </Button>
            </form>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-muted-foreground/80">Lens:</span>
              <LensPicker value={lens} onChange={setLens} />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] text-muted-foreground/80">Popular:</span>
              {POPULAR.map((sym) => (
                <button
                  key={sym}
                  onClick={() => go(sym)}
                  className="rounded-md border border-border/60 px-2 py-0.5 text-xs font-mono font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {sym}
                </button>
              ))}
            </div>

            <div className="pt-1">
              <QuotaIndicator feature="deep_dive" unit={{ singular: 'deep dive', plural: 'deep dives' }} />
            </div>
          </CardContent>
        </Card>

        {/* Saved dives */}
        <div className="flex items-center gap-2 mb-3">
          <Clock className="h-3.5 w-3.5 text-muted-foreground/85" />
          <span className="text-[11px] uppercase tracking-widest text-muted-foreground/85 font-semibold">Your deep dives</span>
          {dives.length > 0 && <span className="text-[11px] text-muted-foreground/80 tabular-nums">({dives.length})</span>}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
          </div>
        ) : dives.length === 0 ? (
          <EmptyState
            pose="thinking"
            title="No deep dives yet"
            description="Enter a ticker above and the AI analyst will dig into the business, financials, and risks."
            imageSize={150}
            className="py-6"
          />
        ) : (
          <div className="space-y-2">
            {dives.map((d) => (
              <SavedDiveRow key={d.id} dive={d} onDelete={() => deleteMutation.mutate(d.id)} />
            ))}
          </div>
        )}

      </main>
    </div>
  );
}

function SavedDiveRow({ dive: d, onDelete }: { dive: SavedDivePreview; onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false);

  return (
    <div className="group flex items-center gap-3 rounded-xl border border-border/50 bg-card px-4 py-3 hover:border-border/80 transition-colors">
      <Link href={`/tools/deep-dive/${d.symbol}`} className="flex-1 min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
        <div className="flex items-center gap-2 mb-0.5">
          {d.stance && <span className={cn('h-2 w-2 rounded-full shrink-0', STANCE_DOT[d.stance])} />}
          <span className="text-sm font-bold font-mono text-foreground">{d.symbol}</span>
          {d.companyName && <span className="text-xs text-muted-foreground truncate">{d.companyName}</span>}
        </div>
        <p className="text-xs text-muted-foreground/80 truncate">
          {d.headline ?? `${LENS_LABELS[d.lens]} · ${new Date(d.createdAt).toLocaleDateString()}`}
        </p>
      </Link>
      <div className="flex items-center gap-1 shrink-0">
        {confirm ? (
          <>
            <button
              onClick={onDelete}
              className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Delete
            </button>
            <button
              onClick={() => setConfirm(false)}
              className="text-xs text-muted-foreground/85 hover:text-muted-foreground px-2 py-1 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setConfirm(true)}
              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-muted-foreground/80 hover:text-red-400 p-1.5 rounded transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Delete ${d.symbol} deep dive`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <ChevronRight className="h-4 w-4 text-muted-foreground/80 group-hover:text-muted-foreground/80 transition-colors" aria-hidden />
          </>
        )}
      </div>
    </div>
  );
}
