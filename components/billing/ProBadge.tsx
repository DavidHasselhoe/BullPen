import { cn } from '@/lib/utils';

/** Small "PRO" pill for marking Pro-only features. */
export function ProBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full bg-primary/15 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary',
        className
      )}
    >
      Pro
    </span>
  );
}
