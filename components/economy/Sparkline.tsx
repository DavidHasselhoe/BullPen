/**
 * A small history line for the economy hub. Neutral ink, like EconomyChart:
 * an inflation print or a rate cut is not a gain or a loss (DESIGN.md One
 * Signal Rule). Decorative: the number and its context line say it in words.
 */

export function Sparkline({
  points,
  type,
  reference,
  className,
}: {
  /** Oldest first; `t` is a timestamp so uneven gaps (the Fed's changes) stay to scale. */
  points: Array<{ t: number; v: number }>;
  type: 'line' | 'bar' | 'step';
  /** A fixed level worth drawing, such as the Fed's 2% inflation goal. */
  reference?: number;
  className?: string;
}) {
  if (points.length < 2) return null;
  const W = 120;
  const H = 36;
  const pad = 3;
  const vals = points.map((p) => p.v).concat(reference ?? [], type === 'bar' ? 0 : []);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const t0 = points[0].t;
  const t1 = points.at(-1)!.t;
  const x = (t: number) => pad + ((t - t0) / (t1 - t0 || 1)) * (W - pad * 2);
  const y = (v: number) => pad + (1 - (v - lo) / span) * (H - pad * 2);
  const last = points.at(-1)!;

  let body;
  if (type === 'bar') {
    const step = (W - pad * 2) / points.length;
    const bw = Math.max(1.5, step * 0.62);
    body = points.map((p, i) => {
      const cx = pad + step * (i + 0.5);
      const top = Math.min(y(p.v), y(0));
      return (
        <rect
          key={p.t}
          x={cx - bw / 2}
          y={top}
          width={bw}
          height={Math.max(1, Math.abs(y(p.v) - y(0)))}
          rx={0.75}
          className={i === points.length - 1 ? 'fill-foreground' : 'fill-muted-foreground/70'}
        />
      );
    });
  } else {
    const d = points
      .map((p, i) => {
        if (i === 0) return `M${x(p.t)},${y(p.v)}`;
        return type === 'step' ? `H${x(p.t)}V${y(p.v)}` : `L${x(p.t)},${y(p.v)}`;
      })
      .join('');
    body = (
      <>
        <path d={d} fill="none" className="stroke-muted-foreground" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <circle cx={x(last.t)} cy={y(last.v)} r={2.5} className="fill-foreground" />
      </>
    );
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} aria-hidden focusable="false">
      {reference != null && (
        <line x1={0} x2={W} y1={y(reference)} y2={y(reference)} className="stroke-muted-foreground/50" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      )}
      {type === 'bar' && <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="stroke-border" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
      {body}
    </svg>
  );
}
