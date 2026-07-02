import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Standard "Upgrade to Pro" button → /upgrade. */
export function UpgradeCTA({
  label = 'Upgrade to Pro',
  size = 'sm',
  variant = 'default',
  className,
}: {
  label?: string;
  size?: 'sm' | 'default' | 'lg';
  variant?: 'default' | 'outline' | 'ghost';
  className?: string;
}) {
  return (
    <Button asChild size={size} variant={variant} className={className}>
      <Link href="/upgrade">
        <Sparkles className="mr-1.5 h-3.5 w-3.5" />
        {label}
      </Link>
    </Button>
  );
}
