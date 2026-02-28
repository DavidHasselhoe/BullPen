// Form 8-K Stock Split Detection
// Extracts stock split information from Item 3.02 or 8.01

/**
 * Detected stock split from 8-K filing
 */
export interface DetectedStockSplit {
  splitRatio: number; // e.g., 2.0 for 2-for-1 split, 0.5 for 1-for-2 reverse split
  effectiveDate: string; // ISO date string (YYYY-MM-DD)
  description: string;
}

/**
 * Extracts stock split information from Item 3.02 or 8.01 content
 * Looks for patterns like:
 * - "2-for-1 stock split"
 * - "3:1 stock split"
 * - "reverse stock split of 1-for-5"
 */
export function detectStockSplitFrom8K(content: string, filingDate: string): DetectedStockSplit | null {
  const upperContent = content.toUpperCase();

  // Pattern 1: "X-for-Y stock split" (forward split)
  // Examples: "2-for-1", "3-for-1", "4-for-1"
  const forwardSplitPattern = /(\d+)\s*[-:]\s*for\s*[-:]?\s*1\s+stock\s+split/i;
  const forwardMatch = upperContent.match(forwardSplitPattern);
  if (forwardMatch) {
    const ratio = parseFloat(forwardMatch[1]);
    if (ratio > 0 && ratio <= 100) {
      // Extract effective date
      const effectiveDate = extractEffectiveDate(content, filingDate);
      return {
        splitRatio: ratio,
        effectiveDate,
        description: `${forwardMatch[1]}-for-1 stock split`,
      };
    }
  }

  // Pattern 2: "1-for-X reverse stock split" (reverse split)
  // Examples: "1-for-5", "1-for-10"
  const reverseSplitPattern = /1\s*[-:]\s*for\s*[-:]?\s*(\d+)\s+reverse\s+stock\s+split/i;
  const reverseMatch = upperContent.match(reverseSplitPattern);
  if (reverseMatch) {
    const divisor = parseFloat(reverseMatch[1]);
    if (divisor > 0 && divisor <= 100) {
      const ratio = 1 / divisor;
      const effectiveDate = extractEffectiveDate(content, filingDate);
      return {
        splitRatio: ratio,
        effectiveDate,
        description: `1-for-${reverseMatch[1]} reverse stock split`,
      };
    }
  }

  // Pattern 3: "X:Y stock split"
  // Examples: "2:1", "3:1"
  const colonSplitPattern = /(\d+)\s*:\s*1\s+stock\s+split/i;
  const colonMatch = upperContent.match(colonSplitPattern);
  if (colonMatch) {
    const ratio = parseFloat(colonMatch[1]);
    if (ratio > 0 && ratio <= 100) {
      const effectiveDate = extractEffectiveDate(content, filingDate);
      return {
        splitRatio: ratio,
        effectiveDate,
        description: `${colonMatch[1]}:1 stock split`,
      };
    }
  }

  // Pattern 4: Generic "stock split" with ratio in nearby text
  // This is a fallback pattern - less reliable
  if (upperContent.includes('STOCK SPLIT')) {
    // Try to find a ratio near "stock split"
    const splitContextPattern = /(\d+)\s*[-:]\s*for\s*[-:]?\s*1/;
    const contextMatch = upperContent.match(splitContextPattern);
    if (contextMatch) {
      const ratio = parseFloat(contextMatch[1]);
      if (ratio > 0 && ratio <= 100) {
        const effectiveDate = extractEffectiveDate(content, filingDate);
        return {
          splitRatio: ratio,
          effectiveDate,
          description: `Stock split (detected: ${contextMatch[1]}-for-1)`,
        };
      }
    }
  }

  return null;
}

/**
 * Extracts effective date from 8-K content
 * Looks for patterns like:
 * - "effective date of [date]"
 * - "effective [date]"
 * - "will become effective on [date]"
 * Falls back to filing_date if not found
 */
function extractEffectiveDate(content: string, filingDate: string): string {
  const upperContent = content.toUpperCase();

  // Pattern 1: "effective date of [date]"
  const effectiveDatePattern1 = /effective\s+date\s+of\s+(\w+\s+\d{1,2},?\s+\d{4})/i;
  const match1 = content.match(effectiveDatePattern1);
  if (match1) {
    const parsed = parseDate(match1[1]);
    if (parsed) return parsed;
  }

  // Pattern 2: "effective [date]"
  const effectiveDatePattern2 = /effective\s+(\w+\s+\d{1,2},?\s+\d{4})/i;
  const match2 = content.match(effectiveDatePattern2);
  if (match2) {
    const parsed = parseDate(match2[1]);
    if (parsed) return parsed;
  }

  // Pattern 3: "will become effective on [date]"
  const effectiveDatePattern3 = /will\s+become\s+effective\s+on\s+(\w+\s+\d{1,2},?\s+\d{4})/i;
  const match3 = content.match(effectiveDatePattern3);
  if (match3) {
    const parsed = parseDate(match3[1]);
    if (parsed) return parsed;
  }

  // Pattern 4: ISO date format (YYYY-MM-DD)
  const isoDatePattern = /(\d{4}-\d{2}-\d{2})/;
  const isoMatch = content.match(isoDatePattern);
  if (isoMatch) {
    return isoMatch[1];
  }

  // Fallback to filing date
  return filingDate;
}

/**
 * Parses a date string to ISO format (YYYY-MM-DD)
 * Supports formats like "January 15, 2024" or "Jan 15, 2024"
 */
function parseDate(dateStr: string): string | null {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return null;
    }
    return date.toISOString().split('T')[0];
  } catch {
    return null;
  }
}
