'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ClampedText } from '@/components/ui/ClampedText';
import { Telescope, ChevronRight, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIntlLocale } from '@/hooks/use-intl-locale';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { QuotaIndicator } from '@/components/billing/QuotaIndicator';
import { ToolPage, ToolHeader, ToolSectionTitle } from '@/components/tools/ToolHeader';
import { TickerSelector, type SearchResult } from '@/components/tools/buy-here/TickerSelector';
import type { Verdict } from '@/lib/ai/deep-dive/schema';
import type { SavedDivePreview } from '@/app/api/ai/deep-dive/route';

const POPULAR = [
  { ticker: 'NVDA', name: 'NVIDIA' },
  { ticker: 'AAPL', name: 'Apple' },
  { ticker: 'MSFT', name: 'Microsoft' },
  { ticker: 'TSLA', name: 'Tesla' },
  { ticker: 'AMZN', name: 'Amazon' },
  { ticker: 'GOOGL', name: 'Alphabet' },
];

const STANCE_DOT: Record<Verdict['stance'], string> = {
  bullish: 'bg-emerald-500',
  bearish: 'bg-red-500',
  neutral: 'bg-muted-foreground/40',
  mixed: 'bg-amber-500',
};

const STANCE_LABEL: Record<Verdict['stance'], [key: string, fallback: string]> = {
  bullish: ['deepDiveStanceBullish', 'Bullish'],
  bearish: ['deepDiveStanceBearish', 'Bearish'],
  neutral: ['deepDiveStanceNeutral', 'Neutral'],
  mixed: ['deepDiveStanceMixed', 'Mixed'],
};

export default function DeepDiveLanding() {
  const { t } = useTranslation('tools');
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<SearchResult | null>(null);

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
    router.push(`/tools/deep-dive/${clean}?new=1`);
  };

  return (
    <ToolPage>
      <ToolHeader
        icon={<Telescope />}
        title={t('deepDiveTitle', 'AI Deep Dive')}
        description={t('deepDiveSubtitle', 'Analyst-grade reports: results, guidance, valuation, bull vs bear, risks.')}
      />

      {/* Generate panel */}
      <Card className="mb-10 py-0">
        <CardContent className="space-y-4 p-5 sm:p-6">
          <form
            onSubmit={(e) => { e.preventDefault(); if (selected) go(selected.ticker); }}
            className="flex flex-col gap-2.5 sm:flex-row"
          >
            <TickerSelector
              value={selected}
              onChange={setSelected}
              placeholder={t('compareSearchPlaceholder','Search by ticker or company name...')}
              className="flex-1"
            />
            <Button type="submit" size="lg" disabled={!selected} className="shrink-0 gap-2 rounded-full animate-ai-pill-shine">
              <Telescope className="h-4 w-4" /> {t('deepDiveAnalyzeButton', 'Analyze')}
            </Button>
          </form>

          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-0.5 text-xs text-muted-foreground">{t('deepDivePopularLabel', 'Popular:')}</span>
            {POPULAR.map(({ ticker, name }) => (
              <button
                key={ticker}
                type="button"
                onClick={() => go(ticker)}
                title={name}
                className="flex items-center gap-2 rounded-full border border-border bg-background py-1 pl-1 pr-3 text-sm transition-colors duration-150 hover:border-foreground/20 hover:bg-accent/50 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <CompanyLogo size={22} ticker={ticker} name={name} className="shrink-0" />
                <span className="font-medium">{ticker}</span>
              </button>
            ))}
          </div>

          <QuotaIndicator feature="deep_dive" unit={{ singular: 'deep dive', plural: 'deep dives' }} />
        </CardContent>
      </Card>

      {/* Saved dives */}
      <ToolSectionTitle meta={dives.length > 0 ? dives.length : undefined}>
        {t('deepDiveYourDives', 'Your deep dives')}
      </ToolSectionTitle>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[84px] w-full rounded-xl" />)}
        </div>
      ) : dives.length === 0 ? (
        <EmptyState
          pose="thinking"
          title={t('deepDiveEmptyTitle', 'No deep dives yet')}
          description={t('deepDiveEmptyDescription', 'Enter a ticker above and the AI analyst will dig into the business, financials, and risks.')}
          imageSize={150}
          className="py-6"
        />
      ) : (
        <ul className="space-y-2">
          {dives.map((d) => (
            <SavedDiveRow key={d.id} dive={d} onDelete={() => deleteMutation.mutate(d.id)} />
          ))}
        </ul>
      )}
    </ToolPage>
  );
}

function SavedDiveRow({ dive: d, onDelete }: { dive: SavedDivePreview; onDelete: () => void }) {
  const { t } = useTranslation('tools');
  const locale = useIntlLocale();
  const [confirm, setConfirm] = useState(false);
  const date = new Date(d.createdAt).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    // The ticker link is stretched over the whole row (after:inset-0), so the
    // row is still one big target while the headline's Show more toggle and the
    // delete controls, lifted above it with z-10, stay real buttons instead of
    // buttons nested inside a link.
    <li className="group relative flex items-start gap-3 rounded-xl border border-border/50 bg-card px-4 py-3 transition-colors hover:border-border focus-within:border-border">
      <CompanyLogo size={36} ticker={d.symbol} name={d.companyName ?? d.symbol} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <Link
            href={`/tools/deep-dive/${d.symbol}`}
            className="shrink-0 text-sm font-semibold text-foreground after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            {d.symbol}
          </Link>
          {d.companyName && (
            // clamp-ok: company name beside its ticker; the report it links to shows it in full
            <span className="min-w-0 truncate text-xs text-muted-foreground">{d.companyName}</span>
          )}
        </div>
        {d.headline && (
          <ClampedText className="mt-0.5 text-sm text-foreground/85" toggleClassName="relative z-10">
            {d.headline}
          </ClampedText>
        )}
        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          {d.stance && (
            <>
              <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STANCE_DOT[d.stance])} aria-hidden />
              <span className="font-medium text-foreground/80">{t(...STANCE_LABEL[d.stance])}</span>
              <span aria-hidden>·</span>
            </>
          )}
          <time dateTime={d.createdAt} className="tabular-nums">{date}</time>
        </div>
      </div>
      <div className="relative z-10 flex shrink-0 items-center gap-1 self-center">
        {confirm ? (
          <>
            <button
              type="button"
              onClick={onDelete}
              className="rounded px-2 py-1 text-xs text-red-400 transition-colors hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('deepDiveDeleteButton', 'Delete')}
            </button>
            <button
              type="button"
              onClick={() => setConfirm(false)}
              className="rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('deepDiveCancelButton', 'Cancel')}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setConfirm(true)}
              className="rounded p-1.5 text-muted-foreground opacity-0 transition-all hover:text-red-400 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 [@media(hover:none)]:opacity-100"
              aria-label={t('deepDiveDeleteAriaLabel', 'Delete {{symbol}} deep dive', { symbol: d.symbol })}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <ChevronRight className="pointer-events-none h-4 w-4 text-muted-foreground" aria-hidden />
          </>
        )}
      </div>
    </li>
  );
}
