'use client';

import { useState, useEffect } from 'react';
import { Clock as ClockIcon } from 'lucide-react';

interface LiveClockProps {
  className?: string;
  format?: '12h' | '24h';
}

/**
 * Live Clock Component
 * Displays current time based on user's timezone
 * Automatically detects 12h/24h format based on locale
 */
export function LiveClock({ className, format }: LiveClockProps) {
  const [time, setTime] = useState<string>('');
  const [date, setDate] = useState<string>('');

  useEffect(() => {
    // Determine format (12h or 24h)
    const timeFormat =
      format ||
      (typeof window !== 'undefined' &&
      new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
      }).formatToParts(new Date())[0].value.includes('AM')
        ? '12h'
        : '24h');

    const updateTime = () => {
      const now = new Date();
      
      // Format time
      const timeOptions: Intl.DateTimeFormatOptions = {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: timeFormat === '12h',
      };
      
      setTime(
        new Intl.DateTimeFormat(navigator.language || 'en-US', timeOptions).format(
          now
        )
      );

      // Format date
      const dateOptions: Intl.DateTimeFormatOptions = {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      };
      
      setDate(
        new Intl.DateTimeFormat(navigator.language || 'en-US', dateOptions).format(
          now
        )
      );
    };

    // Update immediately
    updateTime();

    // Update every second
    const interval = setInterval(updateTime, 1000);

    return () => clearInterval(interval);
  }, [format]);

  return (
    <div className={`flex items-center gap-2 ${className || ''}`}>
      <ClockIcon className="h-4 w-4 text-muted-foreground" />
      <div className="flex flex-col">
        <span className="text-sm font-medium text-foreground">{time}</span>
        <span className="text-xs text-muted-foreground">{date}</span>
      </div>
    </div>
  );
}
