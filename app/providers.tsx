'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { LanguageProvider } from '@/components/i18n/LanguageProvider';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { SignupGateProvider } from '@/components/auth/SignupGate';
import { ClockSync } from '@/components/i18n/ClockSync';
import type { CreateI18nOptions } from '@/lib/i18n/config';
import type { AuthUser } from '@/lib/auth/auth';

interface ProvidersProps {
  children: React.ReactNode;
  /** Resolved server-side by middleware + app/layout.tsx (lib/i18n/server.ts). */
  locale: string;
  /** Server-preloaded i18next resources for `locale` — see lib/i18n/server.ts's loadResources(). */
  resources: CreateI18nOptions['resources'];
  /** The signed-in profile from the server render (getServerProfile); null when signed out. */
  initialUser: AuthUser | null;
}

export function Providers({ children, locale, resources, initialUser }: ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider initialUser={initialUser}>
        <LanguageProvider locale={locale} resources={resources}>
          <ClockSync />
          <SignupGateProvider>{children}</SignupGateProvider>
        </LanguageProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
