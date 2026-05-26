'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

export interface CompanyLogoProps {
  name: string;
  ticker: string;
  logoUrl?: string | null;
  size?: number;
  className?: string;
}

function getInitialsColor(ticker: string): string {
  let hash = 0;
  for (let i = 0; i < ticker.length; i++) {
    hash = ticker.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 35%, 45%)`;
}

export function CompanyLogo({ name, ticker, logoUrl, size = 40, className }: CompanyLogoProps) {
  const [imageError, setImageError] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setImageError(false); }, [ticker]);

  const handleImageError = useCallback(() => setImageError(true), []);

  // Logo resolution cascade:
  //  1. Caller passed `logoUrl` explicitly → use it directly (instant).
  //  2. No URL → fall back to the self-healing `/api/logo/[ticker]` proxy
  //     which 302-redirects to the resolved CDN URL and caches the result.
  //  3. On image error (proxy 404'd or upstream broke) → initials.
  //
  // We use a plain <img> instead of next/image because the optimizer struggles
  // to follow redirects to dynamically-resolved upstream image hosts and 400s
  // even when the destination is whitelisted in remotePatterns. These logos
  // are tiny (22–40px) so the optimization gain isn't worth the breakage.
  const effectiveUrl =
    logoUrl ?? (ticker ? `/api/logo/${encodeURIComponent(ticker)}` : null);
  const showFallback = !effectiveUrl || imageError;

  const displayText = ticker.toUpperCase();
  const initialsColor = useMemo(() => getInitialsColor(ticker), [ticker]);
  const fontSize = useMemo(() => {
    const base = size * 0.38;
    if (displayText.length > 4) return base * (4 / displayText.length);
    if (displayText.length === 4) return base * 0.9;
    return base;
  }, [size, displayText.length]);

  return (
    <div
      className={cn(
        'flex items-center justify-center shrink-0 relative rounded-full overflow-hidden',
        className
      )}
      style={{ width: size, height: size, minWidth: size, minHeight: size }}
    >
      {effectiveUrl && !imageError && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={effectiveUrl}
          alt={`${name} logo`}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover object-center"
          onError={handleImageError}
        />
      )}

      {showFallback && (
        <div
          className="flex items-center justify-center w-full h-full absolute inset-0 font-semibold text-white"
          style={{ backgroundColor: initialsColor, fontSize }}
        >
          {displayText}
        </div>
      )}
    </div>
  );
}
