'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { X, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DailyBrief {
  id: string;
  published_date: string;
  title: string;
  content: string;
  featured_tickers: string[];
  generated_at: string;
}

interface BriefSection {
  heading: string;
  body: string;
}

function parseSections(content: string): BriefSection[] {
  const parts = content.split(/\n(?=##\s)/);
  return parts
    .map((part) => {
      const firstNewline = part.indexOf('\n');
      if (firstNewline === -1) return null;
      const heading = part.slice(0, firstNewline).replace(/^##\s*/, '').trim();
      const body = part.slice(firstNewline + 1).trim();
      return { heading, body };
    })
    .filter((s): s is BriefSection => s !== null && s.heading.length > 0);
}

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return 'less than 1h ago';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatPublishedDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
}

function getNextBriefLocalTime(): string {
  const target = new Date();
  target.setUTCHours(6, 30, 0, 0);
  if (Date.now() > target.getTime()) target.setUTCDate(target.getUTCDate() + 1);
  return target.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// Render **bold** markers as <strong>
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1
      ? <strong key={i} className="font-semibold text-foreground">{part}</strong>
      : part
  );
}

// Classify each line so we can style it correctly
type LineKind = 'bullet' | 'sub-header' | 'paragraph';
function lineKind(line: string): LineKind {
  if (line.startsWith('•') || line.startsWith('-')) return 'bullet';
  // Lines that end with a colon act as in-section sub-headers
  if (/:\s*$/.test(line.replace(/\*\*[^*]+\*\*/g, ''))) return 'sub-header';
  return 'paragraph';
}

function SectionBlock({ section, index }: { section: BriefSection; index: number }) {
  const lines = section.body.split('\n').filter(Boolean);

  return (
    <div
      className="brief-section"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Section label */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground/45 shrink-0 tabular-nums">
          {section.heading}
        </span>
        <div className="flex-1 h-px bg-border/25" />
      </div>

      {/* Lines */}
      <div className="space-y-3">
        {lines.map((line, i) => {
          const kind = lineKind(line);
          const text = line.replace(/^[•\-]\s*/, '');

          if (kind === 'sub-header') {
            return (
              <p key={i} className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/50 pt-1">
                {renderInline(text.replace(/:$/, ''))}
              </p>
            );
          }

          if (kind === 'bullet') {
            return (
              <div key={i} className="flex gap-3 items-start">
                <span className="text-muted-foreground/25 select-none shrink-0 text-sm leading-6">›</span>
                <p className="text-sm leading-6 text-foreground/85">
                  {renderInline(text)}
                </p>
              </div>
            );
          }

          // paragraph — full readable body text
          return (
            <p key={i} className="text-sm leading-6 text-foreground/70">
              {renderInline(text)}
            </p>
          );
        })}
      </div>
    </div>
  );
}

function BriefDrawer({ brief, onClose }: { brief: DailyBrief; onClose: () => void }) {
  const sections = parseSections(brief.content);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [atBottom, setAtBottom] = useState(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setScrolled(el.scrollTop > 8);
    setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 8);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-[6px]"
        onClick={onClose}
        aria-hidden
      />

      {/* Sheet — centered and width-capped on large screens */}
      <div className="relative z-10 mx-auto w-full max-w-2xl animate-slide-up">
        <div className="bg-background border border-border/40 border-b-0 rounded-t-2xl flex flex-col max-h-[82vh] shadow-2xl">

          {/* Drag handle */}
          <div className="flex justify-center pt-2.5 pb-0 shrink-0">
            <div className="w-9 h-[3px] rounded-full bg-border/40" />
          </div>

          {/* Header — shadow appears when scrolled */}
          <div className={cn(
            'flex items-start justify-between px-6 pt-3 pb-4 shrink-0 transition-shadow duration-200',
            scrolled && 'shadow-[0_1px_0_0_hsl(var(--border)/0.3)]'
          )}>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground/40">
                  Daily Brief
                </span>
                <span className="text-muted-foreground/20">·</span>
                <span className="text-[9px] font-mono text-muted-foreground/35">
                  {formatPublishedDate(brief.published_date)}
                </span>
                <span className="text-muted-foreground/20">·</span>
                <span className="text-[9px] font-mono text-muted-foreground/30">
                  {formatRelativeTime(brief.generated_at)}
                </span>
              </div>
              <h2 className="text-[15px] font-semibold text-foreground leading-snug tracking-tight pr-8">
                {brief.title}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="absolute top-5 right-5 text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors p-1.5 rounded-lg hover:bg-muted/40"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Scrollable content */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="overflow-y-auto flex-1 brief-scroll px-6 pb-2"
          >
            <div className="space-y-7 pt-1 pb-8">
              {sections.map((section, i) => (
                <SectionBlock key={i} section={section} index={i} />
              ))}
              <p className="text-[9px] text-muted-foreground/20 select-none tracking-wide uppercase pb-2">
                Generated by Claude · live web search
              </p>
            </div>
          </div>

          {/* Bottom fade — hides when scrolled to bottom */}
          <div
            className={cn(
              'pointer-events-none absolute bottom-0 left-0 right-0 h-16 rounded-b-2xl transition-opacity duration-200',
              'bg-gradient-to-t from-background to-transparent',
              atBottom ? 'opacity-0' : 'opacity-100'
            )}
          />
        </div>
      </div>
    </div>
  );
}

