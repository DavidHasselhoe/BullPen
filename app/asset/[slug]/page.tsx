'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { EmptyState } from '@/components/ui/EmptyState';
import { useBackground } from '@/hooks/use-background';
import { AddToListPicker } from '@/components/watchlist/AddToListPicker';
import { useAIPanel } from '@/components/ai/AIPanelProvider';
import { AlertDialog } from '@/components/alerts/AlertDialog';
import { useAssetProfile } from '@/hooks/use-asset-profile';
import { useStockSnapshot } from '@/hooks/use-stock-snapshot';
import { slugToSymbol, findCommodity } from '@/lib/assets/asset-type';
import dynamic from 'next/dynamic';

const StockPricePanel = dynamic(
  () => import('@/components/stock/StockPricePanel').then((m) => ({ default: m.StockPricePanel })),
  { ssr: false, loading: () => <div className="mb-8 h-[340px] animate-shimmer rounded-2xl" /> }
);

const CommoditySections = dynamic(
  () => import('@/components/asset/CommodityInsights').then((m) => ({
    default: function CommoditySections({ slug }: { slug: string }) {
      const commodity = findCommodity(slug);
      if (!commodity) return null;
      return (
        <>
          <m.CommodityOwnCard commodity={commodity} slug={slug} />
          <m.CommodityContextCard commodity={commodity} slug={slug} />
          <m.CommodityAboutCard commodity={commodity} />
        </>
      );
    },
  })),
  { ssr: false }
);

const CommodityStatusChip = dynamic(
  () => import('@/components/asset/CommodityInsights').then((m) => ({ default: m.CommodityStatusChip })),
  { ssr: false }
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
  const { setAIContext } = useAIPanel();
  const { t } = useTranslation('stock');
  const commodity = findCommodity(slug);

  const { data: profile, isLoading: profileLoading } = useAssetProfile(slug.toUpperCase());
  const snapshot = useStockSnapshot(slug.toUpperCase());

  const displayName = commodity ? t(`commodityName_${commodity.id}`) : profile?.name ?? symbol;
  const assetType = profile?.assetType ?? 'unknown';

  // The asset profile route infers the type from the symbol pattern, so a bogus
  // "FAKECOIN/USD" still comes back as assetType 'crypto' — the profile can't tell
  // us it's invalid. The snapshot is authoritative: if the request SUCCEEDED but
  // TwelveData returned no quote, the symbol doesn't exist. A rate-limit/error
  // returns success=false, so we never false-flag a real asset then.
  const hasRealQuote = (snapshot.data?.quote?.price ?? 0) > 0;
  const isNotFound =
    !snapshot.isLoading &&
    snapshot.data?.success === true &&
    !hasRealQuote;

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
              {t('stockBack')}
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
            {t('stockBack')}
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
          <Card className="mb-8">
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <CompanyLogo
                      name={displayName}
                      ticker={symbol}
                      logoUrl={profile?.logoUrl ?? null}
                      size={64}
                      loading="eager"
                    />
                    <div className="min-w-0">
                      <h1 className="text-3xl font-semibold text-foreground">{displayName}</h1>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Badge variant="outline" className="font-mono text-sm">
                          {symbol}
                        </Badge>
                        {commodity ? (
                          <CommodityStatusChip />
                        ) : assetType !== 'unknown' && (
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
                      {commodity && (
                        <p className="mt-1 text-sm text-muted-foreground">{t(`commodityUnit_${commodity.unit.per}`)}</p>
                      )}
                    </div>
                  </div>
                </div>
                {/* Watch leads, as on stock pages. Ask Bull lives in the floating
                    button on every page; here it ran off-screen on a phone. */}
                <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end [&_button]:max-sm:h-10">
                  <AddToListPicker symbol={symbol} companyName={displayName} />
                  <AlertDialog symbol={symbol} companyName={displayName} />
                </div>
              </div>
            </CardHeader>
          </Card>
        )}

        {/* Price panel — slug is passed as ticker; routes convert slug → symbol internally */}
        <StockPricePanel ticker={slug.toUpperCase()} />

        {/* Commodities get their own sections: the generic stats card only
            repeated the panel above for them. */}
        {commodity ? (
          <CommoditySections slug={slug.toUpperCase()} />
        ) : assetType !== 'stock' && assetType !== 'unknown' && (
          <AssetStatsCard ticker={slug.toUpperCase()} assetType={assetType} />
        )}

        {/* Description from profile (for forex) */}
        {!commodity && profile?.description && (
          <Card className="mb-8">
            <CardHeader>
              <p className="text-sm leading-relaxed text-muted-foreground">{profile.description}</p>
            </CardHeader>
          </Card>
        )}

      </div>
    </div>
  );
}
