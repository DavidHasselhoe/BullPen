// Currency Conversion Utilities
// Handles currency conversion using exchange rates from Frankfurter API

import { logger } from '@/lib/utils/logger';

/**
 * Currency codes supported by the system
 */
export type CurrencyCode = 
  | 'USD' | 'EUR' | 'GBP' | 'NOK' | 'SEK' | 'DKK' 
  | 'JPY' | 'CHF' | 'CAD' | 'AUD' | 'NZD' | 'CNY'
  | 'BRL' | 'HKD' | 'SGD' | 'KRW' | 'MXN' | 'INR';

/**
 * Exchange rate data from API
 */
export interface ExchangeRates {
  base: string;
  date: string;
  rates: Record<string, number>;
}

/**
 * Fetches exchange rates (from cache or API)
 */
export async function getExchangeRates(base: CurrencyCode = 'USD'): Promise<ExchangeRates | null> {
  try {
    const response = await fetch(`/api/currency/rates?base=${base}`);
    const data = await response.json();
    
    if (!data.success) {
      console.error('Error fetching exchange rates:', data.error);
      return null;
    }
    
    return {
      base: data.base,
      date: data.date,
      rates: data.rates,
    };
  } catch (error) {
    console.error('Error fetching exchange rates:', error);
    return null;
  }
}

/**
 * Converts a value from one currency to another
 */
export function convertCurrency(
  value: number,
  fromCurrency: CurrencyCode,
  toCurrency: CurrencyCode,
  rates: ExchangeRates | null
): number {
  // If same currency, return as-is
  if (fromCurrency === toCurrency) {
    return value;
  }
  
  if (!rates) {
    logger.debug('Exchange rates not available, returning original value');
    return value;
  }
  
  // If converting from base currency (USD), use direct rate
  if (fromCurrency === rates.base) {
    const rate = rates.rates[toCurrency];
    if (!rate) {
      logger.debug(`Rate not found for ${toCurrency}, returning original value`);
      return value;
    }
    return value * rate;
  }
  
  // If converting to base currency (USD), use inverse rate
  if (toCurrency === rates.base) {
    const rate = rates.rates[fromCurrency];
    if (!rate) {
      logger.debug(`Rate not found for ${fromCurrency}, returning original value`);
      return value;
    }
    return value / rate;
  }
  
  // Converting between two non-base currencies
  // Convert to base first, then to target
  const fromRate = rates.rates[fromCurrency];
  const toRate = rates.rates[toCurrency];
  
  if (!fromRate || !toRate) {
    logger.debug(`Rate not found for conversion ${fromCurrency} -> ${toCurrency}, returning original value`);
    return value;
  }
  
  // Convert: value -> USD -> target
  const usdValue = value / fromRate;
  return usdValue * toRate;
}

/**
 * Options for currency formatting
 */
export interface FormatCurrencyOptions {
  /** When true, display whole numbers (no decimals) */
  round?: boolean;
}

/**
 * Formats a number with optional rounding (for quantities, shares, etc.)
 */
export function formatNumber(value: number, round = false): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: round ? 0 : 2,
  }).format(value);
}

/**
 * Formats a percentage with optional rounding
 */
export function formatPercent(value: number, round = false): string {
  const sign = value >= 0 ? '+' : '';
  const formatted = round ? value.toFixed(1) : value.toFixed(2);
  return `${sign}${formatted}%`;
}

/**
 * Formats a currency value with proper symbol and locale
 */
export function formatCurrency(
  value: number,
  currency: CurrencyCode,
  localeOrOptions: string | FormatCurrencyOptions = 'en-US'
): string {
  const locale = typeof localeOrOptions === 'string' ? localeOrOptions : 'en-US';
  const options = typeof localeOrOptions === 'object' ? localeOrOptions : {};
  const fractionDigits = options.round ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 };

  const currencyMap: Record<CurrencyCode, string> = {
    USD: 'USD',
    EUR: 'EUR',
    GBP: 'GBP',
    NOK: 'NOK',
    SEK: 'SEK',
    DKK: 'DKK',
    JPY: 'JPY',
    CHF: 'CHF',
    CAD: 'CAD',
    AUD: 'AUD',
    NZD: 'NZD',
    CNY: 'CNY',
    BRL: 'BRL',
    HKD: 'HKD',
    SGD: 'SGD',
    KRW: 'KRW',
    MXN: 'MXN',
    INR: 'INR',
  };
  
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyMap[currency] || 'USD',
      ...fractionDigits,
    }).format(value);
  } catch (error) {
    // Fallback to simple formatting
    const symbol = getCurrencySymbol(currency);
    const digits = options.round ? 0 : 2;
    return `${symbol}${value.toFixed(digits)}`;
  }
}

/**
 * Gets currency symbol
 */
export function getCurrencySymbol(currency: CurrencyCode): string {
  const symbols: Record<CurrencyCode, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    NOK: 'kr',
    SEK: 'kr',
    DKK: 'kr',
    JPY: '¥',
    CHF: 'Fr',
    CAD: 'C$',
    AUD: 'A$',
    NZD: 'NZ$',
    CNY: '¥',
    BRL: 'R$',
    HKD: 'HK$',
    SGD: 'S$',
    KRW: '₩',
    MXN: 'Mex$',
    INR: '₹',
  };
  
  return symbols[currency] || '$';
}
