import { Banknote } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Cash's stand-in for a company logo: same round footprint, solid so it reads as a mark, not a placeholder. */
export function CashIcon({ size, className }: { size: number; className?: string }) {
  return (
    <span
      className={cn('flex shrink-0 items-center justify-center rounded-full bg-foreground text-background', className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Banknote style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={1.75} />
    </span>
  );
}
