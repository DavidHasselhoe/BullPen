'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { EmptyState } from '@/components/ui/EmptyState';
import AnimatedContent from '@/components/ui/AnimatedContent';
import { useBackground } from '@/hooks/use-background';
import { AddToListPicker } from '@/components/watchlist/AddToListPicker';
import { useAIPanel } from '@/components/ai/AIPanelProvider';
import { useAssetProfile } from '@/hooks/use-asset-profile';
import { useStockSnapshot } from '@/hooks/use-stock-snapshot';
import { slugToSymbol } from '@/lib/assets/asset-type';
import dynamic from 'next/dynamic';

const StockPricePanel = dynamic(
  () => import('@/components/stock/StockPricePanel').then((m) => ({ default: m.StockPricePanel })),
  { ssr: false, loading: () => <div className="mb-8 h-[340px] animate-shimmer rounded-2xl" /> }
);

const AssetStatsCard = dynamic(
  () => import('@/components/asset/AssetStatsCard').then((m) => ({ default: m.AssetStatsCard })),
  { ssr: false }
);

const ASSET_TYPE_LABEL: Record<string, string> = {
  crypto: 'Cryptocurrency',
  commodity: 'Commodity',
  forex: 'Forex',
  etf: 'ETF',
  stock: 'Stock',
};

export default function AssetPage() {
  const params = useParams();
  const router = useRouter();
  const slug = (params.slug as string) ?? '';
  const symbol = slugToSymbol(slug.toUpperCase());
  const { hasAnimatedBackground } = useBackground();
  const { open: openAIPanel, setAIContext } = useAIPanel();

  const { data: profile, isLoading: profileLoading } = useAssetProfile(slug.toUpperCase());
  const snapshot = useStockSnapshot(slug.toUpperCase());

  const displayName = profile?.name ?? symbol;
  const assetType = profile?.assetType ?? 'unknown';

  // A real asset resolves a profile (known type) or has a live quote (price > 0).
  // useAssetProfile throws on an unknown slug, so `profile` is null in that case.
  const hasRealQuote = (snapshot.data?.quote?.price ?? 0) > 0;
  const isNotFound =
    !profileLoading && !snapshot.isLoading &&
    !hasRealQuote &&
    (profile == null || assetType === 'unknown');

  useEffect(() => {
    if (!symbol) return;
    setAIContext({ tickers: [symbol], label: displayName });
    return () => setAIContext(null);
  }, [symbol, displayName, setAIContext]);

  if (isNotFound) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-6">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          </div>
          <div className="py-20">
            <EmptyState
              pose="error"
              title={`“${symbol}” not found`}
              description="We couldn't find an asset with that symbol. Double-check it, or search for a name."
            >
              <Button onClick={() => router.push('/dashboard')}>Back to Dashboard</Button>
            </EmptyState>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${hasAnimatedBackground ? '' : 'bg-background'}`}>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

        {/* Back button */}
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        </div>

        {/* Asset header */}
        {profileLoading && !profile ? (
          <Card className="mb-8">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Skeleton className="h-16 w-16 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-7 w-48" />
                  <Skeleton className="h-4 w-32" />
                </div>
              </div>
            </CardHeader>
          </Card>
        ) : (
          <AnimatedContent reverse={true}>
            <Card className="mb-8">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <CompanyLogo
                        name={displayName}
                        ticker={symbol}
                        logoUrl={profile?.logoUrl ?? null}
                        size={64}
                      />
                      <div>
                        <h1 className="text-3xl font-semibold text-foreground">{displayName}</h1>
                        <div className="mt-1 flex items-center gap-2">
                          <Badge variant="outline" className="font-mono text-sm">
                            {symbol}
                          </Badge>
                          {assetType !== 'unknown' && (
                            <span className="text-sm text-muted-foreground">
                              {ASSET_TYPE_LABEL[assetType] ?? assetType}
                            </span>
                          )}
                          {profile?.exchange && (
                            <span className="text-sm text-muted-foreground">
                              · {profile.exchange}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 flex-wrap justify-end">
                    <AddToListPicker symbol={symbol} companyName={displayName} />
                    <Button variant="outline" size="sm" onClick={() => openAIPanel()} className="gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Ask AI
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </AnimatedContent>
        )}

        {/* Price panel — slug is passed as ticker; routes convert slug → symbol internally */}
        <AnimatedContent reverse={true} delay={0.05}>
          <StockPricePanel ticker={slug.toUpperCase()} />
        </AnimatedContent>

        {/* Asset-specific stats card for non-equity assets */}
        {assetType !== 'stock' && assetType !== 'unknown' && (
          <AnimatedContent reverse={true} delay={0.1}>
            <AssetStatsCard ticker={slug.toUpperCase()} assetType={assetType} />
          </AnimatedContent>
        )}

        {/* Description from profile (for commodity/forex) */}
        {profile?.description && (
          <AnimatedContent reverse={true} delay={0.15}>
            <Card className="mb-8">
              <CardHeader>
                <p className="text-sm leading-relaxed text-muted-foreground">{profile.description}</p>
              </CardHeader>
            </Card>
          </AnimatedContent>
        )}

      </div>
    </div>
  );
}
