'use client';

/**
 * The earnings story: a few full-screen slides that walk a beginner through a
 * fresh report, opened from the Earnings card or a notification
 * (`/stock/SYM?story=earnings`). The URL is the open state, so a link, a push
 * and the card's button all open the same thing, and closing strips it.
 *
 * Slides, each from stored data only:
 *   1. Verdict: EPS against the estimate, next to the company's usual surprise.
 *   2. Growth and 3. Outlook: the recap's checked figures and bullets (Pro).
 *      Free readers get one slide saying what Pro adds instead.
 *   4. Reaction: the move since the release, with a lesson when it went the
 *      opposite way to the result.
 * No auto-advance: beginners read slowly. Tap the right or left of a slide,
 * swipe, use the arrow keys, or the buttons. Esc and the close button close
 * it; Radix traps focus. Reduced motion keeps the cross-fade and drops the slide.
 */

import { useState, useSyncExternalStore, useRef, type ReactNode, type KeyboardEvent, type PointerEvent, type MouseEvent } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ChevronLeft, ChevronRight, Lock, Play, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { ProBadge } from '@/components/billing/ProBadge';
import { useEarningsHistory } from '@/hooks/use-earnings-history';
import { useEarningsRecap } from '@/components/stock/EarningsRecap';
import { storyReport, revenueGrowth, outlook, type StoryReport, type EarningsReaction } from '@/lib/earnings/story';
import { fiscalLabel } from '@/lib/finance/fiscal-label';
import { todayET } from '@/lib/dates/calendar-format';
import { fmtClockTime, fmtClockDate } from '@/lib/dates/clock';
import { intlLocale } from '@/lib/i18n/intl-locale';
import { cn } from '@/lib/utils';
import type { ReleaseFigures } from '@/lib/ai/earnings-recap';

// ─── Open state lives in the URL ─────────────────────────────────────────────

const STORY_PARAM = 'story';
const STORY_EVENT = 'bullpen:earnings-story';
const STORY_ID = 'earnings-story';

function setStoryParam(on: boolean) {
  const url = new URL(window.location.href);
  if (on) url.searchParams.set(STORY_PARAM, 'earnings');
  else url.searchParams.delete(STORY_PARAM);
  window.history.replaceState(window.history.state, '', url);
  window.dispatchEvent(new Event(STORY_EVENT));
}

export const openEarningsStory = () => setStoryParam(true);
const closeEarningsStory = () => setStoryParam(false);

function subscribe(cb: () => void) {
  window.addEventListener('popstate', cb);
  window.addEventListener(STORY_EVENT, cb);
  return () => {
    window.removeEventListener('popstate', cb);
    window.removeEventListener(STORY_EVENT, cb);
  };
}
const readOpen = () => new URLSearchParams(window.location.search).get(STORY_PARAM) === 'earnings';

/** The report a story would tell for this stock, or null. Shares its queries with the Earnings card. */
export function useEarningsStoryReport(ticker: string): StoryReport | null {
  const { data: history } = useEarningsHistory(ticker);
  const { data: recap } = useEarningsRecap(ticker);
  return storyReport(history, recap?.recap?.reportDate ?? recap?.locked?.reportDate, todayET());
}

/** The Earnings card's way in. Renders nothing when there is no fresh report to tell. */
export function EarningsStoryButton({ ticker }: { ticker: string }) {
  const { t } = useTranslation('stock');
  if (!useEarningsStoryReport(ticker)) return null;
  return (
    <Button type="button" variant="outline" size="sm" className="gap-2" onClick={openEarningsStory}>
      <Play className="h-3.5 w-3.5" aria-hidden /> {t('earningsStoryOpen')}
    </Button>
  );
}

// ─── Formatting ──────────────────────────────────────────────────────────────

const money = (v: number) => `${v < 0 ? '−' : ''}$${Math.abs(v).toFixed(2)}`;
const pct = (v: number, digits = 0) => `${Math.abs(v).toFixed(digits)}%`;
const signedPct = (v: number, digits = 0) => `${v >= 0 ? '+' : '−'}${pct(v, digits)}`;
const UP = 'text-emerald-600 dark:text-emerald-400';
const DOWN = 'text-red-600 dark:text-red-400';

const LESSON_HREF = '/academy/earnings-reports-calls/good-report-bad-reaction';

// ─── The story ───────────────────────────────────────────────────────────────

