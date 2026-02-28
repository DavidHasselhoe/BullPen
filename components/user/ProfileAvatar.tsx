'use client';

import React from 'react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { Crown } from 'lucide-react';
import { getTierColor, getTierName } from '@/lib/tier-colors';
import { cn } from '@/lib/utils';
import { type ClassValue } from 'clsx';

interface ProfileAvatarProps {
  avatarUrl?: string | null;
  displayName?: string;
  fallback?: string;
  tier?: number | null; // Account tier (1-5)
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showTooltip?: boolean;
  showCrown?: boolean; // Whether to show the golden crown (default: true for Gold tier)
  className?: ClassValue;
}

/**
 * A profile avatar component with tier-based border styling
 * Adapted from Abstract Profile for Supabase auth
 */
export function ProfileAvatar({
  avatarUrl,
  displayName = 'User',
  fallback,
  tier = 1,
  size = 'md',
  showTooltip = true,
  showCrown = true, // Show crown by default for Gold tier
  className,
}: ProfileAvatarProps) {
  // Generate fallback from display name if not provided
  const finalFallback =
    fallback ||
    displayName
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) ||
    'U';

  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-12 w-12',
    xl: 'h-24 w-24',
  };

  // Only show colored border for Gold tier (3)
  // Tier 1-2 are "normal" (no special border)
  // Removed Platinum and Diamond - only Gold and Normal
  const showTierBorder = tier === 3;
  const tierColor = showTierBorder ? getTierColor(3) : undefined; // Always use Gold color for tier 3

  const avatarElement = (
    <div
      className={cn(
        `relative rounded-full ${sizeClasses[size]}`,
        className
      )}
      style={
        showTierBorder
          ? { border: `2px solid ${tierColor}` }
          : { border: '2px solid transparent' }
      }
    >
      <div className="absolute inset-0 rounded-full overflow-hidden">
        <Avatar
          className={`w-full h-full transition-transform duration-200 hover:scale-110`}
        >
          <AvatarImage
            src={avatarUrl || undefined}
            alt={`${displayName} avatar`}
            className="object-cover"
          />
          <AvatarFallback className="bg-primary/10 text-primary text-lg">
            {finalFallback}
          </AvatarFallback>
        </Avatar>
      </div>
      {/* Gold Crown for Gold Tier (only if showCrown is true) */}
      {showTierBorder && showCrown && (
        <div 
          className={cn(
            "absolute -top-1 -right-1 z-10 bg-[#FFD700] rounded-full shadow-lg border-2 border-background",
            size === 'xl' ? "p-1.5" : "p-0.5"
          )}
        >
          <Crown className={cn(
            "text-black fill-black",
            size === 'xl' ? "h-4 w-4" : "h-3 w-3"
          )} />
        </div>
      )}
    </div>
  );

  if (!showTooltip) {
    return avatarElement;
  }

  const tierName = tier === 3 ? 'Gold' : 'Normal';

  return (
    <Tooltip>
      <TooltipTrigger asChild>{avatarElement}</TooltipTrigger>
      <TooltipContent>
        <p>{displayName}</p>
        <p className="text-xs text-muted-foreground">{tierName}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Loading state for ProfileAvatar
 */
export function ProfileAvatarSkeleton({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: ClassValue;
}) {
  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-12 w-12',
    xl: 'h-24 w-24',
  };

  return (
    <div
      className={cn(`relative rounded-full ${sizeClasses[size]}`, className)}
      style={{ border: '2px solid #C0C0C0' }}
    >
      <div className="absolute inset-0 rounded-full overflow-hidden">
        <Avatar className={`w-full h-full`}>
          <Skeleton className={`w-full h-full rounded-full bg-muted/50`} />
        </Avatar>
      </div>
    </div>
  );
}
