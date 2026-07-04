import Link from 'next/link';
import { Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4">
      <EmptyState
        pose="error"
        title="Page not found"
        description="The page you're looking for doesn't exist or has been moved."
      >
        <Button asChild>
          <Link href="/discover" className="inline-flex items-center gap-2">
            <Home className="h-4 w-4" />
            Go to Discover
          </Link>
        </Button>
      </EmptyState>
    </div>
  );
}
