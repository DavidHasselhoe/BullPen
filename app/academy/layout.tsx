'use client';

import { GraduationCap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useBackground } from '@/hooks/use-background';
import { AuthGate } from '@/components/ui/AuthGate';
import { XPBar } from '@/components/academy/XPBar';

export default function AcademyLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation('academy');
  const { isAuthenticated, isLoading } = useAuth();
  const { hasAnimatedBackground } = useBackground();
  const pathname = usePathname();
  // Only the course catalog itself (/academy exactly) is a public preview for
  // SEO/conversion — see app/api/academy/courses/route.ts. Every sub-route
  // (a lesson, quiz, leaderboard, completion screen) stays fully gated.
  const isPublicCatalog = pathname === '/academy';

  if (isLoading) {
    return <div className="min-h-screen" />;
  }

  if (!isAuthenticated && !isPublicCatalog) {
    return (
      <AuthGate
        icon={<GraduationCap className="h-7 w-7" />}
        title={t('academyLayoutSignInTitle')}
        description={t('academyLayoutSignInDescription')}
        signInHref="/login?redirectTo=/academy"
      />
    );
  }

  if (!isAuthenticated) {
    return <div className="min-h-screen"><div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 lg:py-8">{children}</div></div>;
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
