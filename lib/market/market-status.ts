// Market Status Utilities
// Calculates market open/closed status based on exchange data and holidays

import type { Exchange, ExchangeHoliday, MarketStatus } from '@/lib/types/database';

/**
 * Gets the date string (YYYY-MM-DD) in a given timezone
 */
function getDateInTimezone(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date); // YYYY-MM-DD
}

/**
 * Determines if a date is a holiday for an exchange
 * Uses the exchange's local date (not UTC) for correct holiday matching
 */
export function isHoliday(
  date: Date,
  holidays: ExchangeHoliday[],
  timezone?: string
): { isHoliday: boolean; holiday: ExchangeHoliday | null } {
  // When timezone provided, use exchange-local date (fixes US market hours near midnight UTC)
  const dateStr = timezone ? getDateInTimezone(date, timezone) : date.toISOString().split('T')[0];
  
  const holiday = holidays.find((h) => h.date === dateStr);
  
  if (holiday) {
    return { isHoliday: true, holiday };
  }
  
  return { isHoliday: false, holiday: null };
}

/**
 * Gets the current time components in an exchange's timezone
 */
function getTimeInTimezone(date: Date, timezone: string): { hours: number; minutes: number; day: number; weekday: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    day: 'numeric',
    weekday: 'narrow',
    hour12: false,
  });
  
  const parts = formatter.formatToParts(date);
  const hours = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minutes = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  const day = parseInt(parts.find(p => p.type === 'day')?.value || '1', 10);
  
  // Get weekday number using a more reliable method
  // Create a date string in the target timezone and parse it
  const dateStr = formatter.format(date);
  const weekdayPart = parts.find(p => p.type === 'weekday')?.value;
  
  // Use a simpler approach: create a date string in timezone and check day of week
  // Get the day of week by formatting the date in the timezone
  const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
  });
  const weekdayName = weekdayFormatter.format(date).toLowerCase();
  const weekdays: Record<string, number> = {
    'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4, 'friday': 5, 'saturday': 6
  };
  const weekday = weekdays[weekdayName] ?? 1;
  
  return { hours, minutes, day, weekday };
}

/**
 * Checks if a date falls on a weekend (Saturday or Sunday) in the given timezone
 */
function isWeekend(date: Date, timezone: string): boolean {
  const exchangeTime = getTimeInTimezone(date, timezone);
  // 0 = Sunday, 6 = Saturday
  return exchangeTime.weekday === 0 || exchangeTime.weekday === 6;
}

/**
 * Calculates the next Monday at the exchange's open time
 */
function getNextMondayOpen(currentTime: Date, exchange: Exchange): Date {
  const exchangeTime = getTimeInTimezone(currentTime, exchange.timezone);
  
  // Find next Monday
  const nextMonday = new Date(currentTime);
  // If Sunday (0), Monday is tomorrow (1 day). If Saturday (6), Monday is in 2 days.
  const daysUntilMonday = exchangeTime.weekday === 0 ? 1 : 2;
  
  nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);
  
  // Create date at open time in exchange timezone
  const openDate = createDateInTimezone(nextMonday, exchange.open_time, exchange.timezone);
  
  return openDate;
}

/**
 * Parses a time string (HH:MM) and compares with current time in exchange timezone
 */
function compareTimes(timeStr: string, currentHours: number, currentMinutes: number): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const currentTotal = currentHours * 60 + currentMinutes;
  const targetTotal = hours * 60 + minutes;
  return currentTotal - targetTotal;
}

/**
 * Creates a Date object representing a specific time today in a given timezone
 * Uses a simple iterative approach to find the UTC time that corresponds to the target time
 */