export function DailyBriefWidget() {
  const [isOpen, setIsOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['daily-brief-today'],
    queryFn: async (): Promise<{ brief: DailyBrief | null; locked?: boolean; is_today?: boolean }> => {
      const res = await fetch('/api/briefs/today');
      if (res.status === 403) return { brief: null, locked: true };
      if (!res.ok) throw new Error('Failed to fetch brief');
      const json = await res.json();
      return { brief: json.brief, is_today: json.is_today };
    },
    staleTime: 5 * 60_000,
    retry: false,
  });

  if (error) return null;

  const isLocked = data?.locked === true;
  const brief = data?.brief ?? null;
  const isToday = data?.is_today !== false;

  if (isLoading) {
    return (
      <div className="min-w-0">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground/70 shrink-0">Daily brief</span>
          <div className="flex-1 h-px bg-border/50" />
        </div>
        <div className="h-4 w-72 animate-shimmer rounded mb-2" />
        <div className="h-3 w-40 animate-shimmer rounded" />
      </div>
    );
  }

  if (isLocked) {
    return (
      <div className="min-w-0">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground/70 shrink-0">Daily brief</span>
          <div className="flex-1 h-px bg-border/50" />
        </div>
        <div className="flex items-center justify-between gap-4 p-3 rounded-lg border border-border/30 bg-muted/10">
          <div className="space-y-1 min-w-0">
            <p className="text-sm font-medium text-foreground/30 blur-sm select-none truncate">
              Markets surge as Fed signals pivot — tech leads broad rally
            </p>
            <p className="text-xs text-muted-foreground/30 blur-sm select-none">Markets · Earnings · Headlines · Watch Today</p>
          </div>
          <Link
            href="/upgrade"
            className="shrink-0 inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Upgrade <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    );
  }

  if (brief === null) {
    return (
      <div className="min-w-0">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground/70 shrink-0">Daily brief</span>
          <div className="flex-1 h-px bg-border/50" />
        </div>
        <p className="text-sm text-muted-foreground/50">
          Today&apos;s brief is generating — check back after {getNextBriefLocalTime()}.
        </p>
      </div>
    );
  }

  const topTickers = (brief.featured_tickers ?? [])
    .filter(t => t.length >= 2 && t.length <= 5)
    .slice(0, 5);

  return (
    <>
      <div className="min-w-0">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground/70 shrink-0">
            {isToday ? 'Daily brief' : "Yesterday's brief"}
          </span>
          <div className="flex-1 h-px bg-border/50" />
          <span className="text-[10px] font-mono text-muted-foreground/35 tracking-wider shrink-0">
            {formatRelativeTime(brief.generated_at)}
          </span>
        </div>

        <button
          onClick={() => setIsOpen(true)}
          className="w-full text-left group flex items-start justify-between gap-4 rounded-lg border border-border/30 bg-muted/10 hover:bg-muted/20 hover:border-border/50 transition-all duration-200 px-4 py-3"
        >
          <div className="min-w-0 space-y-2">
            <p className="text-sm font-semibold text-foreground leading-snug">
              {brief.title}
            </p>
            {topTickers.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {topTickers.map(ticker => (
                  <span
                    key={ticker}
                    className="text-[10px] font-mono font-medium text-muted-foreground/50 bg-muted/40 px-1.5 py-0.5 rounded"
                  >
                    {ticker}
                  </span>
                ))}
              </div>
            )}
          </div>
          <ArrowUpRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground/60 shrink-0 mt-0.5 transition-colors" />
        </button>
      </div>

      {isOpen && <BriefDrawer brief={brief} onClose={() => setIsOpen(false)} />}
    </>
  );
}
