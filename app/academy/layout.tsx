'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useBackground } from '@/hooks/use-background';
import { XPBar } from '@/components/academy/XPBar';

export default function AcademyLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const { hasAnimatedBackground } = useBackground();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login?redirectTo=/academy');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) {
    return <div className="min-h-screen" />;
  }

  return (
    <div className={`min-h-screen ${hasAnimatedBackground ? '' : 'bg-background'}`}>
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 lg:py-8">
        <div className="sticky top-16 z-10 -mx-4 sm:-mx-6 px-4 sm:px-6 pb-3">
          <XPBar />
        </div>
        <div className="mt-2">{children}</div>
      </div>
    </div>
  );
}