function createDateInTimezone(date: Date, timeStr: string, timezone: string): Date {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  
  // Find the UTC time that, when formatted in the target timezone, equals the target time
  // We'll search through UTC hours (roughly ±12 hours from target to account for timezone differences)
  let bestDate: Date | null = null;
  let bestDiff = Infinity;
  
  const startHour = Math.max(0, hours - 12);
  const endHour = Math.min(24, hours + 12);
  
  for (let utcHour = startHour; utcHour < endHour; utcHour++) {
    for (let utcMinute = 0; utcMinute < 60; utcMinute += 1) {
      const testDate = new Date(`${dateStr}T${String(utcHour).padStart(2, '0')}:${String(utcMinute).padStart(2, '0')}:00Z`);
      
      // Format this UTC date in the target timezone
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      
      const formatted = formatter.format(testDate);
      const [formattedHours, formattedMinutes] = formatted.split(':').map(Number);
      
      // Calculate difference from target
      const targetTotal = hours * 60 + minutes;
      const formattedTotal = formattedHours * 60 + formattedMinutes;
      let diff = Math.abs(formattedTotal - targetTotal);
      if (diff > 720) diff = 1440 - diff; // Handle day boundary
      
      if (diff < bestDiff) {
        bestDiff = diff;
        bestDate = testDate;
        if (diff === 0) break; // Exact match
      }
    }
    if (bestDiff === 0) break;
  }
  
  // Fallback: return a date with the target time (will be wrong but better than null)
  return bestDate || new Date(`${dateStr}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00Z`);
}

/**
 * Calculates market status for an exchange
 */
export function calculateMarketStatus(
  exchange: Exchange,
  holidays: ExchangeHoliday[],
  currentTime: Date = new Date()
): MarketStatus {
  const { isHoliday: isHolidayToday, holiday } = isHoliday(currentTime, holidays, exchange.timezone);
  
  // Get current time in exchange timezone
  const exchangeTime = getTimeInTimezone(currentTime, exchange.timezone);
  
  // Check if it's a weekend - if so, market is closed until Monday
  if (isWeekend(currentTime, exchange.timezone)) {
    const nextMondayOpen = getNextMondayOpen(currentTime, exchange);
    
    return {
      exchange,
      isOpen: false,
      nextOpenTime: nextMondayOpen,
      nextCloseTime: null,
      timeUntilOpen: Math.max(0, nextMondayOpen.getTime() - currentTime.getTime()),
      timeUntilClose: null,
      currentTime,
      isHoliday: false,
      isEarlyClose: false,
      earlyCloseTime: null,
    };
  }
  
  // Check if it's an early close day
  const isEarlyClose = holiday?.type === 'early_close';
  const closeTime = isEarlyClose && holiday?.early_close_time
    ? holiday.early_close_time
    : exchange.close_time;
  
  // If it's a holiday (full closure), market is closed
  if (isHolidayToday && holiday?.type === 'closed') {
    // Calculate next open time (tomorrow at open_time)
    const nextOpen = new Date(currentTime);
    nextOpen.setDate(nextOpen.getDate() + 1);
    nextOpen.setHours(0, 0, 0, 0);
    
    const nextOpenExchangeTime = getTimeInTimezone(nextOpen, exchange.timezone);
    const [openHours, openMinutes] = exchange.open_time.split(':').map(Number);
    
    // Set to exchange open time
    nextOpen.setHours(openHours - (exchangeTime.hours - nextOpenExchangeTime.hours), openMinutes, 0, 0);
    
    return {
      exchange,
      isOpen: false,
      nextOpenTime: nextOpen,
      nextCloseTime: null,
      timeUntilOpen: Math.max(0, nextOpen.getTime() - currentTime.getTime()),
      timeUntilClose: null,
      currentTime,
      isHoliday: true,
      isEarlyClose: false,
      earlyCloseTime: null,
    };
  }
  
  // Compare current time with open and close times
  const openCompare = compareTimes(exchange.open_time, exchangeTime.hours, exchangeTime.minutes);
  const closeCompare = compareTimes(closeTime, exchangeTime.hours, exchangeTime.minutes);
  
  const isOpen = openCompare >= 0 && closeCompare < 0;
  
  // Calculate next open/close times
  let nextOpenTime: Date | null = null;
  let nextCloseTime: Date | null = null;
  let timeUntilOpen: number | null = null;
  let timeUntilClose: number | null = null;
  
  if (isOpen) {
    // Market is open, calculate time until close TODAY
    const closeDate = createDateInTimezone(currentTime, closeTime, exchange.timezone);
    
    // If the close time has already passed today (shouldn't happen if isOpen is correct), use tomorrow
    if (closeDate <= currentTime) {
      const tomorrow = new Date(currentTime);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowCloseDate = createDateInTimezone(tomorrow, closeTime, exchange.timezone);
      nextCloseTime = tomorrowCloseDate;
      timeUntilClose = Math.max(0, tomorrowCloseDate.getTime() - currentTime.getTime());
    } else {
      nextCloseTime = closeDate;
      timeUntilClose = Math.max(0, closeDate.getTime() - currentTime.getTime());
    }
  } else {
    // Market is closed, calculate time until open
    const openDate = new Date(currentTime);
    const [openHours, openMinutes] = exchange.open_time.split(':').map(Number);
    openDate.setHours(openHours - (exchangeTime.hours - getTimeInTimezone(openDate, exchange.timezone).hours), openMinutes, 0, 0);
    
    if (openDate <= currentTime) {
      openDate.setDate(openDate.getDate() + 1);
    }
    
    nextOpenTime = openDate;
    timeUntilOpen = Math.max(0, openDate.getTime() - currentTime.getTime());
  }
  
  // Calculate early close time if applicable
  let earlyCloseTime: Date | null = null;
  if (isEarlyClose && holiday?.early_close_time) {
    const earlyCloseDate = new Date(currentTime);
    const [earlyHours, earlyMinutes] = holiday.early_close_time.split(':').map(Number);
    earlyCloseDate.setHours(earlyHours - (exchangeTime.hours - getTimeInTimezone(earlyCloseDate, exchange.timezone).hours), earlyMinutes, 0, 0);
    if (earlyCloseDate <= currentTime) {
      earlyCloseDate.setDate(earlyCloseDate.getDate() + 1);
    }
    earlyCloseTime = earlyCloseDate;
  }
  
  return {
    exchange,
    isOpen,
    nextOpenTime,
    nextCloseTime,
    timeUntilOpen,
    timeUntilClose,
    currentTime,
    isHoliday: isHolidayToday && holiday?.type === 'closed',
    isEarlyClose,
    earlyCloseTime,
  };
}

