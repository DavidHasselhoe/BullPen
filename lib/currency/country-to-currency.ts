// Country to Currency Mapping
// Maps country codes (ISO 3166-1 alpha-2) to currency codes (ISO 4217)

export type CountryCode = string; // ISO 3166-1 alpha-2 (e.g., 'NO', 'US', 'SE')
export type CurrencyCode = string; // ISO 4217 (e.g., 'NOK', 'USD', 'SEK')

/**
 * Maps country codes to their primary currency codes
 */
export const COUNTRY_TO_CURRENCY: Record<CountryCode, CurrencyCode> = {
  // Nordic
  NO: 'NOK', // Norway
  SE: 'SEK', // Sweden
  DK: 'DKK', // Denmark
  FI: 'EUR', // Finland
  IS: 'ISK', // Iceland
  
  // North America
  US: 'USD', // United States
  CA: 'CAD', // Canada
  MX: 'MXN', // Mexico
  
  // Europe
  GB: 'GBP', // United Kingdom
  DE: 'EUR', // Germany
  FR: 'EUR', // France
  IT: 'EUR', // Italy
  ES: 'EUR', // Spain
  NL: 'EUR', // Netherlands
  BE: 'EUR', // Belgium
  AT: 'EUR', // Austria
  CH: 'CHF', // Switzerland
  PL: 'PLN', // Poland
  PT: 'EUR', // Portugal
  IE: 'EUR', // Ireland
  GR: 'EUR', // Greece
  
  // Asia
  JP: 'JPY', // Japan
  CN: 'CNY', // China
  HK: 'HKD', // Hong Kong
  SG: 'SGD', // Singapore
  KR: 'KRW', // South Korea
  IN: 'INR', // India
  TW: 'TWD', // Taiwan
  
  // Oceania
  AU: 'AUD', // Australia
  NZ: 'NZD', // New Zealand
  
  // South America
  BR: 'BRL', // Brazil
  AR: 'ARS', // Argentina
  CL: 'CLP', // Chile
  
  // Middle East
  IL: 'ILS', // Israel
  AE: 'AED', // United Arab Emirates
  SA: 'SAR', // Saudi Arabia
  
  // Africa
  ZA: 'ZAR', // South Africa
};

/**
 * Gets currency code for a country code
 */
export function getCurrencyForCountry(countryCode: CountryCode): CurrencyCode | null {
  return COUNTRY_TO_CURRENCY[countryCode] || null;
}

/**
 * Gets currency code for a country code, with fallback to USD
 */
export function getCurrencyForCountryOrDefault(countryCode: CountryCode): CurrencyCode {
  return COUNTRY_TO_CURRENCY[countryCode] || 'USD';
}
