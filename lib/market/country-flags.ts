// Country Code to Flag Emoji and Name Mapping
// Maps ISO 3166-1 alpha-2 country codes to flag emojis and country names

const COUNTRY_FLAGS: Record<string, { emoji: string; name: string }> = {
  US: { emoji: '🇺🇸', name: 'United States' },
  GB: { emoji: '🇬🇧', name: 'United Kingdom' },
  NO: { emoji: '🇳🇴', name: 'Norway' },
  SE: { emoji: '🇸🇪', name: 'Sweden' },
  DK: { emoji: '🇩🇰', name: 'Denmark' },
  FI: { emoji: '🇫🇮', name: 'Finland' },
  CA: { emoji: '🇨🇦', name: 'Canada' },
  DE: { emoji: '🇩🇪', name: 'Germany' },
  CH: { emoji: '🇨🇭', name: 'Switzerland' },
  IT: { emoji: '🇮🇹', name: 'Italy' },
  ES: { emoji: '🇪🇸', name: 'Spain' },
  PL: { emoji: '🇵🇱', name: 'Poland' },
  FR: { emoji: '🇫🇷', name: 'France' },
  NL: { emoji: '🇳🇱', name: 'Netherlands' },
  BE: { emoji: '🇧🇪', name: 'Belgium' },
  PT: { emoji: '🇵🇹', name: 'Portugal' },
  IE: { emoji: '🇮🇪', name: 'Ireland' },
  AT: { emoji: '🇦🇹', name: 'Austria' },
  JP: { emoji: '🇯🇵', name: 'Japan' },
  KR: { emoji: '🇰🇷', name: 'South Korea' },
  CN: { emoji: '🇨🇳', name: 'China' },
};

/**
 * Gets flag emoji for a country code
 */
export function getCountryFlag(countryCode: string): string {
  return COUNTRY_FLAGS[countryCode]?.emoji || '🏳️';
}

/**
 * Gets country name for a country code
 */
export function getCountryName(countryCode: string): string {
  return COUNTRY_FLAGS[countryCode]?.name || countryCode;
}
