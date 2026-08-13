'use client';

interface Props {
  label: string;
  courseCount: number;
  requiresPro: boolean;
}

/** Flat section divider between groups of nodes on the /academy path — a label, not a decorative "world" banner. */
export function ChapterBanner({ label, courseCount, requiresPro }: Props) {
  return (
    <div className="relative z-[2] flex items-center justify-center gap-2 rounded-xl border border-border/50 bg-card px-4 py-2.5 my-2">
      <span className="text-sm font-bold tracking-tight">{label}</span>
      <span className="text-[10px] font-mono text-muted-foreground/70">
        {courseCount} {courseCount === 1 ? 'course' : 'courses'}
      </span>
      {requiresPro && (
        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-400/10 text-amber-500">
          Pro
        </span>
      )}
    </div>
  );
}
