/**
 * The markets BullPen supports for the Market Context "market hours" clocks.
 * Derived from the `exchanges` table — one entry per country, ordered roughly
 * by prominence. The `codes` are the exchange codes sent to the Market Hours
 * widget (the card groups by country, so one representative code is enough,
 * but the US lists both its primary venues).
 *
 * This is the source list for the Preferences → "Markets to display" toggles.
 * Everything is shown ("on") by default; users toggle off the markets they
 * don't follow.
 */
export interface SupportedMarket {
  /** ISO-3166 alpha-2 country code — the unit the user toggles. */
  country: string;
  /** Exchange codes belonging to this market. */
  codes: string[];
}

export const SUPPORTED_MARKETS: SupportedMarket[] = [
  { country: 'US', codes: ['NYSE', 'NASDAQ'] },
  { country: 'GB', codes: ['LSE'] },
  { country: 'DE', codes: ['XETRA'] },
  { country: 'FR', codes: ['EPA'] },
  { country: 'NL', codes: ['AMS'] },
  { country: 'CH', codes: ['SIX'] },
  { country: 'CA', codes: ['TSX'] },
  { country: 'IT', codes: ['BIT'] },
  { country: 'ES', codes: ['BME'] },
  { country: 'SE', codes: ['STO'] },
  { country: 'NO', codes: ['OSE'] },
  { country: 'DK', codes: ['CPH'] },
  { country: 'FI', codes: ['HEL'] },
  { country: 'IE', codes: ['EDH'] },
  { country: 'BE', codes: ['EBR'] },
  { country: 'AT', codes: ['WBAG'] },
  { country: 'PT', codes: ['ELI'] },
  { country: 'PL', codes: ['WSE'] },
];

/** Every supported exchange code — the "all markets on" default. */
export const ALL_SUPPORTED_EXCHANGE_CODES: string[] = SUPPORTED_MARKETS.flatMap((m) => m.codes);

/** Lookup a market by one of its exchange codes. */
export function marketForCode(code: string): SupportedMarket | undefined {
  const upper = code.toUpperCase();
  return SUPPORTED_MARKETS.find((m) => m.codes.some((c) => c.toUpperCase() === upper));
}

/**
 * Given the saved exchange-code list (`market_hours_exchanges`), return the set
 * of country codes that are currently "on". `null`/empty means all markets are on.
 */
export function selectedCountriesFromCodes(codes: string[] | null): Set<string> {
  if (!codes || codes.length === 0) {
    return new Set(SUPPORTED_MARKETS.map((m) => m.country));
  }
  const on = new Set<string>();
  for (const code of codes) {
    const market = marketForCode(code);
    if (market) on.add(market.country);
  }
  return on;
}

/** Flatten a set of selected country codes back into the exchange-code list to persist. */
export function codesFromSelectedCountries(countries: Set<string>): string[] {
  return SUPPORTED_MARKETS.filter((m) => countries.has(m.country)).flatMap((m) => m.codes);
}
