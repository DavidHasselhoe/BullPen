'use client';

/**
 * Shared building blocks for AI tool-result cards (components/ai/cards/*).
 */

export function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 rounded-xl border border-border/60 bg-background/60 p-3 text-xs last:mb-0">
      {children}
    </div>
  );
}

export function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground/85">{label}</div>
      <div className="tabular-nums font-medium text-foreground">{value}</div>
    </div>
  );
}

/** True when a formatted numeric string (e.g. "-2.34%", "-$1.2M") represents a negative value. */
export function isNegative(formatted: string | undefined): boolean {
  return typeof formatted === 'string' && formatted.trim().startsWith('-');
}
