// components/holdings/risk-analysis/Recommendations.tsx
'use client';

interface Props {
  recommendations: string[];
}

// recommendations is a flat string[] (app/api/holdings/risk-analysis/route.ts:56)
// — no structured current/suggested-range/rationale fields exist to render,
// so this stays a clean numbered list rather than fabricating those sub-fields.
export function Recommendations({ recommendations }: Props) {
  if (!recommendations?.length) return null;

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-foreground">Recommended actions</h3>
      <ol className="space-y-3">
        {recommendations.map((rec, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-0.5 shrink-0 font-mono text-xs font-semibold text-muted-foreground/70 tabular-nums">
              {String(i + 1).padStart(2, '0')}
            </span>
            <p className="text-[13px] leading-relaxed text-foreground/85">{rec}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
