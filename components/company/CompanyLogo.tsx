'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
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
  const [fetchedUrl, setFetchedUrl] = useState<string | null>(null);
  const fetchInProgress = useRef(false);

  // When no logoUrl prop is supplied, fetch from TwelveData via API route
  useEffect(() => {
    if (logoUrl != null || !ticker || fetchInProgress.current) return;
    fetchInProgress.current = true;
    fetch(`/api/logo/${encodeURIComponent(ticker.toUpperCase())}`)
      .then((res) => res.ok ? res.json() : null)
      .then((data: { success?: boolean; logoUrl?: string } | null) => {
        if (data?.success && data.logoUrl) setFetchedUrl(data.logoUrl);
      })
      .catch(() => {})
      .finally(() => { fetchInProgress.current = false; });
  }, [ticker, logoUrl]);

  // Reset on ticker change
  useEffect(() => {
    setImageError(false);
    setFetchedUrl(null);
    fetchInProgress.current = false;
  }, [ticker]);

  const handleImageError = useCallback(() => setImageError(true), []);

  const effectiveUrl = logoUrl ?? fetchedUrl;
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
        <Image
          src={effectiveUrl}
          alt={`${name} logo`}
          width={size}
          height={size}
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
