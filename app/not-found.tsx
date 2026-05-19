import Link from 'next/link';
import { FileQuestion, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4">
      <div className="rounded-full bg-muted p-4 mb-4">
        <FileQuestion className="h-10 w-10 text-muted-foreground" />
      </div>
      <h1 className="text-xl font-semibold text-foreground mb-2">
        Page not found
      </h1>
      <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Button asChild>
        <Link href="/discover" className="flex items-center gap-2">
          <Home className="h-4 w-4" />
          Go to Discover
        </Link>
      </Button>
    </div>
  );
}
