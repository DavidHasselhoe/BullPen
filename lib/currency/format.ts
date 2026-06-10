import type { CurrencyCode } from '@/lib/currency/currency-conversion';

/** Maps currency code → the locale that governs formatting conventions (symbol position, separators). */
export const CURRENCY_LOCALE: Partial<Record<CurrencyCode, string>> = {
  USD: 'en-US', EUR: 'de-DE', GBP: 'en-GB',
  NOK: 'nb-NO', SEK: 'sv-SE', DKK: 'da-DK',
  JPY: 'ja-JP', CHF: 'de-CH', CAD: 'en-CA',
  AUD: 'en-AU', NZD: 'en-NZ', CNY: 'zh-CN',
  BRL: 'pt-BR', HKD: 'zh-HK', SGD: 'en-SG',
  KRW: 'ko-KR', MXN: 'es-MX', INR: 'hi-IN',
};

/**
 * Full locale-aware currency formatter — for any amount the user reads as money
 * (result cards, tooltips). NEVER abbreviates with K/M/B; shows the complete
 * number with the locale's grouping + symbol placement.
 *   NOK, roundNumbers=true  → "281 120 kr"
 *   USD, roundNumbers=false → "$281,120.22"
 */
export function makeFullFormatter(currency: CurrencyCode, roundNumbers: boolean) {
  const locale = CURRENCY_LOCALE[currency] ?? 'en-US';
  const d = roundNumbers ? 0 : 2;
  return (value: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    }).format(value);
}

/**
 * Compact formatter for chart Y-axis tick labels ONLY, where horizontal space is
 * tight. Uses the locale's compact notation (e.g. "$281K", "1,2 mill. kr").
 * Do not use this for headline amounts — use makeFullFormatter there.
 */
export function makeCompactFormatter(currency: CurrencyCode) {
  const locale = CURRENCY_LOCALE[currency] ?? 'en-US';
  return (value: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumSignificantDigits: 3,
    }).format(value);
}
