// Filing Classifier
// Classifies filings as annual, quarterly, or other with confidence scores
// Supports both US (10-K/10-Q) and foreign (20-F/6-K) issuers

export type ReportType = 'annual' | 'quarterly' | 'other';
export type FilingForm = '10-K' | '10-Q' | '20-F' | '6-K' | '8-K' | 'OTHER';

export interface FilingClassification {
  reportType: ReportType;
  confidenceScore: number;
  signals: ClassificationSignal[];
  periodEndDate?: string;
  fiscalYear?: number;
  fiscalQuarter?: number;
}

export interface ClassificationSignal {
  type: 'form_type' | 'content_heuristic' | 'exhibit_detection' | 'date_pattern';
  strength: number; // 0.0 to 1.0
  evidence: string;
  reportType?: ReportType; // Optional report type if this signal indicates one
}

/**
 * Classification configuration
 */
export const CLASSIFICATION_CONFIG = {
  minConfidenceThreshold: 0.7, // Minimum confidence to classify as annual/quarterly (for 10-K, 10-Q, 20-F)
  minConfidenceThreshold6K: 0.35, // Lower threshold for 6-K filings (they're harder to classify, many are legitimately quarterly)
  signalWeights: {
    formType: 0.6, // Strong signal from form type
    contentHeuristic: 0.3, // Moderate signal from content patterns
    exhibitDetection: 0.2, // Moderate signal from exhibit presence
    datePattern: 0.3, // Moderate signal from date patterns
  },
};

/**
 * Classifies a filing based on metadata and content
 * 
 * This function combines multiple signals to determine:
 * - Report type (annual, quarterly, other)
 * - Confidence score (0.0 to 1.0)
 * - Period information (if available)
 */
/**
 * Checks if a 6-K filing is a quarterly earnings report based on strict criteria:
 * 1. Contains "Current report" in title/description
 * 2. Contains EX-99.1 exhibit
 * 3. Filed in quarterly earnings months (Feb, Apr, Jul, Nov)
 */
