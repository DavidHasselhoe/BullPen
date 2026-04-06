'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDebounce } from '@/hooks/use-debounce';
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

async function searchUsers(q: string): Promise<PublicUser[]> {
  if (q.length < 2) return [];
  const res = await fetchWithTimeout(`/api/users/search?q=${encodeURIComponent(q)}&limit=30`, {}, 8000);
  if (!res.ok) return [];
  const data = (await res.json()) as SearchResponse;
  return data.results ?? [];
}

export default function UsersPage() {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 280);

  const { data: results, isLoading } = useQuery({
    queryKey: ['users-search', debouncedQuery],
    queryFn: () => searchUsers(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const showEmpty = debouncedQuery.length >= 2 && !isLoading && (results?.length ?? 0) === 0;
  const showResults = (results?.length ?? 0) > 0;
  const showPrompt = debouncedQuery.length < 2 && !isLoading;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">

        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Browse Members</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Search for other BullPen members by name or username.
          </p>
        </div>

        {/* Search input */}
        <div className="relative max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or username…"
            className="pl-9"
          />
        </div>

        {/* Results */}
        {showPrompt && (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
            <Users className="h-10 w-10 opacity-30" />
            <p className="text-sm">Type at least 2 characters to search.</p>
          </div>
        )}

        {isLoading && (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        )}

        {showEmpty && (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
            <Users className="h-10 w-10 opacity-30" />
            <p className="text-sm">No members found for &ldquo;{debouncedQuery}&rdquo;.</p>
          </div>
        )}

        {showResults && !isLoading && (
          <>
            <p className="text-xs text-muted-foreground">
              {results!.length} result{results!.length === 1 ? '' : 's'}
            </p>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {results!.map((user) => (
                <PublicProfileCard key={user.id} user={user} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