export function EarningsStory({ ticker, name }: { ticker: string; name: string }) {
  const { t, i18n } = useTranslation('stock');
  const open = useSyncExternalStore(subscribe, readOpen, () => false);
  const story = useEarningsStoryReport(ticker);
  const { data: recapRes } = useEarningsRecap(ticker);
  // Set by the last slide's button: once the dialog has let go of scroll and focus, go to the card.
  const toCardOnClose = useRef(false);
  const { data: reaction, isLoading: reactionLoading } = useQuery({
    queryKey: ['earnings-reaction', ticker],
    queryFn: async (): Promise<EarningsReaction | null> => {
      const res = await fetch(`/api/stock/${encodeURIComponent(ticker)}/earnings-reaction`);
      if (!res.ok) return null;
      return (await res.json()).reaction ?? null;
    },
    enabled: open && !!story,
    staleTime: 5 * 60 * 1000,
  });

  if (!story) return null;
  const locale = intlLocale(i18n.language);
  const compact = (v: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', notation: 'compact', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);
  const { report } = story;
  const recap = recapRes?.recap ?? null;
  const quarter = report.quarter && report.year ? fiscalLabel(t, { quarter: report.quarter, year: report.year, offCalendar: report.offCalendar }) : null;
  // A report date is a New York date, not a time of day: formatted as is, never through the display clock.
  const date = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${report.date}T12:00:00Z`));

  const slides: { key: string; body: ReactNode }[] = [{ key: 'verdict', body: <VerdictSlide story={story} name={name} t={t} /> }];
  if (recap) {
    slides.push({ key: 'growth', body: <GrowthSlide figures={recap.figures} fallback={recap.bullets[1]} compact={compact} t={t} /> });
    slides.push({ key: 'outlook', body: <OutlookSlide figures={recap.figures} watch={recap.bullets[2]} sourceUrl={recap.sourceUrl} compact={compact} t={t} /> });
  } else {
    slides.push({ key: 'locked', body: <LockedSlide t={t} /> });
  }
  if (reactionLoading || reaction) {
    slides.push({ key: 'reaction', body: <ReactionSlide reaction={reaction ?? null} story={story} t={t} /> });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) closeEarningsStory(); }}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        // Focus the story itself, not the close button: arrow keys work at once and no ring shows on open.
        onOpenAutoFocus={(e) => { e.preventDefault(); document.getElementById(STORY_ID)?.focus(); }}
        onCloseAutoFocus={(e) => {
          if (!toCardOnClose.current) return;
          toCardOnClose.current = false;
          e.preventDefault();
          const card = document.getElementById('nav-earnings');
          card?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          // Focus lands on the card's own story button, so keyboard users continue from the card.
          card?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
        }}
        className={cn(
          'flex h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0',
          'sm:h-[min(44rem,90dvh)] sm:max-w-md sm:rounded-xl sm:border',
        )}
      >
        <DialogTitle className="sr-only">{t('earningsStoryTitle', { name, date })}</DialogTitle>
        <StoryViewer
          slides={slides}
          onEnd={() => { toCardOnClose.current = true; closeEarningsStory(); }}
          header={
            <div className="flex items-center gap-2.5">
              <CompanyLogo ticker={ticker} name={name} size={28} decorative />
              <div className="min-w-0 leading-tight">
                {/* clamp-ok: a company name in a one-line header */}
                <p className="truncate text-sm font-semibold" title={name}>{name}</p>
                <p className="text-xs text-muted-foreground">{quarter ? `${quarter} · ${date}` : date}</p>
              </div>
            </div>
          }
          t={t}
        />
      </DialogContent>
    </Dialog>
  );
}

function StoryViewer({ slides, header, onEnd, t }: { slides: { key: string; body: ReactNode }[]; header: ReactNode; onEnd: () => void; t: TFunction }) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const swipe = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const at = Math.min(index, slides.length - 1);
  const last = at === slides.length - 1;

  const go = (step: 1 | -1) => {
    const next = at + step;
    if (next < 0 || next >= slides.length) return;
    setDirection(step);
    setIndex(next);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
  };
  const onPointerDown = (e: PointerEvent) => { swipe.current = { x: e.clientX, y: e.clientY, moved: false }; };
  const onPointerUp = (e: PointerEvent) => {
    const s = swipe.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - s.y)) {
      s.moved = true;
      go(dx < 0 ? 1 : -1);
    }
  };
  // Tap the left third to go back, anywhere else to go on; links and buttons keep their own click.
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if (swipe.current?.moved) { swipe.current = null; return; }
    if ((e.target as HTMLElement).closest('a,button')) return;
    const box = e.currentTarget.getBoundingClientRect();
    go(e.clientX - box.left < box.width / 3 ? -1 : 1);
  };

  return (
    <div id={STORY_ID} tabIndex={-1} className="flex min-h-0 flex-1 flex-col outline-none" onKeyDown={onKeyDown}>
      <div className="px-4 pt-3 sm:px-5" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <div className="flex gap-1" aria-hidden>
          {slides.map((s, i) => (
            <span key={s.key} className={cn('h-1 flex-1 rounded-full transition-colors duration-200', i <= at ? 'bg-foreground/80' : 'bg-foreground/15')} />
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          {header}
          <button
            type="button"
            onClick={closeEarningsStory}
            className="-mr-2 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t('earningsStoryClose')}
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
      </div>

      <div
        className="relative min-h-0 flex-1 touch-pan-y select-none overflow-y-auto overflow-x-hidden px-5 py-6 sm:px-6"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onClick={onClick}
      >
        <p className="sr-only" aria-live="polite">{t('earningsStoryProgress', { current: at + 1, total: slides.length })}</p>
        <div
          key={slides[at].key}
          className={cn(
            // Top-aligned so the headline sits at the same height on every slide.
            'pt-2 sm:pt-4 animate-in fade-in duration-200',
            direction === 1 ? 'motion-safe:slide-in-from-right-6' : 'motion-safe:slide-in-from-left-6',
          )}
        >
          {slides[at].body}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <Button type="button" variant="ghost" size="sm" className="h-11 gap-1" onClick={() => go(-1)} disabled={at === 0} aria-label={t('earningsStoryPrev')}>
          <ChevronLeft className="size-4" aria-hidden /> <span className="hidden sm:inline">{t('earningsStoryPrev')}</span>
        </Button>
        {last ? (
          <Button type="button" size="sm" className="h-11" onClick={onEnd}>{t('earningsStoryEnd')}</Button>
        ) : (
          <Button type="button" size="sm" className="h-11 gap-1" onClick={() => go(1)}>
            {t('earningsStoryNext')} <ChevronRight className="size-4" aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Slides ──────────────────────────────────────────────────────────────────

function VerdictSlide({ story, name, t }: { story: StoryReport; name: string; t: TFunction }) {
  const { report, usualSurprise } = story;
  const diff = Math.round((report.epsActual - report.epsEstimate) * 100) / 100;
  const surprise = Math.abs(report.epsEstimate) >= 0.05 ? (diff / Math.abs(report.epsEstimate)) * 100 : null;
  const verdict = diff > 0 ? 'beat' : diff < 0 ? 'missed' : 'met';
  const tone = verdict === 'beat' ? UP : verdict === 'missed' ? DOWN : 'text-muted-foreground';
  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold leading-tight tracking-tight text-balance sm:text-3xl">
        <span className={tone} aria-hidden>{verdict === 'beat' ? '▲ ' : verdict === 'missed' ? '▼ ' : ''}</span>
        {t(verdict === 'beat' ? 'earningsStoryVerdictBeat' : verdict === 'missed' ? 'earningsStoryVerdictMissed' : 'earningsStoryVerdictMet', { name })}
      </h2>
      <div>
        {/* Sans at display size: Geist Mono spaces the point out ("$2 . 68"), as the Instagram slides found. */}
        <p className="text-5xl font-bold tabular-nums tracking-tight">{money(report.epsActual)}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t('earningsStoryEpsLine', { estimate: money(report.epsEstimate) })}</p>
        {verdict !== 'met' && (
          <p className={cn('mt-3 font-mono text-sm font-medium tabular-nums', tone)}>
            {diff > 0 ? '+' : '−'}{money(Math.abs(diff))}{surprise != null && ` (${signedPct(surprise)})`}
          </p>
        )}
      </div>
      <p className="text-sm leading-relaxed">
        {usualSurprise != null && Math.abs(usualSurprise) >= 0.5 && (
          <>{t(usualSurprise > 0 ? 'earningsStoryUsualBeat' : 'earningsStoryUsualMiss', { pct: pct(usualSurprise) })} </>
        )}
        {verdict === 'beat' && t('earningsStoryBeatsAreNormal')}
      </p>
      <p className="text-xs text-muted-foreground">
        {t('earningsChartBasis')}.{report.actualSource === 'release' && ` ${t('earningsChartFromRelease')}`}
      </p>
    </div>
  );
}

function GrowthSlide({ figures, fallback, compact, t }: { figures: ReleaseFigures | null; fallback: string | undefined; compact: (v: number) => string; t: TFunction }) {
  const growth = revenueGrowth(figures);
  if (growth == null || !figures?.revenue || !figures.revenueYearAgo) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl">{t('earningsStoryGrowthFallbackTitle')}</h2>
        {/* Model-written, shown whole. */}
        {fallback && <p className="text-base leading-relaxed">{fallback}</p>}
      </div>
    );
  }
  const max = Math.max(figures.revenue, figures.revenueYearAgo);
  const rows = [
    { label: t('earningsStoryRevenueYearAgo'), value: figures.revenueYearAgo, now: false },
    { label: t('earningsStoryRevenueNow'), value: figures.revenue, now: true },
  ];
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold leading-tight tracking-tight text-balance sm:text-3xl">
        <span className={growth >= 0 ? UP : DOWN} aria-hidden>{growth >= 0 ? '▲ ' : '▼ '}</span>
        {t(growth >= 0 ? 'earningsStoryGrowthUp' : 'earningsStoryGrowthDown', { pct: pct(growth) })}
      </h2>
      <div className="space-y-4">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
              <span className={r.now ? 'font-medium' : 'text-muted-foreground'}>{r.label}</span>
              <span className="font-mono tabular-nums">{compact(r.value)}</span>
            </div>
            <div className="h-3 rounded-full bg-muted">
              <div className={cn('h-full rounded-full', r.now ? 'bg-foreground/80' : 'bg-foreground/30')} style={{ width: `${(r.value / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{t('earningsStoryGrowthNote')}</p>
    </div>
  );
}

function OutlookSlide({ figures, watch, sourceUrl, compact, t }: {
  figures: ReleaseFigures | null; watch: string | undefined; sourceUrl: string | null; compact: (v: number) => string; t: TFunction;
}) {
  const o = outlook(figures);
  return (
    <div className="space-y-6">
      {o && (
        <div className="space-y-2">
          <h2 className="text-2xl font-bold leading-tight tracking-tight text-balance sm:text-3xl">
            {t('earningsStoryOutlookTitle', { amount: compact(o.mid) })}
          </h2>
          {o.vsNow != null && Math.abs(o.vsNow) >= 0.5 && (
            <p className="text-sm">
              <span className={cn('font-mono font-medium tabular-nums', o.vsNow > 0 ? UP : DOWN)}>{signedPct(o.vsNow)}</span>{' '}
              <span className="text-muted-foreground">{t('earningsStoryOutlookVsNow')}</span>
            </p>
          )}
          <p className="text-sm text-muted-foreground">{t('earningsStoryOutlookOwn')}</p>
        </div>
      )}
      {/* Model-written, shown whole. Without an outlook figure it is the slide's own heading's subject. */}
      {!o && <h2 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl">{t('earningsStoryWatchTitle')}</h2>}
      {watch && <p className="text-base leading-relaxed">{watch}</p>}
      <p className="text-xs text-muted-foreground">
        {t('earningsRecapSource')}
        {sourceUrl && <>{' '}<a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">{t('earningsRecapReadRelease')}</a></>}
      </p>
    </div>
  );
}

function LockedSlide({ t }: { t: TFunction }) {
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold leading-tight tracking-tight text-balance sm:text-3xl">
        <Lock className="mr-2 inline size-5 align-[-2px] text-muted-foreground" aria-hidden />
        {t('earningsStoryLockedTitle')}
      </h2>
      <p className="text-base leading-relaxed text-muted-foreground">{t('earningsStoryLockedBody')}</p>
      <div className="flex items-center gap-3">
        <Button asChild size="sm" className="h-11"><Link href="/upgrade">{t('earningsStoryLockedCta')}</Link></Button>
        <ProBadge />
      </div>
    </div>
  );
}

function ReactionSlide({ reaction, story, t }: { reaction: EarningsReaction | null; story: StoryReport; t: TFunction }) {
  if (!reaction) {
    return (
      <div className="space-y-4" aria-busy>
        <div className="h-9 w-3/4 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
      </div>
    );
  }
  const move = reaction.changePercent;
  const flat = Math.abs(move) < 0.1;
  const beat = story.report.epsActual > story.report.epsEstimate;
  const missed = story.report.epsActual < story.report.epsEstimate;
  const against = (beat && move <= -1) || (missed && move >= 1);
  const asOf = new Date(reaction.asOf * 1000);
  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold leading-tight tracking-tight text-balance sm:text-3xl">
        {!flat && <span className={move > 0 ? UP : DOWN} aria-hidden>{move > 0 ? '▲ ' : '▼ '}</span>}
        {flat ? t('earningsStoryReactionFlat') : t(move > 0 ? 'earningsStoryReactionUp' : 'earningsStoryReactionDown', { pct: pct(move, 1) })}
      </h2>
      <p className="text-sm text-muted-foreground">
        {t('earningsStoryReactionAsOf', { time: fmtClockTime(asOf), day: fmtClockDate(asOf, { weekday: 'short', month: 'short', day: 'numeric' }) })}
      </p>
      {against && (
        <div className="rounded-lg border border-border/60 p-4">
          <p className="text-sm leading-relaxed">{t(beat ? 'earningsStoryAgainstBeat' : 'earningsStoryAgainstMiss')}</p>
          <Link href={LESSON_HREF} className="mt-2 inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-2">
            {t('earningsStoryLessonLink')}
          </Link>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t('earningsStoryReactionNote')}</p>
    </div>
  );
}
