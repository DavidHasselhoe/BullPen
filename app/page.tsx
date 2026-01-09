'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { FundamentalChangeCard } from '@/components/discover/FundamentalChangeCard';
import { RecentFilingsList } from '@/components/discover/RecentFilingsList';
import { CompaniesToWatchList } from '@/components/discover/CompaniesToWatchList';
import {
  useFundamentalChanges,
  useRecentFilings,
  useCompaniesToWatch,
} from '@/hooks/use-discover';

export default function DiscoverPage() {
  const {
    data: fundamentalChanges,
    isLoading: isLoadingChanges,
  } = useFundamentalChanges(6);

  const {
    data: recentFilings,
    isLoading: isLoadingFilings,
  } = useRecentFilings(10);

  const {
    data: companiesToWatch,
    isLoading: isLoadingCompanies,
  } = useCompaniesToWatch(10);

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-6xl py-8 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Discover</h1>
          <p className="mt-2 text-muted-foreground">
            Fundamental changes detected from SEC filings.
          </p>
        </div>

        <div className="space-y-8">
          {/* Recent Fundamental Changes */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-foreground">
              Recent Fundamental Changes
            </h2>
            {isLoadingChanges ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Card key={i} className="border-border/50">
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : !fundamentalChanges || fundamentalChanges.length === 0 ? (
              <Card className="border-border/50">
                <CardContent className="py-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    No fundamental changes detected at this time.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {fundamentalChanges.slice(0, 6).map((change) => (
                  <FundamentalChangeCard key={`${change.type}-${change.company.id}-${change.trend?.id || change.signal?.id}`} change={change} />
                ))}
              </div>
            )}
          </section>

          <Separator />

          {/* Recently Analyzed Filings */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-foreground">
              Recently Analyzed Filings
            </h2>
            <Card className="border-border/50">
              <CardContent className="p-6">
                <RecentFilingsList
                  filings={recentFilings}
                  isLoading={isLoadingFilings}
                />
              </CardContent>
            </Card>
          </section>

          <Separator />

          {/* Companies to Watch */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-foreground">Companies to Watch</h2>
            <Card className="border-border/50">
              <CardContent className="p-6">
                <CompaniesToWatchList
                  companies={companiesToWatch}
                  isLoading={isLoadingCompanies}
                />
              </CardContent>
            </Card>
          </section>
        </div>
      </main>
    </div>
  );
}
