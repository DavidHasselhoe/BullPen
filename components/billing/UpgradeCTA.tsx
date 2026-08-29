import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

/** Standard "Upgrade to Pro" button → /upgrade. */
export function UpgradeCTA({
  label,
  size = 'sm',
  variant = 'default',
  className,
}: {
  label?: string;
  size?: 'sm' | 'default' | 'lg';
  variant?: 'default' | 'outline' | 'ghost';
  className?: string;
}) {
  const { t } = useTranslation('billing');
  const resolvedLabel = label ?? t('upgradeToProLabel');
  return (
    <Button asChild size={size} variant={variant} className={className}>
      <Link href="/upgrade">
        <Sparkles className="mr-1.5 h-3.5 w-3.5" />
        {resolvedLabel}
      </Link>
    </Button>
  );
}
