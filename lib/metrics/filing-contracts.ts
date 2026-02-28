// Filing-Type Contracts
// Phase 2: Enforce strict contracts per filing type

import type { PeriodType } from '../types/database';

/**
 * Filing-type contract validation result
 */
export interface FilingContractResult {
  valid: boolean;
  error?: string;
  allowedPeriodTypes: PeriodType[];
}

/**
 * Filing-type contract definition
 */
export interface FilingContract {
  filingType: '10-Q' | '10-K' | '20-F' | '6-K' | '8-K';
  allowedPeriodTypes: PeriodType[];
  requiresFiscalQuarter: boolean;
  requiresFiscalYear: boolean;
  description: string;
}

/**
 * Filing-type contracts (Phase 2)
 */
export const FILING_CONTRACTS: Record<string, FilingContract> = {
  '10-Q': {
    filingType: '10-Q',
    allowedPeriodTypes: ['quarterly'],
    requiresFiscalQuarter: true,
    requiresFiscalYear: true,
    description: '10-Q filings may only produce quarterly metrics',
  },
  '10-K': {
    filingType: '10-K',
    allowedPeriodTypes: ['annual'],
    requiresFiscalQuarter: false,
    requiresFiscalYear: true,
    description: '10-K filings may only produce annual metrics',
  },
  '20-F': {
    filingType: '20-F',
    allowedPeriodTypes: ['annual'],
    requiresFiscalQuarter: false,
    requiresFiscalYear: true,
    description: '20-F filings may only produce annual metrics',
  },
  '6-K': {
    filingType: '6-K',
    allowedPeriodTypes: ['quarterly', 'ytd'], // Conditional: only if explicitly states "Quarter Ended"
    requiresFiscalQuarter: false, // Only if quarterly
    requiresFiscalYear: true,
    description: '6-K filings may produce quarterly metrics only if explicitly states "Quarter Ended", otherwise YTD (non-chartable)',
  },
  '8-K': {
    filingType: '8-K',
    allowedPeriodTypes: ['quarterly'], // Only Item 2.02 (earnings release) may produce quarterly metrics
    requiresFiscalQuarter: true, // Item 2.02 requires fiscal quarter
    requiresFiscalYear: true,
    description: '8-K filings may produce quarterly metrics only from Item 2.02 (earnings release). Other items produce events, not metrics.',
  },
};

/**
 * Validates that a period_type is allowed for a filing type
 */
export function validateFilingContract(
  filingType: '10-Q' | '10-K' | '20-F' | '6-K' | '8-K',
  periodType: PeriodType,
  fiscalQuarter: number | null,
  fiscalYear: number | null
): FilingContractResult {
  const contract = FILING_CONTRACTS[filingType];
  
  if (!contract) {
    return {
      valid: false,
      error: `Unknown filing type: ${filingType}`,
      allowedPeriodTypes: [],
    };
  }

  // Check if period_type is allowed
  if (!contract.allowedPeriodTypes.includes(periodType)) {
    return {
      valid: false,
      error: `${filingType} filing may not produce ${periodType} metrics. Allowed: ${contract.allowedPeriodTypes.join(', ')}`,
      allowedPeriodTypes: contract.allowedPeriodTypes,
    };
  }

  // Check fiscal_year requirement
  if (contract.requiresFiscalYear && fiscalYear === null) {
    return {
      valid: false,
      error: `${filingType} filing requires fiscal_year`,
      allowedPeriodTypes: contract.allowedPeriodTypes,
    };
  }

  // Check fiscal_quarter requirement
  if (contract.requiresFiscalQuarter && fiscalQuarter === null) {
    return {
      valid: false,
      error: `${filingType} filing requires fiscal_quarter for ${periodType} metrics`,
      allowedPeriodTypes: contract.allowedPeriodTypes,
    };
  }

  // 10-Q must have fiscal_quarter for quarterly metrics
  if (filingType === '10-Q' && periodType === 'quarterly' && fiscalQuarter === null) {
    return {
      valid: false,
      error: '10-Q filing requires fiscal_quarter for quarterly metrics',
      allowedPeriodTypes: contract.allowedPeriodTypes,
    };
  }

  // 10-K/20-F must NOT have fiscal_quarter
  if ((filingType === '10-K' || filingType === '20-F') && fiscalQuarter !== null) {
    return {
      valid: false,
      error: `${filingType} filing must NOT have fiscal_quarter for annual metrics`,
      allowedPeriodTypes: contract.allowedPeriodTypes,
    };
  }

  return {
    valid: true,
    allowedPeriodTypes: contract.allowedPeriodTypes,
  };
}

/**
 * Gets allowed period types for a filing type
 */
export function getAllowedPeriodTypes(filingType: '10-Q' | '10-K' | '20-F' | '6-K' | '8-K'): PeriodType[] {
  const contract = FILING_CONTRACTS[filingType];
  return contract?.allowedPeriodTypes || [];
}

/**
 * Validates that an 8-K item can produce metrics
 * Only Item 2.02 (earnings release) may produce metrics
 */
export function validate8KItem(item: string, periodType: PeriodType): { valid: boolean; error?: string } {
  if (item === '2.02') {
    // Item 2.02: Results of Operations and Financial Condition (earnings release)
    if (periodType !== 'quarterly') {
      return {
        valid: false,
        error: 'Item 2.02 may only produce quarterly metrics',
      };
    }
    return { valid: true };
  }

  // Other items (3.02, 8.01, etc.) should not produce metrics
  return {
    valid: false,
    error: `Item ${item} may not produce metrics. Only Item 2.02 (earnings release) may produce metrics.`,
  };
}
