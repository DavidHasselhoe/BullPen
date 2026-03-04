'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

export interface CompanyLogoProps {
  name: string;
  ticker: string;
  logoUrl?: string | null;
  size?: number;
  className?: string;
  /** If true, on image error will call logo ensure API to fetch and save logo */
  ensureOnError?: boolean;
}

/**
 * Returns display text for logo fallback
 * Shows full ticker (e.g., "NVDA") instead of initials
 */
function getDisplayText(name: string, ticker: string): string {
  // Always use full ticker for logo fallback
  return ticker.toUpperCase();
}

/**
 * Generates a deterministic color from ticker for consistent initials background
 */
function getInitialsColor(ticker: string): string {
  // Simple hash function to get consistent color from ticker
  let hash = 0;
  for (let i = 0; i < ticker.length; i++) {
    hash = ticker.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Generate hue (0-360) for HSL color
  const hue = Math.abs(hash) % 360;
  
  // Use muted colors (lower saturation, moderate lightness for dark mode compatibility)
  return `hsl(${hue}, 35%, 45%)`;
}

/**
 * Company Logo Component
 * Renders company logo if available, otherwise shows initials in square badge
 */
export function CompanyLogo({
  name,
  ticker,
  logoUrl,
  size = 40,
  className,
  ensureOnError = true,
}: CompanyLogoProps) {
  const [imageError, setImageError] = useState(false);
  const [ensuredUrl, setEnsuredUrl] = useState<string | null>(null);
  const ensureInProgress = useRef(false);

  const displayText = useMemo(() => getDisplayText(name, ticker), [name, ticker]);
  const initialsColor = useMemo(() => getInitialsColor(ticker), [ticker]);

  const handleImageError = useCallback(() => {
    if (!ensureOnError || !ticker || ensureInProgress.current) {
      setImageError(true);
      return;
    }
    ensureInProgress.current = true;
    fetch(`/api/logo/${encodeURIComponent(ticker)}`)
      .then((res) => res.json())
      .then((data: { success?: boolean; logoUrl?: string }) => {
        if (data.success && data.logoUrl) {
          setEnsuredUrl(`${data.logoUrl}?t=${Date.now()}`);
          setImageError(false);
        } else {
          setImageError(true);
        }
      })
      .catch(() => setImageError(true))
      .finally(() => {
        ensureInProgress.current = false;
      });
  }, [ensureOnError, ticker]);
  
  // Calculate font size based on ticker length to fit in square
  // Larger base size for better readability, especially for 4-letter tickers like NVDA
  const fontSize = useMemo(() => {
    const baseSize = size * 0.38; // Slightly larger base for better visibility
    // Scale down if ticker is long (more than 4 characters)
    if (displayText.length > 4) {
      return baseSize * (4 / displayText.length);
    }
    // For 4-letter tickers, use slightly smaller font to ensure it fits
    if (displayText.length === 4) {
      return baseSize * 0.9; // 90% for 4-letter tickers like NVDA
    }
    return baseSize;
  }, [size, displayText.length]);

  const effectiveLogoUrl = ensuredUrl || logoUrl;
  const showFallback = !effectiveLogoUrl || imageError;

  return (
    <div
      className={cn(
        'flex items-center justify-center shrink-0 relative',
        className
      )}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
      }}
    >
      {effectiveLogoUrl && !imageError ? (
        // Render logo image using Next.js Image component
        <Image
          src={effectiveLogoUrl}
          alt={`${name} logo`}
          width={size}
          height={size}
          className="w-full h-full object-contain"
          onError={handleImageError}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
          }}
        />
      ) : null}
      
      {/* Ticker fallback - show if no logo URL or image failed to load */}
      {showFallback && (
        <div
          className={cn(
            'flex items-center justify-center rounded w-full h-full absolute inset-0',
            'font-semibold text-white'
          )}
          style={{
            backgroundColor: initialsColor,
            fontSize: fontSize,
          }}
        >
          {displayText}
        </div>
      )}
    </div>
  );
}
