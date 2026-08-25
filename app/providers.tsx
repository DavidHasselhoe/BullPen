'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { LanguageProvider } from '@/components/i18n/LanguageProvider';
import { AuthProvider } from '@/components/auth/AuthProvider';
import type { CreateI18nOptions } from '@/lib/i18n/config';

interface ProvidersProps {
  children: React.ReactNode;
  /** Resolved server-side by middleware + app/layout.tsx (lib/i18n/server.ts). */
  locale: string;
  /** Server-preloaded i18next resources for `locale` — see lib/i18n/server.ts's loadResources(). */
  resources: CreateI18nOptions['resources'];
}

export function Providers({ children, locale, resources }: ProvidersProps) {
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
      <AuthProvider>
        <LanguageProvider locale={locale} resources={resources}>
          {children}
        </LanguageProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
