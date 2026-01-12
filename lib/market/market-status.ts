// Market Status Utilities
// Calculates market open/closed status based on exchange data and holidays

import type { Exchange, ExchangeHoliday, MarketStatus } from '@/lib/types/database';

/**
 * Determines if a date is a holiday for an exchange
 */
export function isHoliday(
  date: Date,
  holidays: ExchangeHoliday[]
): { isHoliday: boolean; holiday: ExchangeHoliday | null } {
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  
  const holiday = holidays.find((h) => h.date === dateStr);
  
  if (holiday) {
    return { isHoliday: true, holiday };
  }
  
  return { isHoliday: false, holiday: null };
}

/**
 * Gets the current time components in an exchange's timezone
 */
function getTimeInTimezone(date: Date, timezone: string): { hours: number; minutes: number; day: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    day: 'numeric',
    hour12: false,
  });
  
  const parts = formatter.formatToParts(date);
  const hours = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minutes = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  const day = parseInt(parts.find(p => p.type === 'day')?.value || '1', 10);
  
  return { hours, minutes, day };
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
 * Calculates market status for an exchange
 */
export function calculateMarketStatus(
  exchange: Exchange,
  holidays: ExchangeHoliday[],
  currentTime: Date = new Date()
): MarketStatus {
  const { isHoliday: isHolidayToday, holiday } = isHoliday(currentTime, holidays);
  
  // Get current time in exchange timezone
  const exchangeTime = getTimeInTimezone(currentTime, exchange.timezone);
  
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
    // Market is open, calculate time until close
    const closeDate = new Date(currentTime);
    const [closeHours, closeMinutes] = closeTime.split(':').map(Number);
    closeDate.setHours(closeHours - (exchangeTime.hours - getTimeInTimezone(closeDate, exchange.timezone).hours), closeMinutes, 0, 0);
    
    if (closeDate <= currentTime) {
      closeDate.setDate(closeDate.getDate() + 1);
    }
    
    nextCloseTime = closeDate;
    timeUntilClose = Math.max(0, closeDate.getTime() - currentTime.getTime());
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
