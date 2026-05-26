'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { slugToAssetPath } from '@/lib/assets/asset-type';

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
  slug: string;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * A real section heading is short (<60 chars), starts with `## `, and
 * doesn't end with sentence punctuation. We drop anything else so a
 * malformed brief (e.g. the model wrote a setup sentence before the first
 * proper `## TL;DR`) doesn't render as a fake section + TOC entry.
 */
const MAX_HEADING_LENGTH = 60;

function looksLikeRealHeading(line: string): boolean {
  if (!line) return false;
  if (line.length > MAX_HEADING_LENGTH) return false;
  if (/[.!?]$/.test(line.trimEnd())) return false;
  return /\w/.test(line);
}

function parseSections(content: string): BriefSection[] {
  // Split BEFORE every `## ` so the chunk preceding the first header is
  // dropped entirely (it can't form a section without a `## ` prefix).
  const parts = content.split(/\n(?=##\s)/);
  const sections: BriefSection[] = [];

  for (const part of parts) {
    // Skip prose blocks that never opened a `## ` header
    if (!/^##\s/.test(part)) continue;

    const firstNewline = part.indexOf('\n');
    const headingRaw = (firstNewline === -1 ? part : part.slice(0, firstNewline))
      .replace(/^##\s*/, '')
      .trim();
    const body = firstNewline === -1 ? '' : part.slice(firstNewline + 1).trim();

    if (!looksLikeRealHeading(headingRaw)) continue;

    sections.push({ heading: headingRaw, body, slug: slugify(headingRaw) });
  }

  return sections;
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

function estimateReadingTime(content: string): number {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

// Tokenize a line into <strong>, ticker <Link>, and plain text in a single pass.
// Patterns: **bold text**, $TICKER
function renderInline(text: string): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  const combined = /\*\*([^*]+)\*\*|\$([A-Z]{1,5})\b/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = combined.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    if (match[1] != null) {
      nodes.push(
        <strong key={key++} className="font-semibold text-foreground">
          {match[1]}
        </strong>
      );
    } else if (match[2]) {
      const ticker = match[2];
      nodes.push(
        <Link
          key={key++}
          href={slugToAssetPath(ticker)}
          className="font-mono font-medium text-primary/85 hover:text-primary border-b border-primary/20 hover:border-primary/60 transition-colors"
        >
          ${ticker}
        </Link>
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

type LineKind = 'bullet' | 'sub-header' | 'paragraph';
function lineKind(line: string): LineKind {
  if (line.startsWith('•') || line.startsWith('-')) return 'bullet';
  if (/:\s*$/.test(line.replace(/\*\*[^*]+\*\*/g, ''))) return 'sub-header';
  return 'paragraph';
}

// ── section blocks ───────────────────────────────────────────────────────────

interface SectionBlockProps {
  section: BriefSection;
  index: number;
  isTldr: boolean;
  sectionRef: (el: HTMLElement | null) => void;
}

function SectionBlock({ section, index, isTldr, sectionRef }: SectionBlockProps) {
  const lines = section.body.split('\n').filter((l) => l.trim().length > 0 && !/^-+$/.test(l.trim()));

  if (isTldr) {
    return (
      <section
        ref={sectionRef}
        id={section.slug}
        className="brief-section mb-10"
        style={{ animationDelay: `${index * 60}ms` }}
      >
        <div className="relative rounded-2xl border border-primary/15 bg-primary/[0.04] px-5 py-4 md:px-6 md:py-5 overflow-hidden">
          <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-primary/50" />
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary/80 mb-2.5">
            TL;DR
          </div>
          <div className="space-y-2.5 text-[15px] leading-7 text-foreground/90">
            {lines.map((line, i) => {
              const text = line.replace(/^[•\-]\s*/, '');
              return <p key={i}>{renderInline(text)}</p>;
            })}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      ref={sectionRef}
      id={section.slug}
      className="brief-section mb-10"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-center gap-3 mb-5 min-w-0">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70 shrink-0 max-w-full truncate">
          {section.heading}
        </span>
        <div className="flex-1 h-px bg-border/30" />
      </div>

      <div className="space-y-4">
        {lines.map((line, i) => {
          const kind = lineKind(line);
          const text = line.replace(/^[•\-]\s*/, '');

          if (kind === 'sub-header') {
            return (
              <p key={i} className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60 pt-2">
                {renderInline(text.replace(/:$/, ''))}
              </p>
            );
          }

          if (kind === 'bullet') {
            return (
              <div key={i} className="flex gap-3 items-start">
                <span className="text-primary/40 select-none shrink-0 text-[15px] leading-7">›</span>
                <p className="text-[15px] leading-7 text-foreground/85">
                  {renderInline(text)}
                </p>
              </div>
            );
          }

          return (
            <p key={i} className="text-[15px] leading-7 text-foreground/80">
              {renderInline(text)}
            </p>
          );
        })}
      </div>
    </section>
  );
}

// ── section navigation rail (desktop) ───────────────────────────────────────

function SectionTOC({
  sections,
  activeSlug,
  onNavigate,
}: {
  sections: BriefSection[];
  activeSlug: string | null;
  onNavigate: (slug: string) => void;
}) {
  // Hide the TOC entirely when there's only one section — wastes space.
  if (sections.length <= 1) return null;
  return (
    <nav
      aria-label="Sections"
      className="hidden md:block w-[180px] shrink-0 border-r border-border/30 px-4 py-7 overflow-y-auto brief-scroll"
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/40 mb-3 pl-3">
        In this brief
      </p>
      <ul className="space-y-0.5">
        {sections.map((s) => {
          const active = activeSlug === s.slug;
          return (
            <li key={s.slug}>
              <button
                onClick={() => onNavigate(s.slug)}
                aria-current={active ? 'true' : undefined}
                title={s.heading}
                className={cn(
                  'w-full text-left text-[12px] pl-3 pr-2 py-1.5 rounded-r-md border-l-2 transition-all duration-150 truncate',
                  active
                    ? 'border-primary text-foreground bg-muted/30 font-medium'
                    : 'border-transparent text-muted-foreground/70 hover:text-foreground hover:bg-muted/20'
                )}
              >
                {s.heading}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// ── reader (Radix Dialog — bottom sheet on mobile, centered modal on desktop) ─

function BriefReader({
  brief,
  isToday,
  open,
  onOpenChange,
}: {
  brief: DailyBrief;
  isToday: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const sections = useMemo(() => parseSections(brief.content), [brief.content]);
  const readingMinutes = useMemo(() => estimateReadingTime(brief.content), [brief.content]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const [activeSlug, setActiveSlug] = useState<string | null>(sections[0]?.slug ?? null);
  const [progress, setProgress] = useState(0);


  // Reset scroll + progress when reopening
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: 0 });
        setProgress(0);
        setActiveSlug(sections[0]?.slug ?? null);
      });
    }
  }, [open, sections]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const max = Math.max(1, el.scrollHeight - el.clientHeight);
    setProgress(Math.min(1, el.scrollTop / max));

    // Use getBoundingClientRect so positions are always relative to the
    // actual viewport, not the fixed modal ancestor (which offsetTop would be).
    const containerTop = el.getBoundingClientRect().top;
    const triggerOffset = 140; // px from container top edge to consider "active"

    let active = sections[0]?.slug ?? null;
    for (const section of sections) {
      const ref = sectionRefs.current[section.slug];
      if (!ref) continue;
      if (ref.getBoundingClientRect().top - containerTop <= triggerOffset) {
        active = section.slug;
      }
    }
    setActiveSlug(active);
  }

  function navigateTo(slug: string) {
    const target = sectionRefs.current[slug];
    const root = scrollRef.current;
    if (!target || !root) return;
    root.scrollTo({ top: target.offsetTop - 16, behavior: 'smooth' });
  }

  const topTickers = (brief.featured_tickers ?? [])
    .filter((t) => t.length >= 1 && t.length <= 5)
    .slice(0, 6);

  // TL;DR detection — first section whose slug starts with "tl"
  const tldrSlug = sections.find((s) => s.slug.startsWith('tl'))?.slug ?? null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[6px] animate-brief-overlay-in"
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'fixed z-50 bg-background outline-none flex flex-col overflow-hidden shadow-2xl',
            // Mobile (<768px): bottom sheet anchored to bottom edge
            'inset-x-0 bottom-0 max-h-[88vh] rounded-t-2xl border-t border-border/40 max-md:animate-slide-up',
            // Desktop (≥768px): centered modal — overrides the bottom positioning
            'md:inset-x-auto md:bottom-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2',
            'md:w-[92vw] md:max-w-4xl md:rounded-2xl md:border md:border-border/40',
            'md:animate-brief-modal-in'
          )}
        >
          <DialogPrimitive.Title className="sr-only">{brief.title}</DialogPrimitive.Title>

          {/* Reading progress bar */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-border/15 z-20 overflow-hidden">
            <div
              className="h-full bg-primary/70 origin-left will-change-transform"
              style={{ transform: `scaleX(${progress})`, transition: 'transform 80ms linear' }}
            />
          </div>

          {/* Mobile drag handle */}
          <div className="flex justify-center pt-2.5 shrink-0 md:hidden">
            <div className="w-9 h-[3px] rounded-full bg-border/50" />
          </div>

          {/* Hero header */}
          <header className="px-6 md:px-8 pt-5 md:pt-7 pb-5 shrink-0 border-b border-border/30 relative">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary/75">
                    {isToday ? 'Daily Brief' : "Yesterday's Brief"}
                  </span>
                </div>
                <h2 className="text-xl md:text-[26px] font-semibold text-foreground leading-tight tracking-tight pr-10">
                  {brief.title}
                </h2>
                <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-3 text-[11px] text-muted-foreground/70 font-mono">
                  <span>{formatPublishedDate(brief.published_date)}</span>
                  <span className="text-muted-foreground/30">·</span>
                  <span>{readingMinutes} min read</span>
                  <span className="text-muted-foreground/30">·</span>
                  <span>Generated {formatRelativeTime(brief.generated_at)}</span>
                </div>
              </div>
              <DialogPrimitive.Close
                className="absolute top-5 right-5 md:top-7 md:right-7 text-muted-foreground/50 hover:text-foreground transition-all duration-150 p-1.5 rounded-lg hover:bg-muted/40 active:scale-95"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            </div>

            {topTickers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-4">
                {topTickers.map((ticker) => (
                  <Link
                    key={ticker}
                    href={slugToAssetPath(ticker)}
                    className="text-[11px] font-mono font-medium text-foreground/80 bg-muted/40 hover:bg-muted/70 hover:text-foreground transition-all duration-150 px-2 py-0.5 rounded border border-border/30 hover:border-border"
                  >
                    ${ticker}
                  </Link>
                ))}
              </div>
            )}
          </header>

          {/* Body: TOC (desktop) + content */}
          <div className="flex flex-1 min-h-0 overflow-hidden">
            <SectionTOC
              sections={sections}
              activeSlug={activeSlug}
              onNavigate={navigateTo}
            />

            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="overflow-y-auto flex-1 brief-scroll px-6 md:px-10 py-7"
            >
              <article className="max-w-[640px] mx-auto md:mx-0">
                {sections.map((section, i) => (
                  <SectionBlock
                    key={section.slug || i}
                    section={section}
                    index={i}
                    isTldr={section.slug === tldrSlug}
                    sectionRef={(el) => {
                      sectionRefs.current[section.slug] = el;
                    }}
                  />
                ))}
                <p className="text-[10px] text-muted-foreground/30 tracking-[0.15em] uppercase pt-2 pb-2 select-none">
                  Generated by Claude · Live web search
                </p>
              </article>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ── widget (dashboard entry point) ──────────────────────────────────────────

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
            <p className="text-xs text-muted-foreground/30 blur-sm select-none">TL;DR · The Setup · Earnings Pulse · Movers · Watch Today</p>
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
    .filter((t) => t.length >= 2 && t.length <= 5)
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
          className="w-full text-left group flex items-start justify-between gap-4 rounded-lg border border-border/30 bg-muted/10 hover:bg-muted/20 hover:border-border/50 transition-all duration-200 px-4 py-3 active:scale-[0.997]"
        >
          <div className="min-w-0 space-y-2">
            <p className="text-sm font-semibold text-foreground leading-snug">
              {brief.title}
            </p>
            {topTickers.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {topTickers.map((ticker) => (
                  <span
                    key={ticker}
                    className="text-[10px] font-mono font-medium text-muted-foreground/60 bg-muted/40 px-1.5 py-0.5 rounded"
                  >
                    ${ticker}
                  </span>
                ))}
              </div>
            )}
          </div>
          <ArrowUpRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground/60 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 shrink-0 mt-0.5 transition-all duration-150" />
        </button>
      </div>

      <BriefReader brief={brief} isToday={isToday} open={isOpen} onOpenChange={setIsOpen} />
    </>
  );
}
