'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RecentFilingsList } from '@/components/discover/RecentFilingsList';
import { useRecentFilings } from '@/hooks/use-discover';
import { FileText } from 'lucide-react';
import { useBackground } from '@/hooks/use-background';
import { cn } from '@/lib/utils';

export default function FilingsPage() {
  const { hasAnimatedBackground } = useBackground();
  const { data: filings, isLoading } = useRecentFilings(50);

  return (
    <div className={cn('min-h-screen', hasAnimatedBackground ? '' : 'bg-background')}>
      <main className="container mx-auto max-w-4xl py-10 px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Filing Explorer</h1>
              <p className="text-muted-foreground mt-0.5">
                Browse recently filed SEC reports (10-K, 10-Q, 20-F) across companies
              </p>
            </div>
          </div>
        </div>

        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Recent filings</CardTitle>
            <p className="text-sm text-muted-foreground">
              Companies that filed new reports, sorted by filing date
            </p>
          </CardHeader>
          <CardContent>
            <RecentFilingsList filings={filings} isLoading={isLoading} />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
