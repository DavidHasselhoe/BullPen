'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { symbolToSlug } from '@/lib/assets/asset-type';
import { CompanyLogo } from '@/components/company/CompanyLogo';

const CRYPTO_ASSETS = [
  { symbol: 'BTC/USD', name: 'Bitcoin',  short: 'BTC', logoUrl: 'https://assets.coingecko.com/coins/images/1/small/bitcoin.png' },
  { symbol: 'ETH/USD', name: 'Ethereum', short: 'ETH', logoUrl: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png' },
  { symbol: 'SOL/USD', name: 'Solana',   short: 'SOL', logoUrl: 'https://assets.coingecko.com/coins/images/4128/small/solana.png' },
  { symbol: 'XAU/USD', name: 'Gold',     short: 'XAU', logoUrl: 'https://kgqpzuvhslqazurfrqya.supabase.co/storage/v1/object/public/company-logos/commodity-xau.svg' },
];

interface AssetQuote {
  price: number;
  changePercent: number;
}

function fmtPrice(price: number): string {
  if (price >= 1000) return `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (price >= 1)    return `$${price.toFixed(2)}`;
  return `$${price.toFixed(4)}`;
}

export function CryptoMarketCard() {
  const symbols = CRYPTO_ASSETS.map((a) => a.symbol);

  const { data: quotes } = useQuery<Record<string, AssetQuote>>({
    queryKey: ['crypto-market-card-quotes', symbols],
    queryFn: async () => {
      const res = await fetch('/api/quotes/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols }),
      });
      const json = await res.json();
      const raw = json.quotes as Record<string, { price: number; changePercent: number }> ?? {};
      return raw;
    },
    staleTime: 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
  });

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <span className="text-base">₿</span>
          Crypto &amp; Commodities
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {CRYPTO_ASSETS.map(({ symbol, name, short, logoUrl }) => {
          const slug = symbolToSlug(symbol);
          const q = quotes?.[symbol];
          const isUp = (q?.changePercent ?? 0) >= 0;

          return (
            <Link
              key={symbol}
              href={`/asset/${slug}`}
              className="group flex flex-col gap-2 rounded-xl border border-border/40 bg-muted/30 p-3 transition-colors hover:border-border hover:bg-muted/60"
            >
              <div className="flex items-center justify-between">
                <CompanyLogo name={name} ticker={symbolToSlug(symbol)} logoUrl={logoUrl} size={28} />
                {q ? (
                  isUp
                    ? <TrendingUp className="h-3 w-3 text-emerald-500" />
                    : <TrendingDown className="h-3 w-3 text-red-500" />
                ) : null}
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">{short}</div>
                <div className="text-sm font-semibold text-foreground truncate">{name}</div>
              </div>
              {q ? (
                <>
                  <span className="text-sm tabular-nums font-medium">{fmtPrice(q.price)}</span>
                  <span className={cn('text-xs tabular-nums', isUp ? 'text-emerald-500' : 'text-red-500')}>
                    {isUp ? '+' : ''}{q.changePercent.toFixed(2)}%
                  </span>
                </>
              ) : (
                <span className="text-xs text-muted-foreground/50">—</span>
              )}
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
