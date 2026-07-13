'use client';

import { GraduationCap } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useBackground } from '@/hooks/use-background';
import { AuthGate } from '@/components/ui/AuthGate';
import { XPBar } from '@/components/academy/XPBar';

export default function AcademyLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const { hasAnimatedBackground } = useBackground();

  if (isLoading) {
    return <div className="min-h-screen" />;
  }

  if (!isAuthenticated) {
    return (
      <AuthGate
        icon={<GraduationCap className="h-7 w-7" />}
        title="Sign in to use Academy"
        description="Bite-sized lessons that teach you how investing actually works — earn XP and build a streak as you go."
        signInHref="/login?redirectTo=/academy"
      />
    );
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