function isQuarterlyEarnings6K(
  formType: string,
  filingContent: string,
  filingDate?: string
): boolean {
  if (formType.toUpperCase().trim() !== '6-K') {
    return false;
  }

  const contentLower = filingContent.toLowerCase();
  
  // Criterion 1: Must contain "Current report" in the filing header/title
  // Check in the first 5000 characters (header section) for better accuracy
  const headerSection = filingContent.substring(0, 5000);
  const hasCurrentReport = /6-K\s*\(?\s*Current\s+Report/i.test(headerSection) || 
                           /Current\s+Report/i.test(headerSection) ||
                           /FORM\s+6-K.*CURRENT\s+REPORT/i.test(headerSection);
  
  // Criterion 2: Must contain EX-99.1 (earnings release exhibit)
  // Check both in header (document list) and in content
  const hasEx991 = /\bEX-99\.1\b/i.test(filingContent) || 
                   /\bEXHIBIT\s+99\.1\b/i.test(filingContent) ||
                   /<TYPE>EX-99\.1/i.test(filingContent) ||
                   /<FILENAME>.*ex99-1/i.test(filingContent);
  
  // Criterion 3: Filed in quarterly earnings months (Feb=2, Apr=4, Jul=7, Nov=11)
  let isEarningsMonth = false;
  if (filingDate) {
    try {
      // Parse filing date (format: YYYYMMDD)
      const year = parseInt(filingDate.substring(0, 4));
      const month = parseInt(filingDate.substring(4, 6));
      // Quarterly earnings are typically filed in Feb (Q4), Apr (Q1), Jul (Q2), Nov (Q3)
      isEarningsMonth = [2, 4, 7, 11].includes(month);
    } catch (e) {
      // If date parsing fails, don't reject based on month
      isEarningsMonth = true; // Allow if date can't be parsed
    }
  } else {
    // If no filing date, don't reject based on month
    isEarningsMonth = true;
  }
  
  // All three criteria must be met for a 6-K to be considered quarterly earnings
  return hasCurrentReport && hasEx991 && isEarningsMonth;
}

export function classifyFiling(
  formType: string,
  filingContent: string,
  filingMetadata?: {
    filingDate?: string;
    reportDate?: string;
    periodEndDate?: string;
  }
): FilingClassification {
  const signals: ClassificationSignal[] = [];
  let reportType: ReportType = 'other';
  let confidenceScore = 0;

  const normalizedForm = formType.toUpperCase().trim();

  // Signal 1: Form type classification (strongest signal)
  const formTypeSignal = classifyByFormType(normalizedForm);
  if (formTypeSignal) {
    signals.push(formTypeSignal);
    confidenceScore += formTypeSignal.strength * CLASSIFICATION_CONFIG.signalWeights.formType;
    reportType = formTypeSignal.reportType || 'other';
  }

  // Signal 2: Content heuristics (quarterly/annual indicators)
  const contentSignals = classifyByContent(filingContent);
  signals.push(...contentSignals);
  
  const contentStrength = contentSignals.reduce((sum, s) => sum + s.strength, 0) / contentSignals.length || 0;
  if (contentStrength > 0) {
    // Content can override form type if it's stronger
    const contentReportType = contentSignals.find(s => s.reportType)?.reportType;
    if (contentReportType && contentStrength > 0.5) {
      reportType = contentReportType;
    }
    confidenceScore += contentStrength * CLASSIFICATION_CONFIG.signalWeights.contentHeuristic;
  }

  // Signal 3: Exhibit detection (for 6-K earnings releases)
  const exhibitSignals = classifyByExhibits(filingContent);
  signals.push(...exhibitSignals);
  
  const exhibitStrength = exhibitSignals.reduce((sum, s) => sum + s.strength, 0) / exhibitSignals.length || 0;
  
  // Special handling for 6-K filings: Apply strict quarterly earnings criteria
  if (normalizedForm === '6-K') {
    const isQuarterlyEarnings = isQuarterlyEarnings6K(
      formType,
      filingContent,
      filingMetadata?.filingDate
    );
    
    if (isQuarterlyEarnings) {
      // Strong signal: Meets all criteria for quarterly earnings 6-K
      signals.push({
        type: 'exhibit_detection',
        strength: 0.9,
        evidence: '6-K meets strict quarterly earnings criteria (Current report, EX-99.1, earnings month)',
        reportType: 'quarterly',
      });
      reportType = 'quarterly';
      confidenceScore += 0.9 * CLASSIFICATION_CONFIG.signalWeights.exhibitDetection;
    } else {
      // Weak or no signal: Doesn't meet strict criteria
      if (exhibitStrength > 0) {
        // Has exhibits but doesn't meet all criteria - lower confidence
        confidenceScore += exhibitStrength * 0.5 * CLASSIFICATION_CONFIG.signalWeights.exhibitDetection;
      }
      // If it doesn't meet strict criteria, it's likely not a quarterly earnings report
      // Don't automatically set to quarterly
    }
  } else {
    // For non-6-K filings, use normal exhibit detection
    if (exhibitStrength > 0) {
      if (exhibitSignals.some(s => s.reportType === 'quarterly')) {
        reportType = 'quarterly';
      }
      confidenceScore += exhibitStrength * CLASSIFICATION_CONFIG.signalWeights.exhibitDetection;
    }
  }

  // Signal 4: Date patterns (period end dates)
  const dateSignals = classifyByDatePatterns(filingContent, filingMetadata);
  signals.push(...dateSignals);
  
  const dateStrength = dateSignals.reduce((sum, s) => sum + s.strength, 0) / dateSignals.length || 0;
  if (dateStrength > 0) {
    confidenceScore += dateStrength * CLASSIFICATION_CONFIG.signalWeights.datePattern;
  }

  // Normalize confidence score to 0.0-1.0 range
  confidenceScore = Math.min(1.0, confidenceScore);

  // Extract period information
  const periodInfo = extractPeriodInfo(filingContent, filingMetadata);

  return {
    reportType,
    confidenceScore,
    signals,
    ...periodInfo,
  };
}

/**
 * Classifies filing by SEC form type
 * Strong signal: Form type directly indicates report type
 */
function classifyByFormType(formType: string): ClassificationSignal & { reportType: ReportType } | null {
  // Annual forms
  if (formType === '10-K' || formType === '20-F') {
    return {
      type: 'form_type',
      strength: 1.0,
      evidence: `Form type ${formType} indicates annual report`,
      reportType: 'annual',
    };
  }

  // Quarterly forms
  if (formType === '10-Q') {
    return {
      type: 'form_type',
      strength: 1.0,
      evidence: `Form type ${formType} indicates quarterly report`,
      reportType: 'quarterly',
    };
  }

  // 6-K is a candidate for quarterly (but needs content verification)
  if (formType === '6-K') {
    return {
      type: 'form_type',
      strength: 0.4, // Lower confidence - 6-K can be many things
      evidence: `Form type ${formType} is a candidate for quarterly report`,
      reportType: 'quarterly',
    };
  }

  return null;
}

/**
 * Classifies filing by content heuristics
 * Looks for quarterly/annual indicators in filing text
 */
function classifyByContent(content: string): Array<ClassificationSignal & { reportType?: ReportType }> {
  const signals: Array<ClassificationSignal & { reportType?: ReportType }> = [];
  const contentUpper = content.toUpperCase();

  // Quarterly indicators
  const quarterlyPatterns = [
    { pattern: /\b(three|3)\s+months?\s+ended\b/i, strength: 0.8, evidence: 'Contains "three months ended"' },
    { pattern: /\b(six|6)\s+months?\s+ended\b/i, strength: 0.7, evidence: 'Contains "six months ended"' },
    { pattern: /\b(quarter|q[1-4]|first\s+quarter|second\s+quarter|third\s+quarter)\s+ended\b/i, strength: 0.9, evidence: 'Contains quarter indicators' },
    { pattern: /\bunaudited\s+condensed\s+(consolidated\s+)?financial\s+statements\b/i, strength: 0.8, evidence: 'Contains unaudited condensed financial statements' },
    { pattern: /\bquarterly\s+(results?|earnings?|report)\b/i, strength: 0.9, evidence: 'Contains "quarterly results/earnings"' },
    { pattern: /\binterim\s+(financial|report)\b/i, strength: 0.7, evidence: 'Contains "interim financial"' },
  ];

  // Annual indicators
  const annualPatterns = [
    { pattern: /\b(twelve|12)\s+months?\s+ended\b/i, strength: 0.8, evidence: 'Contains "twelve months ended"' },
    { pattern: /\bfiscal\s+year\s+ended\b/i, strength: 0.9, evidence: 'Contains "fiscal year ended"' },
    { pattern: /\bannual\s+(report|financial)\b/i, strength: 0.9, evidence: 'Contains "annual report/financial"' },
    { pattern: /\baudited\s+(consolidated\s+)?financial\s+statements\b/i, strength: 0.8, evidence: 'Contains audited financial statements' },
  ];

  // Check for quarterly patterns
  for (const pattern of quarterlyPatterns) {
    if (pattern.pattern.test(contentUpper)) {
      signals.push({
        type: 'content_heuristic',
        strength: pattern.strength,
        evidence: pattern.evidence,
        reportType: 'quarterly',
      });
    }
  }

  // Check for annual patterns
  for (const pattern of annualPatterns) {
    if (pattern.pattern.test(contentUpper)) {
      signals.push({
        type: 'content_heuristic',
        strength: pattern.strength,
        evidence: pattern.evidence,
        reportType: 'annual',
      });
    }
  }

  // Check for income statement table indicators (often quarterly)
  const hasIncomeStatement = /\b(consolidated\s+)?(statements?\s+of\s+)?(income|operations|earnings)\b/i.test(contentUpper);
  if (hasIncomeStatement) {
    // Check if it mentions quarterly/three months
    const isQuarterly = /\b(quarter|three\s+months?|q[1-4])\b/i.test(contentUpper);
    if (isQuarterly) {
      signals.push({
        type: 'content_heuristic',
        strength: 0.6,
        evidence: 'Contains income statement with quarterly indicators',
        reportType: 'quarterly',
      });
    }
  }

  return signals;
}

/**
 * Classifies filing by exhibit detection
 * 6-K filings often contain earnings releases in EX-99.1, EX-99.2
 * Only quarterly earnings 6-Ks should have these exhibits
 */
function classifyByExhibits(content: string): Array<ClassificationSignal & { reportType?: ReportType }> {
  const signals: Array<ClassificationSignal & { reportType?: ReportType }> = [];
  
  // Look for exhibit references - EX-99.1 is the key indicator for quarterly earnings
  const exhibitPatterns = [
    { pattern: /\bEX-99\.1\b/i, strength: 0.8, evidence: 'Contains EX-99.1 (earnings release exhibit)' },
    { pattern: /\bEX-99\.2\b/i, strength: 0.5, evidence: 'Contains EX-99.2 (earnings release exhibit)' },
    { pattern: /\bEXHIBIT\s+99\.1\b/i, strength: 0.8, evidence: 'Contains Exhibit 99.1' },
    { pattern: /\bEXHIBIT\s+99\.2\b/i, strength: 0.5, evidence: 'Contains Exhibit 99.2' },
  ];

  for (const pattern of exhibitPatterns) {
    if (pattern.pattern.test(content)) {
      signals.push({
        type: 'exhibit_detection',
        strength: pattern.strength,
        evidence: pattern.evidence,
        reportType: 'quarterly', // Exhibits 99.1/99.2 are typically quarterly earnings
      });
    }
  }

  return signals;
}

/**
 * Classifies filing by date patterns
 * Extracts period end dates to determine reporting period
 */
function classifyByDatePatterns(
  content: string,
  metadata?: {
    filingDate?: string;
    reportDate?: string;
    periodEndDate?: string;
  }
): Array<ClassificationSignal & { reportType?: ReportType }> {
  const signals: Array<ClassificationSignal & { reportType?: ReportType }> = [];

  // Use metadata period end date if available
  if (metadata?.periodEndDate || metadata?.reportDate) {
    const periodDate = metadata.periodEndDate || metadata.reportDate;
    if (periodDate) {
      // Determine if quarterly or annual based on date patterns
      // This is a heuristic - quarters typically end on 3/31, 6/30, 9/30, 12/31
      const date = new Date(periodDate);
      const month = date.getMonth(); // 0-11 (Jan=0, Dec=11)
      const day = date.getDate();

      // Quarter end dates (last day of quarter)
      const isQuarterEnd = (month === 2 && day >= 28) || // March (Q1)
                           (month === 5 && day === 30) || // June (Q2)
                           (month === 8 && day === 30) || // September (Q3)
                           (month === 11 && day === 31); // December (Q4)

      if (isQuarterEnd) {
        // Could be either quarterly or annual (Dec 31 is both Q4 and year-end)
        signals.push({
          type: 'date_pattern',
          strength: 0.5, // Moderate - not definitive
          evidence: `Period end date ${periodDate} matches quarter-end pattern`,
          reportType: 'quarterly', // Leans quarterly
        });
      }
    }
  }

  // Extract dates from content
  const datePattern = /\b(period\s+ended?|ended|for\s+the\s+(quarter|period))\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}/i;
  const dateMatch = content.match(datePattern);
  
  if (dateMatch) {
    signals.push({
      type: 'date_pattern',
      strength: 0.4,
      evidence: `Found period end date in content: ${dateMatch[0]}`,
    });
  }

  return signals;
}

