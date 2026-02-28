'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Check, Loader2 } from 'lucide-react';

interface StatefulButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => Promise<void> | void;
  successDuration?: number; // How long to show success state in ms
  children: React.ReactNode;
  variant?: 'default' | 'success';
}

export function StatefulButton({
  onClick,
  className,
  children,
  disabled,
  successDuration = 2000,
  variant = 'default',
  ...props
}: StatefulButtonProps) {
  const [state, setState] = useState<'idle' | 'loading' | 'success'>('idle');

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || state === 'loading' || state === 'success') return;

    setState('loading');

    try {
      await onClick?.(e);
      setState('success');

      // Reset to idle after success duration
      setTimeout(() => {
        setState('idle');
      }, successDuration);
    } catch (error) {
      // On error, reset to idle
      setState('idle');
      throw error;
    }
  };

  const isDisabled = disabled || state === 'loading' || state === 'success';

  return (
    <button
      {...props}
      onClick={handleClick}
      disabled={isDisabled}
      className={cn(
        'relative inline-flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium transition-all duration-300',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        state === 'idle' && variant === 'default' && [
          'bg-primary text-primary-foreground hover:bg-primary/90',
          'focus-visible:ring-primary',
        ],
        state === 'idle' && variant === 'success' && [
          'bg-green-600 text-white hover:bg-green-700',
          'focus-visible:ring-green-600',
        ],
        state === 'loading' && [
          'bg-primary/80 text-primary-foreground cursor-wait',
          'focus-visible:ring-primary',
        ],
        state === 'success' && [
          'bg-green-500 text-white animate-success-button',
          'focus-visible:ring-green-500',
        ],
        isDisabled && 'cursor-not-allowed opacity-90',
        className
      )}
    >
      <span className="relative flex items-center gap-2">
        {state === 'loading' && (
          <Loader2 className="h-4 w-4 animate-spin" />
        )}
        {state === 'success' && (
          <Check className="h-4 w-4 animate-scale-in" />
        )}
        <span
          className={cn(
            'transition-all duration-300',
            state === 'success' && 'animate-fade-in-up'
          )}
        >
          {state === 'idle' && children}
          {state === 'loading' && 'Saving...'}
          {state === 'success' && 'Saved!'}
        </span>
      </span>
      
      {/* Success animation overlay */}
      {state === 'success' && (
        <span
          className="absolute inset-0 rounded-md bg-green-400/30 animate-ping-once pointer-events-none"
          aria-hidden="true"
        />
      )}
    </button>
  );
}
