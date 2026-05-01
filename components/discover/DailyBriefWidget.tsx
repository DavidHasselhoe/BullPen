'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
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

function SectionBlock({ section }: { section: BriefSection }) {
  const lines = section.body.split('\n').filter(Boolean);
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60">
          {section.heading}
        </span>
        <div className="flex-1 h-px bg-border/40" />
      </div>
      <ul className="space-y-1">
        {lines.map((line, i) => (
          <li key={i} className={cn(
            'text-sm leading-relaxed',
            line.startsWith('•') || line.startsWith('-')
              ? 'text-foreground pl-1'
              : 'text-muted-foreground text-xs'
          )}>
            {line.replace(/^[•\-]\s*/, '')}
          </li>
        ))}
      </ul>
    </div>
  );
}

function BriefSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-4 w-64 bg-muted animate-pulse rounded" />
      {[3, 4, 2, 3].map((lines, i) => (
        <div key={i} className="space-y-2">
          <div className="h-2.5 w-20 bg-muted animate-pulse rounded" />
          {Array.from({ length: lines }).map((_, j) => (
            <div key={j} className={`h-3 bg-muted animate-pulse rounded ${j === lines - 1 ? 'w-3/4' : 'w-full'}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function DailyBriefWidget() {
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

  // Don't render at all if there's a network error (non-gating failure)
  if (error) return null;

  const isLocked = data?.locked === true;
  const brief = data?.brief ?? null;

  return (
    <div className="min-w-0">
      {/* Editorial section header */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground/70 shrink-0">
          Daily brief
        </span>
        <div className="flex-1 h-px bg-border/50" />
        {brief && (
          <span className="text-[10px] font-mono text-muted-foreground/40 tracking-wider shrink-0">
            {formatRelativeTime(brief.generated_at)}
          </span>
        )}
      </div>

      {/* Loading */}
      {isLoading && <BriefSkeleton />}

      {/* Locked — free user */}
      {!isLoading && isLocked && (
        <div className="relative rounded-xl border border-border/40 overflow-hidden">
          {/* Blurred preview */}
          <div className="px-4 py-4 select-none pointer-events-none" aria-hidden>
            <p className="text-sm font-semibold text-foreground blur-sm mb-3">
              Market Brief — {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            {['Markets were broadly higher yesterday as...', '• NVDA reported earnings beating estimates by...', '• Fed officials signaled that interest rate cuts...'].map((line, i) => (
              <p key={i} className="text-xs text-muted-foreground blur-sm mb-1">{line}</p>
            ))}
          </div>
          {/* Lock overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/70 backdrop-blur-[2px] gap-3">
            <p className="text-sm font-medium text-foreground">Daily Brief is a Pro feature</p>
            <Link
              href="/upgrade"
              className="inline-flex items-center rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Upgrade to Pro →
            </Link>
          </div>
        </div>
      )}

      {/* Not yet generated */}
      {!isLoading && !isLocked && brief === null && (
        <p className="text-sm text-muted-foreground py-2">
          Today&apos;s brief is generating — check back after 7 AM ET.
        </p>
      )}

      {/* Ready */}
      {!isLoading && !isLocked && brief !== null && (
        <div className="space-y-5">
          <p className="text-base font-semibold text-foreground leading-snug">{brief.title}</p>
          {parseSections(brief.content).map((section, i) => (
            <SectionBlock key={i} section={section} />
          ))}
          <p className="text-[10px] text-muted-foreground/30 select-none pt-1">
            Powered by Claude + live web search
          </p>
        </div>
      )}
    </div>
  );
}