/**
 * Extracts period information (fiscal year, quarter, period end date)
 */
function extractPeriodInfo(
  content: string,
  metadata?: {
    filingDate?: string;
    reportDate?: string;
    periodEndDate?: string;
  }
): {
  periodEndDate?: string;
  fiscalYear?: number;
  fiscalQuarter?: number;
} {
  let periodEndDate: string | undefined = metadata?.periodEndDate || metadata?.reportDate;
  let fiscalYear: number | undefined;
  let fiscalQuarter: number | undefined;

  // Try to extract from content if not in metadata
  if (!periodEndDate) {
    // Look for "period ended" patterns
    const periodMatch = content.match(/period\s+ended?\s+(\w+\s+\d{1,2},?\s+\d{4})/i);
    if (periodMatch) {
      // Parse date string (e.g., "March 31, 2024")
      // This is simplified - in production you'd use a proper date parser
      periodEndDate = periodMatch[1];
    }
  }

  // Extract fiscal year from period end date
  if (periodEndDate) {
    const yearMatch = periodEndDate.match(/\d{4}/);
    if (yearMatch) {
      fiscalYear = parseInt(yearMatch[0], 10);
    }

    // Determine fiscal quarter from month
    const date = new Date(periodEndDate);
    if (!isNaN(date.getTime())) {
      const month = date.getMonth(); // 0-11
      // Q1: Jan-Mar (0-2), Q2: Apr-Jun (3-5), Q3: Jul-Sep (6-8), Q4: Oct-Dec (9-11)
      fiscalQuarter = Math.floor(month / 3) + 1;
    }
  }

  return {
    periodEndDate,
    fiscalYear,
    fiscalQuarter,
  };
}

