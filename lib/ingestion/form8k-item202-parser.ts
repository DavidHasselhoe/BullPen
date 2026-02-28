// Form 8-K Item 2.02 Parser
// Phase B: Minimal, fail-closed text extraction for earnings releases
// Rejects ~80-90% of cases - only accepts unambiguous quarterly earnings

/**
 * Result of parsing Item 2.02 earnings data
 */
export interface Item202EarningsData {
  periodEndDate: string; // ISO date (YYYY-MM-DD)
  epsDiluted?: number;
  epsBasic?: number;
  revenue?: number;
  currency: string; // Default: USD
}

/**
 * Result of Item 2.02 parsing attempt
 */
export interface Item202ParseResult {
  success: boolean;
  data?: Item202EarningsData;
  error?: string;
  rejectionReason?: string;
}

/**
 * Rejection phrases - if any of these appear, reject extraction
 */
const REJECTION_PHRASES = [
  'non-GAAP',
  'non GAAP',
  'adjusted',
  'pro forma',
  'year-to-date',
  'year to date',
  'YTD',
  'six months',
  '6 months',
  'half year',
  'semi-annual',
  'annual',
  'full year',
  'twelve months',
  '12 months',
];

/**
 * Checks if content contains rejection phrases
 */
function containsRejectionPhrases(content: string): boolean {
  const upperContent = content.toUpperCase();
  return REJECTION_PHRASES.some(phrase => upperContent.includes(phrase.toUpperCase()));
}

/**
 * Extracts period end date from "Quarter Ended [date]" pattern
 * Returns ISO date string (YYYY-MM-DD) or null
 */
function extractQuarterEndDate(content: string): string | null {
  // Patterns for "Quarter Ended [date]"
  const patterns = [
    /quarter\s+ended\s+([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})/i, // "Quarter Ended June 30, 2024"
    /for\s+the\s+quarter\s+ended\s+([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})/i, // "For the quarter ended June 30, 2024"
    /quarter\s+ended\s+([A-Z][a-z]+)\s+(\d{1,2})\s+(\d{4})/i, // "Quarter Ended June 30 2024"
    /quarter\s+ended\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i, // "Quarter Ended 6/30/2024"
    /quarter\s+ended\s+(\d{4})-(\d{2})-(\d{2})/i, // "Quarter Ended 2024-06-30"
  ];

  const monthNames: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    jan: 1, feb: 2, mar: 3, apr: 4, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  };

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      let year: number;
      let month: number;
      let day: number;

      if (match[3] && match[3].length === 4) {
        // Format: "Month Day, Year" or "Month Day Year"
        year = parseInt(match[3], 10);
        const monthName = match[1].toLowerCase();
        month = monthNames[monthName];
        day = parseInt(match[2], 10);
      } else if (match[3] && match[3].length === 4 && match[1].match(/\d+/)) {
        // Format: "MM/DD/YYYY"
        month = parseInt(match[1], 10);
        day = parseInt(match[2], 10);
        year = parseInt(match[3], 10);
      } else if (match[1] && match[1].length === 4) {
        // Format: "YYYY-MM-DD"
        year = parseInt(match[1], 10);
        month = parseInt(match[2], 10);
        day = parseInt(match[3], 10);
      } else {
        continue;
      }

      if (month && month >= 1 && month <= 12 && day && day >= 1 && day <= 31 && year && year >= 2000 && year <= 2100) {
        // Format as ISO date
        const date = new Date(year, month - 1, day);
        if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
          return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        }
      }
    }
  }

  return null;
}

/**
 * Extracts EPS (diluted) from explicit numeric sentence
 * Pattern: "diluted earnings per share" or "EPS (diluted)" followed by number
 */
function extractEPSDiluted(content: string): number | null {
  // Patterns for diluted EPS
  const patterns = [
    /diluted\s+earnings\s+per\s+share[^$]*\$?([\d,]+\.?\d*)/i,
    /EPS\s*\(?\s*diluted\s*\)?[^$]*\$?([\d,]+\.?\d*)/i,
    /earnings\s+per\s+share\s*[–-]?\s*diluted[^$]*\$?([\d,]+\.?\d*)/i,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      const value = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(value) && value > -100 && value < 100) { // Sanity check
        return value;
      }
    }
  }

  return null;
}