/**
 * Formats time until event as HH:MM:SS
 */
export function formatTimeUntil(milliseconds: number): string {
  if (milliseconds <= 0) return '00:00:00';
  
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Formats time until event as "Xh Ym" or "Xm" for display
 */
export function formatTimeUntilShort(milliseconds: number): string {
  if (milliseconds <= 0) return '0m';
  const totalMinutes = Math.ceil(milliseconds / 60000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/**
 * Converts a time string (HH:MM) from exchange timezone to user's local timezone
 * Uses a binary search approach to find the UTC time that corresponds to the target time in exchange timezone
 */
export function convertTimeToLocal(timeStr: string, exchangeTimezone: string): string {
  try {
    const [targetHours, targetMinutes] = timeStr.split(':').map(Number);
    const targetMinutesTotal = targetHours * 60 + targetMinutes;
    
    // Get today's date
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Binary search for the UTC time that formats to target time in exchange timezone
    let bestDate: Date | null = null;
    let bestDiff = Infinity;
    
    // Search through UTC hours (roughly ±12 hours from target to account for timezone differences)
    const startHour = Math.max(0, targetHours - 12);
    const endHour = Math.min(24, targetHours + 12);
    
    for (let utcHour = startHour; utcHour < endHour; utcHour++) {
      for (let utcMinute = 0; utcMinute < 60; utcMinute += 5) { // Check every 5 minutes
        const testDate = new Date(`${todayStr}T${String(utcHour).padStart(2, '0')}:${String(utcMinute).padStart(2, '0')}:00Z`);
        
        // Format this UTC date in the exchange timezone
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: exchangeTimezone,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
        
        const formatted = formatter.format(testDate);
        const [formattedHours, formattedMinutes] = formatted.split(':').map(Number);
        const formattedMinutesTotal = formattedHours * 60 + formattedMinutes;
        
        // Calculate difference (account for day wrap-around)
        let diff = Math.abs(formattedMinutesTotal - targetMinutesTotal);
        if (diff > 720) diff = 1440 - diff; // Handle day boundary
        
        if (diff < bestDiff) {
          bestDiff = diff;
          bestDate = testDate;
          if (diff === 0) break; // Exact match
        }
      }
      if (bestDiff === 0) break;
    }
    
    if (!bestDate) {
      return timeStr; // Fallback
    }
    
    // Format the UTC date in local timezone
    const localFormatter = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    
    return localFormatter.format(bestDate);
  } catch (error) {
    console.error('Error converting time to local:', error);
    return timeStr; // Fallback to original time
  }
}
