'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, TrendingUp, DollarSign, Scissors, Rocket } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBackground } from '@/hooks/use-background';
import type {
  EarningsCalendarItem,
  DividendsCalendarItem,
  SplitsCalendarItem,
  IPOCalendarItem,
} from '@/lib/twelvedata/twelvedata-client';

// ─── Types ────────────────────────────────────────────────────────────────────

type TabKey = 'earnings' | 'dividends' | 'splits' | 'ipo';

interface CalendarResponse<T> {
  success: boolean;
  data?: T[];
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWeekRange(offsetWeeks = 0) {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - now.getDay() + 1 + offsetWeeks * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    from: monday.toISOString().slice(0, 10),
    to: sunday.toISOString().slice(0, 10),
    label: offsetWeeks === 0 ? 'This week' : offsetWeeks === 1 ? 'Next week' : `+${offsetWeeks}w`,
  };
}

function fmtDate(d: string) {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtNum(n: number | null | undefined, prefix = '') {
  if (n == null) return '—';
  return `${prefix}${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
      <CalendarDays className="h-8 w-8 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">No {label} events this week</p>
    </div>
  );
}

// ─── Tab content components ───────────────────────────────────────────────────

function EarningsTab({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useQuery<CalendarResponse<EarningsCalendarItem>>({
    queryKey: ['calendar-earnings', from, to],
    queryFn: async () => {
      const res = await fetch(`/api/calendar/earnings?from=${from}&to=${to}`);
      return res.json();
    },
    staleTime: 60 * 60 * 1000,
  });

  if (isLoading) return <LoadingRows />;
  if (!data?.data?.length) return <EmptyState label="earnings" />;

  return (
    <div className="divide-y divide-border">
      {data.data.map((e, i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-3 hover:bg-muted/20 transition-colors px-2 -mx-2 rounded-md">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Link href={`/stock/${e.symbol}`} className="font-semibold text-sm hover:text-primary transition-colors font-mono">
                {e.symbol}
              </Link>
              {e.name && <span className="text-xs text-muted-foreground truncate">{e.name}</span>}
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
              <span>{fmtDate(e.date)}</span>
              {e.time && <span className="capitalize">{e.time}</span>}
              {e.fiscal_quarter && <Badge variant="outline" className="text-xs h-4 px-1">{e.fiscal_quarter}</Badge>}
            </div>
          </div>
          <div className="text-right text-xs shrink-0 space-y-0.5">
            {e.eps_estimate != null && (
              <div className="text-muted-foreground">EPS est. <span className="text-foreground font-medium tabular-nums">{fmtNum(e.eps_estimate, '$')}</span></div>
            )}
            {e.revenue_estimate != null && (
              <div className="text-muted-foreground">Rev est. <span className="text-foreground font-medium tabular-nums">{fmtNum(e.revenue_estimate / 1e9)}B</span></div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function DividendsTab({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useQuery<CalendarResponse<DividendsCalendarItem>>({
    queryKey: ['calendar-dividends', from, to],
    queryFn: async () => {
      const res = await fetch(`/api/calendar/dividends?from=${from}&to=${to}`);
      return res.json();
    },
    staleTime: 60 * 60 * 1000,
  });

  if (isLoading) return <LoadingRows />;
  if (!data?.data?.length) return <EmptyState label="dividend" />;

  return (
    <div className="divide-y divide-border">
      {data.data.map((d, i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-3 hover:bg-muted/20 transition-colors px-2 -mx-2 rounded-md">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Link href={`/stock/${d.symbol}`} className="font-semibold text-sm hover:text-primary transition-colors font-mono">
                {d.symbol}
              </Link>
              {d.name && <span className="text-xs text-muted-foreground truncate">{d.name}</span>}
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
              <span>Ex-div: {fmtDate(d.ex_dividend_date)}</span>
              {d.payment_date && <span>Pay: {fmtDate(d.payment_date)}</span>}
              {d.frequency && <span className="capitalize">{d.frequency}</span>}
            </div>
          </div>
          {d.dividend_amount != null && (
            <div className="text-right text-sm font-semibold tabular-nums text-emerald-500 shrink-0">
              ${d.dividend_amount.toFixed(4)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SplitsTab({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useQuery<CalendarResponse<SplitsCalendarItem>>({
    queryKey: ['calendar-splits', from, to],
    queryFn: async () => {
      const res = await fetch(`/api/calendar/splits?from=${from}&to=${to}`);
      return res.json();
    },
    staleTime: 60 * 60 * 1000,
  });

  if (isLoading) return <LoadingRows />;
  if (!data?.data?.length) return <EmptyState label="split" />;

  return (
    <div className="divide-y divide-border">
      {data.data.map((s, i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-3 hover:bg-muted/20 transition-colors px-2 -mx-2 rounded-md">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Link href={`/stock/${s.symbol}`} className="font-semibold text-sm hover:text-primary transition-colors font-mono">
                {s.symbol}
              </Link>
              {s.name && <span className="text-xs text-muted-foreground truncate">{s.name}</span>}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{fmtDate(s.date)}</p>
          </div>
          {s.ratio && (
            <Badge variant="secondary" className="shrink-0 font-mono text-xs">{s.ratio}</Badge>
          )}
        </div>
      ))}
    </div>
  );
}

function IPOTab({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useQuery<CalendarResponse<IPOCalendarItem>>({
    queryKey: ['calendar-ipo', from, to],
    queryFn: async () => {
      const res = await fetch(`/api/calendar/ipo?from=${from}&to=${to}`);
      return res.json();
    },
    staleTime: 60 * 60 * 1000,
  });

  if (isLoading) return <LoadingRows />;
  if (!data?.data?.length) return <EmptyState label="IPO" />;

  return (
    <div className="divide-y divide-border">
      {data.data.map((ipo, i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-3 hover:bg-muted/20 transition-colors px-2 -mx-2 rounded-md">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm font-mono">{ipo.symbol || '—'}</span>
              {ipo.name && <span className="text-xs text-muted-foreground truncate">{ipo.name}</span>}
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
              <span>{fmtDate(ipo.date)}</span>
              {ipo.exchange && <span>{ipo.exchange}</span>}
              {ipo.status && <Badge variant="outline" className="text-xs h-4 px-1 capitalize">{ipo.status}</Badge>}
            </div>
          </div>
          {(ipo.price_from != null || ipo.price_to != null) && (
            <div className="text-right text-xs shrink-0 text-muted-foreground">
              <span className="text-foreground font-medium tabular-nums">
                {ipo.price_from != null ? `$${ipo.price_from}` : ''}
                {ipo.price_from != null && ipo.price_to != null ? ' – ' : ''}
                {ipo.price_to != null ? `$${ipo.price_to}` : ''}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-3 py-2">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-36" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

// ─── Tab config ───────────────────────────────────────────────────────────────

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'earnings',  label: 'Earnings',  icon: TrendingUp },
  { key: 'dividends', label: 'Dividends', icon: DollarSign },
  { key: 'splits',    label: 'Splits',    icon: Scissors },
  { key: 'ipo',       label: 'IPOs',      icon: Rocket },
];

const WEEK_OFFSETS = [0, 1, 2, 3];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const { hasAnimatedBackground } = useBackground();
  const [activeTab, setActiveTab] = useState<TabKey>('earnings');
  const [weekOffset, setWeekOffset] = useState(0);

  const { from, to, label } = getWeekRange(weekOffset);

  return (
    <div className={cn('min-h-screen', hasAnimatedBackground ? '' : 'bg-background')}>
      <main className="container mx-auto max-w-4xl py-10 px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <CalendarDays className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Market Events Calendar</h1>
            <p className="text-muted-foreground mt-0.5">Earnings, dividends, splits, and IPOs</p>
          </div>
        </div>

        {/* Week selector */}
        <div className="flex items-center gap-1 mb-6">
          {WEEK_OFFSETS.map((offset) => {
            const { label: wLabel } = getWeekRange(offset);
            return (
              <button
                key={offset}
                onClick={() => setWeekOffset(offset)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition-all border',
                  weekOffset === offset
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/20'
                )}
              >
                {wLabel}
              </button>
            );
          })}
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            {from} → {to}
          </span>
        </div>

        <Card>
          <CardHeader className="pb-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{label}</CardTitle>
            </div>
            {/* Tabs */}
            <div className="flex gap-0 border-b border-border mt-3 -mx-6 px-6 overflow-x-auto">
              {TABS.map(({ key, label: tLabel, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={cn(
                    'flex items-center gap-1.5 pb-2.5 mr-6 text-sm font-medium whitespace-nowrap transition-colors border-b-2',
                    activeTab === key
                      ? 'text-foreground border-primary'
                      : 'text-muted-foreground border-transparent hover:text-foreground'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tLabel}
                </button>
              ))}
            </div>
          </CardHeader>

          <CardContent className="pt-4">
            {activeTab === 'earnings'  && <EarningsTab from={from} to={to} />}
            {activeTab === 'dividends' && <DividendsTab from={from} to={to} />}
            {activeTab === 'splits'    && <SplitsTab from={from} to={to} />}
            {activeTab === 'ipo'       && <IPOTab from={from} to={to} />}
          </CardContent>
        </Card>

      </main>
    </div>
  );
}
