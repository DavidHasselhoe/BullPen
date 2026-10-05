'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useDebounce } from '@/hooks/use-debounce';
import { useAuth } from '@/hooks/use-auth';
import { PublicProfileCard } from '@/components/user/PublicProfileCard';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, Search } from 'lucide-react';
import type { PublicUser } from '@/app/api/users/search/route';
import { fetchWithTimeout } from '@/lib/utils';

interface SearchResponse {
  success: boolean;
  results: PublicUser[];
}

async function fetchMembers(q: string): Promise<PublicUser[]> {
  const params = new URLSearchParams({ limit: '30' });
  if (q.trim().length >= 2) params.set('q', q.trim());
  const res = await fetchWithTimeout(`/api/users/search?${params.toString()}`, {}, 8000);
  // Thrown, not swallowed: an empty list read as "No public profiles yet"
  // when the request had simply failed.
  if (!res.ok) throw new Error(`Members request failed: ${res.status}`);
  const data = (await res.json()) as SearchResponse;
  return data.results ?? [];
}

// Opens Settings on its Privacy tab, the same event the notifications page uses.
const openPrivacySettings = () =>
  window.dispatchEvent(new CustomEvent('settings:open', { detail: { tab: 'privacy' } }));

export default function UsersPage() {
  const { t } = useTranslation('user');
  const { isAuthenticated } = useAuth();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 280);

  const { data: results, isLoading, isError } = useQuery({
    queryKey: ['users-search', debouncedQuery],
    queryFn: () => fetchMembers(debouncedQuery),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const isSearchMode = debouncedQuery.trim().length >= 2;
  const count = results?.length ?? 0;
  const showEmpty = isSearchMode && !isLoading && !isError && count === 0;
  const showResults = count > 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-10 sm:px-6 lg:px-8 space-y-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('usersPageTitle')}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{t('usersPageSubtitle')}</p>
          </div>
        </div>

        <div className="relative max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('usersSearchPlaceholder')}
            aria-label={t('usersSearchPlaceholder')}
            className="pl-9"
          />
        </div>

        {/* Profiles are opt-in, so say where the switch is. */}
        {isAuthenticated && (
          <button type="button" onClick={openPrivacySettings} className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            {t('usersHowToJoin')}
          </button>
        )}

        {isLoading && (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        )}

        {isError && !isLoading && (
          <div role="alert" className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
            <Users className="h-10 w-10 opacity-30" aria-hidden />
            <p className="text-sm">{t('usersLoadError')}</p>
          </div>
        )}

        {showEmpty && (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
            <Users className="h-10 w-10 opacity-30" aria-hidden />
            <p className="text-sm">{t('usersNoResults', { query: debouncedQuery })}</p>
          </div>
        )}

        {showResults && !isLoading && (
          <>
            <p className="text-xs text-muted-foreground">
              {isSearchMode
                ? t('usersResultCount', { count, query: debouncedQuery })
                : t('usersPublicCount', { count })}
            </p>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {results!.map((user) => (
                <PublicProfileCard key={user.id} user={user} />
              ))}
            </div>
          </>
        )}

        {!isLoading && !isError && !showResults && !showEmpty && (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
            <Users className="h-10 w-10 opacity-30" aria-hidden />
            <p className="text-sm">{t('usersEmpty')}</p>
            {isAuthenticated && (
              <button type="button" onClick={openPrivacySettings} className="text-xs text-primary underline-offset-4 hover:underline">
                {t('usersHowToJoin')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
