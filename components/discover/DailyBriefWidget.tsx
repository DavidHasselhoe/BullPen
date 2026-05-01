'use client';

import { useState, useEffect } from 'react';
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
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
}

// Render inline **bold** markers as <strong>
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1
      ? <strong key={i} className="font-semibold text-foreground">{part}</strong>
      : part
  );
}

function SectionBlock({ section }: { section: BriefSection }) {
  const lines = section.body.split('\n').filter(Boolean);
  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/50 shrink-0">
          {section.heading}
        </span>
        <div className="flex-1 h-px bg-border/30" />
      </div>
      <div className="space-y-2.5">
        {lines.map((line, i) => {
          const isBullet = line.startsWith('•') || line.startsWith('-');
          const text = line.replace(/^[•\-]\s*/, '');
          return (
            <p key={i} className={cn(
              'leading-relaxed',
              isBullet
                ? 'text-sm text-foreground/85 flex gap-2.5'
                : 'text-xs text-muted-foreground/60 italic'
            )}>
              {isBullet && (
                <span className="text-muted-foreground/30 select-none shrink-0 mt-0.5">•</span>
              )}
              <span>{renderInline(text)}</span>
            </p>
          );
        })}
      </div>
    </div>
  );
}

function BriefDrawer({ brief, onClose }: { brief: DailyBrief; onClose: () => void }) {
  const sections = parseSections(brief.content);

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Sheet */}
      <div className="relative z-10 bg-background border-t border-border/60 rounded-t-2xl flex flex-col max-h-[85vh] animate-slide-up">
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-8 h-1 rounded-full bg-border/50" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-2 pb-4 border-b border-border/30 shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/50">
                Daily Brief
              </span>
              <span className="text-[10px] text-muted-foreground/30">·</span>
              <span className="text-[10px] text-muted-foreground/40 font-mono">
                {formatRelativeTime(brief.generated_at)}
              </span>
            </div>
            <h2 className="text-base font-semibold text-foreground leading-snug max-w-xl">
              {brief.title}
            </h2>
            <p className="text-xs text-muted-foreground/50 mt-1">
              {formatPublishedDate(brief.published_date)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground/40 hover:text-muted-foreground transition-colors p-1 rounded-md hover:bg-muted/50 ml-4 shrink-0 mt-1"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
          {sections.map((section, i) => (
            <SectionBlock key={i} section={section} />
          ))}

          <p className="text-[10px] text-muted-foreground/25 select-none pt-2 pb-4">
            Powered by Claude · live web search · {new Date(brief.generated_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET
          </p>
        </div>
      </div>
    </div>
  );
}

export function DailyBriefWidget() {
  const [isOpen, setIsOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['daily-brief-today'],
    queryFn: async (): Promise<{ brief: DailyBrief | null; locked?: boolean }> => {
      const res = await fetch('/api/briefs/today');
      if (res.status === 403) return { brief: null, locked: true };
      if (!res.ok) throw new Error('Failed to fetch brief');
      const json = await res.json();
      return { brief: json.brief };
    },
    staleTime: 5 * 60_000,
    retry: false,
  });

  if (error) return null;

  const isLocked = data?.locked === true;
  const brief = data?.brief ?? null;

  // Teaser skeleton
  if (isLoading) {
    return (
      <div className="min-w-0">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground/70 shrink-0">Daily brief</span>
          <div className="flex-1 h-px bg-border/50" />
        </div>
        <div className="h-4 w-72 bg-muted/60 animate-pulse rounded mb-2" />
        <div className="h-3 w-40 bg-muted/40 animate-pulse rounded" />
      </div>
    );
  }

  // Locked state — compact teaser with blur + upgrade
  if (isLocked) {
    return (
      <div className="min-w-0">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground/70 shrink-0">Daily brief</span>
          <div className="flex-1 h-px bg-border/50" />
        </div>
        <div className="flex items-center justify-between gap-4 p-3 rounded-lg border border-border/30 bg-muted/20">
          <div className="space-y-1 min-w-0">
            <p className="text-sm font-medium text-foreground/30 blur-sm select-none truncate">
              Markets surge as Fed signals pivot — tech leads broad rally
            </p>
            <p className="text-xs text-muted-foreground/40 blur-sm select-none">Markets · Earnings · Headlines · Watch Today</p>
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

  // Not yet generated
  if (brief === null) {
    return (
      <div className="min-w-0">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground/70 shrink-0">Daily brief</span>
          <div className="flex-1 h-px bg-border/50" />
        </div>
        <p className="text-sm text-muted-foreground/50">
          Today&apos;s brief is generating — check back after 7 AM ET.
        </p>
      </div>
    );
  }

  // Ready — compact teaser row
  const topTickers = (brief.featured_tickers ?? [])
    .filter(t => t.length >= 2 && t.length <= 5)
    .slice(0, 5);

  return (
    <>
      <div className="min-w-0">
        {/* Section header */}
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground/70 shrink-0">
            Daily brief
          </span>
          <div className="flex-1 h-px bg-border/50" />
          <span className="text-[10px] font-mono text-muted-foreground/35 tracking-wider shrink-0">
            {formatRelativeTime(brief.generated_at)}
          </span>
        </div>

        {/* Teaser card — click to open drawer */}
        <button
          onClick={() => setIsOpen(true)}
          className="w-full text-left group flex items-start justify-between gap-4 rounded-lg border border-border/30 bg-muted/10 hover:bg-muted/25 hover:border-border/50 transition-all duration-200 px-4 py-3"
        >
          <div className="min-w-0 space-y-2">
            <p className="text-sm font-semibold text-foreground leading-snug group-hover:text-foreground/90 transition-colors">
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

      {/* Drawer portal */}
      {isOpen && <BriefDrawer brief={brief} onClose={() => setIsOpen(false)} />}
    </>
  );
}
