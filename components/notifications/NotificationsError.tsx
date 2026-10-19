'use client';

import { RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * A failed load. Both the page and the bell used to fall through to their
 * empty state here and tell the reader they had no notifications.
 */
export function NotificationsError({ onRetry, retrying }: { onRetry: () => void; retrying?: boolean }) {
  return (
    <div role="alert" className="px-6 py-10 text-center">
      <p className="text-sm font-medium">Couldn&apos;t load your notifications</p>
      <p className="mt-1 text-sm text-muted-foreground">Check your connection and try again.</p>
      <Button variant="outline" size="sm" onClick={onRetry} disabled={retrying} className="mt-4 gap-1.5">
        <RotateCw className={retrying ? 'h-3.5 w-3.5 animate-spin motion-reduce:animate-none' : 'h-3.5 w-3.5'} />
        Try again
      </Button>
    </div>
  );
}