/**
 * Determines if a filing should be ingested based on classification
 * Only ingests filings classified as annual or quarterly with sufficient confidence
 * Uses lower threshold for 6-K filings since they're harder to classify
 */
export function shouldIngestFiling(
  classification: FilingClassification,
  originalFormType?: string
): boolean {
  // Determine the threshold based on form type
  const normalizedForm = originalFormType?.toUpperCase().trim() || '';
  const is6K = normalizedForm === '6-K';
  const threshold = is6K 
    ? CLASSIFICATION_CONFIG.minConfidenceThreshold6K 
    : CLASSIFICATION_CONFIG.minConfidenceThreshold;

  return (
    (classification.reportType === 'annual' || classification.reportType === 'quarterly') &&
    classification.confidenceScore >= threshold
  );
}

/**
 * Maps SEC form type to our FilingType enum
 */
export function mapFormTypeToFilingType(formType: string): '10-K' | '10-Q' | '20-F' | '6-K' | '8-K' | 'OTHER' {
  const normalized = formType.toUpperCase().trim();
  
  switch (normalized) {
    case '10-K':
    case '10-K/A':
      return '10-K';
    case '10-Q':
    case '10-Q/A':
      return '10-Q';
    case '20-F':
    case '20-F/A':
      return '20-F';
    case '6-K':
      return '6-K';
    case '8-K':
    case '8-K/A':
      return '8-K';
    default:
      return 'OTHER';
  }
}

/**
 * Maps classification report type to period_type enum
 */
export function mapReportTypeToPeriodType(reportType: ReportType): 'annual' | 'quarterly' | 'ttm' | 'ytd' {
  switch (reportType) {
    case 'annual':
      return 'annual';
    case 'quarterly':
      return 'quarterly';
    default:
      return 'annual'; // Default fallback
  }
}