/**
 * Extracts EPS (basic) from explicit numeric sentence
 */
function extractEPSBasic(content: string): number | null {
  const patterns = [
    /basic\s+earnings\s+per\s+share[^$]*\$?([\d,]+\.?\d*)/i,
    /EPS\s*\(?\s*basic\s*\)?[^$]*\$?([\d,]+\.?\d*)/i,
    /earnings\s+per\s+share\s*[–-]?\s*basic[^$]*\$?([\d,]+\.?\d*)/i,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      const value = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(value) && value > -100 && value < 100) {
        return value;
      }
    }
  }

  return null;
}

/**
 * Extracts revenue from explicit statement
 * Pattern: "revenue" or "net sales" followed by dollar amount
 */
function extractRevenue(content: string): { value: number; currency: string } | null {
  const patterns = [
    /(?:total\s+)?revenue[^$]*\$?([\d,]+(?:\.\d+)?)\s*(?:million|billion|thousand)?/i,
    /net\s+sales[^$]*\$?([\d,]+(?:\.\d+)?)\s*(?:million|billion|thousand)?/i,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      let value = parseFloat(match[1].replace(/,/g, ''));
      
      // Check for magnitude keywords (million, billion, etc.)
      const magnitudeMatch = content.substring(match.index || 0, (match.index || 0) + 200).match(/(million|billion|thousand)/i);
      if (magnitudeMatch) {
        const magnitude = magnitudeMatch[1].toLowerCase();
        if (magnitude === 'billion') value *= 1000000000;
        else if (magnitude === 'million') value *= 1000000;
        else if (magnitude === 'thousand') value *= 1000;
      }

      if (!isNaN(value) && value > 0 && value < 1e15) { // Sanity check
        return { value, currency: 'USD' };
      }
    }
  }

  return null;
}

/**
 * Parses Item 2.02 earnings release content
 * Phase B: Minimal, fail-closed extraction with strict acceptance criteria
 */
export function parseItem202Earnings(itemContent: string): Item202ParseResult {
  if (!itemContent || itemContent.length < 100) {
    return {
      success: false,
      error: 'Item 2.02 content too short or missing',
      rejectionReason: 'insufficient_content',
    };
  }

  // Step 1: Check for rejection phrases (non-GAAP, YTD, etc.)
  if (containsRejectionPhrases(itemContent)) {
    return {
      success: false,
      error: 'Item 2.02 contains rejection phrases (non-GAAP, YTD, etc.)',
      rejectionReason: 'contains_rejection_phrases',
    };
  }

  // Step 2: Extract period end date (must have explicit "Quarter Ended [date]")
  const periodEndDate = extractQuarterEndDate(itemContent);
  if (!periodEndDate) {
    return {
      success: false,
      error: 'Could not extract period end date from "Quarter Ended [date]" pattern',
      rejectionReason: 'period_end_date_not_found',
    };
  }

  // Step 3: Extract EPS (at least one required: basic or diluted)
  const epsDiluted = extractEPSDiluted(itemContent);
  const epsBasic = extractEPSBasic(itemContent);

  if (!epsDiluted && !epsBasic) {
    return {
      success: false,
      error: 'Could not extract EPS (basic or diluted) from explicit numeric statement',
      rejectionReason: 'eps_not_found',
    };
  }

  // Step 4: Extract revenue (optional but preferred)
  const revenueData = extractRevenue(itemContent);

  // Step 5: Validate extracted data
  const data: Item202EarningsData = {
    periodEndDate,
    currency: revenueData?.currency || 'USD',
  };

  if (epsDiluted !== null) {
    data.epsDiluted = epsDiluted;
  }

  if (epsBasic !== null) {
    data.epsBasic = epsBasic;
  }

  if (revenueData) {
    data.revenue = revenueData.value;
  }

  return {
    success: true,
    data,
  };
}
