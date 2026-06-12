'use client';

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CalendarDays, TrendingUp, DollarSign, Scissors, Rocket, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBackground } from '@/hooks/use-background';
import { slugToAssetPath } from '@/lib/assets/asset-type';
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

/** Returns the ISO week range for a given offset. Uses UTC to avoid DST/timezone issues. */
function getWeekRange(offsetWeeks = 0) {
  const now = new Date();
  const dow = now.getUTCDay(); // 0 = Sun
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  const monday = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(),
    now.getUTCDate() - daysSinceMonday + offsetWeeks * 7,
  ));
  const sunday = new Date(Date.UTC(
    monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 6,
  ));
  return {
    from: monday.toISOString().slice(0, 10),
    to: sunday.toISOString().slice(0, 10),
  };
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Formats a YYYY-MM-DD string as "Mon, May 26". Uses noon UTC to avoid timezone boundary issues. */
function fmtDayHeader(d: string): string {
  const dt = new Date(d + 'T12:00:00Z');
  return dt.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

/** Formats a YYYY-MM-DD string as "May 26". */
function fmtShortDate(d: string): string {
  const dt = new Date(d + 'T12:00:00Z');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Formats a week range as "May 25 – 31" or "May 26 – Jun 2". */
function fmtWeekRange(from: string, to: string): string {
  const f = new Date(from + 'T12:00:00Z');
  const t = new Date(to + 'T12:00:00Z');
  const mf = f.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const mt = t.toLocaleDateString('en-US', {
    month: f.getUTCMonth() === t.getUTCMonth() ? undefined : 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return `${mf} – ${mt}`;
}

/** Sorts time values: BMO (pre-market) → unspecified → AMC (after-close) */
function timeOrder(time?: string): number {
  if (time === 'BMO' || time === 'pre_market') return 0;
  if (time === 'AMC' || time === 'after_close') return 2;
  return 1;
}

function fmtEPS(n: number): string {
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `-$${abs}` : `$${abs}`;
}

function fmtRevenue(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString('en-US')}`;
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function TimeTag({ time }: { time?: string }) {
  if (time === 'BMO' || time === 'pre_market') {
    return (
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 uppercase tracking-wide leading-none">
        BMO
      </span>
    );
  }
  if (time === 'AMC' || time === 'after_close') {
    return (
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 uppercase tracking-wide leading-none">
        AMC
      </span>
    );
  }
  return null;
}

function DayHeader({ date, today, count }: { date: string; today: string; count: number }) {
  const isToday = date === today;
  return (
    <div className={cn('flex items-center gap-2.5 mb-1', isToday ? 'text-primary' : '')}>
      <span className={cn(
        'text-[11px] font-bold uppercase tracking-[0.1em] shrink-0',
        isToday ? 'text-primary' : 'text-muted-foreground/50',
      )}>
        {fmtDayHeader(date)}
      </span>
      {isToday && (
        <span className="text-[9px] font-bold bg-primary/15 text-primary px-1.5 py-0.5 rounded uppercase tracking-wide leading-none shrink-0">
          Today
        </span>
      )}
      <div className="flex-1 h-px bg-border/40" />
      <span className="text-[10px] text-muted-foreground/30 tabular-nums shrink-0">{count}</span>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
      <CalendarDays className="h-7 w-7 text-muted-foreground/30" aria-hidden />
      <p className="text-sm text-muted-foreground">No {label} events this week</p>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-5 py-1">
      {[0, 1, 2].map((g) => (
        <div key={g} className="space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-3 w-24" />
            <div className="flex-1 h-px bg-border/30" />
          </div>
          {Array.from({ length: g === 1 ? 4 : 2 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between py-1">
              <div className="flex items-center gap-3">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-4 w-14" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Tab content ──────────────────────────────────────────────────────────────

function EarningsTab({ from, to }: { from: string; to: string }) {
  const today = todayStr();

  const { data, isLoading } = useQuery<CalendarResponse<EarningsCalendarItem>>({
    queryKey: ['calendar-earnings', from, to],
    queryFn: async () => {
      const res = await fetch(`/api/calendar/earnings?from=${from}&to=${to}`);
      return res.json();
    },
    staleTime: 60 * 60 * 1000,
  });

  const grouped = useMemo(() => {
    if (!data?.data?.length) return [];
    const sorted = [...data.data].sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      return d !== 0 ? d : timeOrder(a.time) - timeOrder(b.time);
    });
    const groups: { date: string; items: EarningsCalendarItem[] }[] = [];
    for (const item of sorted) {
      const last = groups[groups.length - 1];
      if (last?.date === item.date) last.items.push(item);
      else groups.push({ date: item.date, items: [item] });
    }
    return groups;
  }, [data]);

  if (isLoading) return <LoadingRows />;
  if (!grouped.length) return <EmptyState label="earnings" />;

  return (
    <div className="space-y-5">
      {grouped.map(({ date, items }) => (
        <div key={date}>
          <DayHeader date={date} today={today} count={items.length} />
          <div className="divide-y divide-border/40">
            {items.map((e, i) => (
              <div
                key={`${e.symbol}-${i}`}
                className="flex items-center justify-between gap-2 sm:gap-4 py-2.5 px-2 -mx-2 rounded-lg hover:bg-muted/20 transition-colors group"
              >
                {/* Left: ticker + name + badges */}
                <div className="flex items-center gap-3 min-w-0">
                  <Link
                    href={slugToAssetPath(e.symbol)}
                    className="font-bold text-sm font-mono text-foreground hover:text-primary transition-colors shrink-0 w-14 focus-visible:ring-2 focus-visible:ring-ring rounded"
                  >
                    {e.symbol}
                  </Link>
                  <div className="min-w-0 flex-1">
                    {e.name && (
                      <p className="text-xs text-muted-foreground truncate leading-tight">{e.name}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <TimeTag time={e.time} />
                      {e.fiscal_quarter && (
                        <span className="text-[9px] text-muted-foreground/40 font-mono leading-none">
                          {e.fiscal_quarter}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: EPS estimate */}
                <div className="text-right text-xs shrink-0 space-y-0.5">
                  {e.eps_estimate != null ? (
                    <div>
                      <span className="text-muted-foreground/60">EPS est. </span>
                      <span className={cn(
                        'font-semibold tabular-nums',
                        e.eps_estimate < 0 ? 'text-red-400' : 'text-foreground',
                      )}>
                        {fmtEPS(e.eps_estimate)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground/25">—</span>
                  )}
                  {e.revenue_estimate != null && (
                    <div className="text-[10px] text-muted-foreground/40">
                      Rev {fmtRevenue(e.revenue_estimate)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DividendsTab({ from, to }: { from: string; to: string }) {
  const today = todayStr();

  const { data, isLoading } = useQuery<CalendarResponse<DividendsCalendarItem>>({
    queryKey: ['calendar-dividends', from, to],
    queryFn: async () => {
      const res = await fetch(`/api/calendar/dividends?from=${from}&to=${to}`);
      return res.json();
    },
    staleTime: 60 * 60 * 1000,
  });

  const grouped = useMemo(() => {
    if (!data?.data?.length) return [];
    const sorted = [...data.data].sort((a, b) => a.ex_dividend_date.localeCompare(b.ex_dividend_date));
    const groups: { date: string; items: DividendsCalendarItem[] }[] = [];
    for (const item of sorted) {
      const last = groups[groups.length - 1];
      if (last?.date === item.ex_dividend_date) last.items.push(item);
      else groups.push({ date: item.ex_dividend_date, items: [item] });
    }
    return groups;
  }, [data]);

  if (isLoading) return <LoadingRows />;
  if (!grouped.length) return <EmptyState label="dividend" />;

  return (
    <div className="space-y-5">
      {grouped.map(({ date, items }) => (
        <div key={date}>
          <DayHeader date={date} today={today} count={items.length} />
          <div className="divide-y divide-border/40">
            {items.map((d, i) => (
              <div
                key={`${d.symbol}-${i}`}
                className="flex items-center justify-between gap-2 sm:gap-4 py-2.5 px-2 -mx-2 rounded-lg hover:bg-muted/20 transition-colors group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Link
                    href={slugToAssetPath(d.symbol)}
                    className="font-bold text-sm font-mono text-foreground hover:text-primary transition-colors shrink-0 w-14 focus-visible:ring-2 focus-visible:ring-ring rounded"
                  >
                    {d.symbol}
                  </Link>
                  <div className="min-w-0">
                    {d.name && (
                      <p className="text-xs text-muted-foreground truncate">{d.name}</p>
                    )}
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground/50 flex-wrap">
                      {d.payment_date && <span>Pay {fmtShortDate(d.payment_date)}</span>}
                      {d.frequency && (
                        <span className="capitalize px-1 bg-muted/60 rounded">{d.frequency}</span>
                      )}
                    </div>
                  </div>
                </div>
                {d.dividend_amount != null && (
                  <span className="text-sm font-semibold tabular-nums text-emerald-500 shrink-0">
                    ${d.dividend_amount.toFixed(4)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SplitsTab({ from, to }: { from: string; to: string }) {
  const today = todayStr();

  const { data, isLoading } = useQuery<CalendarResponse<SplitsCalendarItem>>({
    queryKey: ['calendar-splits', from, to],
    queryFn: async () => {
      const res = await fetch(`/api/calendar/splits?from=${from}&to=${to}`);
      return res.json();
    },
    staleTime: 60 * 60 * 1000,
  });

  const grouped = useMemo(() => {
    if (!data?.data?.length) return [];
    const sorted = [...data.data].sort((a, b) => a.date.localeCompare(b.date));
    const groups: { date: string; items: SplitsCalendarItem[] }[] = [];
    for (const item of sorted) {
      const last = groups[groups.length - 1];
      if (last?.date === item.date) last.items.push(item);
      else groups.push({ date: item.date, items: [item] });
    }
    return groups;
  }, [data]);

  if (isLoading) return <LoadingRows />;
  if (!grouped.length) return <EmptyState label="split" />;

  return (
    <div className="space-y-5">
      {grouped.map(({ date, items }) => (
        <div key={date}>
          <DayHeader date={date} today={today} count={items.length} />
          <div className="divide-y divide-border/40">
            {items.map((s, i) => (
              <div
                key={`${s.symbol}-${i}`}
                className="flex items-center justify-between gap-2 sm:gap-4 py-2.5 px-2 -mx-2 rounded-lg hover:bg-muted/20 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Link
                    href={slugToAssetPath(s.symbol)}
                    className="font-bold text-sm font-mono text-foreground hover:text-primary transition-colors shrink-0 w-14 focus-visible:ring-2 focus-visible:ring-ring rounded"
                  >
                    {s.symbol}
                  </Link>
                  {s.name && (
                    <p className="text-xs text-muted-foreground truncate">{s.name}</p>
                  )}
                </div>
                {s.ratio && (
                  <span className="text-xs font-bold font-mono text-foreground shrink-0 bg-muted px-2 py-0.5 rounded">
                    {s.ratio}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function IPOTab({ from, to }: { from: string; to: string }) {
  const today = todayStr();

  const { data, isLoading } = useQuery<CalendarResponse<IPOCalendarItem>>({
    queryKey: ['calendar-ipo', from, to],
    queryFn: async () => {
      const res = await fetch(`/api/calendar/ipo?from=${from}&to=${to}`);
      return res.json();
    },
    staleTime: 60 * 60 * 1000,
  });

  const grouped = useMemo(() => {
    if (!data?.data?.length) return [];
    const sorted = [...data.data].sort((a, b) => a.date.localeCompare(b.date));
    const groups: { date: string; items: IPOCalendarItem[] }[] = [];
    for (const item of sorted) {
      const last = groups[groups.length - 1];
      if (last?.date === item.date) last.items.push(item);
      else groups.push({ date: item.date, items: [item] });
    }
    return groups;
  }, [data]);

  if (isLoading) return <LoadingRows />;
  if (!grouped.length) return <EmptyState label="IPO" />;

  const STATUS_COLORS: Record<string, string> = {
    expected: 'bg-sky-500/10 text-sky-400',
    priced:   'bg-emerald-500/10 text-emerald-400',
    filed:    'bg-muted/60 text-muted-foreground',
    withdrawn: 'bg-red-500/10 text-red-400',
  };

  return (
    <div className="space-y-5">
      {grouped.map(({ date, items }) => (
        <div key={date}>
          <DayHeader date={date} today={today} count={items.length} />
          <div className="divide-y divide-border/40">
            {items.map((ipo, i) => (
              <div
                key={`${ipo.symbol ?? ipo.name}-${i}`}
                className="flex items-center justify-between gap-2 sm:gap-4 py-2.5 px-2 -mx-2 rounded-lg hover:bg-muted/20 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {ipo.symbol ? (
                    <Link
                      href={slugToAssetPath(ipo.symbol)}
                      className="font-bold text-sm font-mono text-foreground hover:text-primary transition-colors shrink-0 w-14 focus-visible:ring-2 focus-visible:ring-ring rounded"
                    >
                      {ipo.symbol}
                    </Link>
                  ) : (
                    <span className="font-bold text-sm font-mono text-muted-foreground shrink-0 w-14">—</span>
                  )}
                  <div className="min-w-0">
                    {ipo.name && <p className="text-xs text-muted-foreground truncate">{ipo.name}</p>}
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {ipo.exchange && (
                        <span className="text-[10px] text-muted-foreground/40">{ipo.exchange}</span>
                      )}
                      {ipo.status && (
                        <span className={cn(
                          'text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide leading-none capitalize',
                          STATUS_COLORS[ipo.status.toLowerCase()] ?? 'bg-muted/60 text-muted-foreground',
                        )}>
                          {ipo.status}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {(ipo.price_from != null || ipo.price_to != null) && (
                  <div className="text-right text-xs shrink-0">
                    <span className="font-semibold tabular-nums text-foreground">
                      {ipo.price_from != null ? `$${ipo.price_from}` : ''}
                      {ipo.price_from != null && ipo.price_to != null ? ' – ' : ''}
                      {ipo.price_to != null ? `$${ipo.price_to}` : ''}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
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
const WEEK_LABELS = ['This week', 'Next week', '+2w', '+3w'];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const { hasAnimatedBackground } = useBackground();
  const [activeTab, setActiveTab] = useState<TabKey>('earnings');
  const [weekOffset, setWeekOffset] = useState(0);

  const { from, to } = getWeekRange(weekOffset);

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
              <CalendarDays className="h-5 w-5 text-primary" aria-hidden />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Market Calendar</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Earnings, dividends, splits & IPOs</p>
            </div>
          </div>
        </div>

        {/* Week selector */}
        <div className="flex items-center gap-1.5 mb-6 flex-wrap">
          {WEEK_OFFSETS.map((offset) => (
            <button
              key={offset}
              onClick={() => setWeekOffset(offset)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition-all border',
                weekOffset === offset
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/20',
              )}
            >
              {WEEK_LABELS[offset]}
            </button>
          ))}
          <span className="ml-auto text-xs text-muted-foreground/50 tabular-nums font-mono">
            {fmtWeekRange(from, to)}
          </span>
        </div>

        <Card>
          <CardHeader className="pb-0 pt-5 px-5">
            {/* Tab bar */}
            <div className="flex gap-0 border-b border-border -mx-5 px-5 overflow-x-auto">
              {TABS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={cn(
                    'flex items-center gap-1.5 pb-2.5 mr-6 text-sm font-medium whitespace-nowrap transition-colors border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-t',
                    activeTab === key
                      ? 'text-foreground border-primary'
                      : 'text-muted-foreground border-transparent hover:text-foreground',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {label}
                </button>
              ))}
            </div>
          </CardHeader>

          <CardContent className="pt-5 px-5 pb-5">
            {activeTab === 'earnings'  && <EarningsTab  from={from} to={to} />}
            {activeTab === 'dividends' && <DividendsTab from={from} to={to} />}
            {activeTab === 'splits'    && <SplitsTab    from={from} to={to} />}
            {activeTab === 'ipo'       && <IPOTab       from={from} to={to} />}
          </CardContent>
        </Card>

      </main>
    </div>
  );
}
