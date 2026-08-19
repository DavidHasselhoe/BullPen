'use client';

import { cn } from '@/lib/utils';

/**
 * Static, fabricated Deep Dive report snapshot used purely as a paywall
 * teaser. Never a real analysis.
 */
const MOCK_SECTIONS: { label: string; pct: number; tone: 'good' | 'mixed' }[] = [
  { label: 'Growth', pct: 82, tone: 'good' },
  { label: 'Valuation', pct: 38, tone: 'mixed' },
  { label: 'Financial health', pct: 91, tone: 'good' },
];

const TONE_FILL: Record<'good' | 'mixed', string> = {
  good: 'bg-emerald-500',
  mixed: 'bg-amber-500',
};

export function DeepDivePaywallPreview() {
  return (
    <div className="relative select-none bg-card px-6 pb-8 pt-7" aria-hidden="true">
      <div className="pointer-events-none opacity-70 blur-[3px]">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-3xl font-bold tabular-nums text-foreground">
            84<span className="text-base text-muted-foreground">/100</span>
          </span>
          <span className="text-sm font-semibold text-emerald-400">Strong fundamentals</span>
        </div>

        <div className="mt-5 space-y-2.5">
          {MOCK_SECTIONS.map((s) => (
            <div key={s.label}>
              <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{s.label}</span>
                <span className="font-mono tabular-nums">{s.pct}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className={cn('h-full rounded-full', TONE_FILL[s.tone])} style={{ width: `${s.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top fade keeps the dialog's close button legible over the preview. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-card to-transparent" />
      {/* Bottom fade blends the preview into the content below it. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-card to-transparent" />

      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border/70 bg-background/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground shadow-sm">
        Preview
      </span>
    </div>
  );
}
