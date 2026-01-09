// Financial Metrics Orchestrator
// Extracts and stores XBRL financial metrics from SEC filings

import { createServerClient } from '../supabase/client';
import { getMetricForFiling } from './xbrl-fetcher';
import { createFinancialMetrics, enforceHistoryPolicy } from './metrics-db';
import type { MetricType, PeriodType } from '../types/database';
import type { ExtractedMetric } from './xbrl-fetcher';

/**
 * Progress callback for metrics extraction
 */
export type MetricsProgressCallback = (step: string, details?: any) => void;

/**
 * Result of metrics extraction
 */
export interface MetricsExtractionResult {
  success: boolean;
  filingId?: string;
  companyId?: string;
  metricsExtracted?: number;
  errors?: string[];
  details?: {
    companyName?: string;
    filingType?: string;
    metrics?: Array<{
      metricType: string;
      value: number;
      unit: string;
      success: boolean;
      error?: string;
    }>;
  };
}

/**
 * Metrics to extract (v1)
 * Note: free_cash_flow will be calculated from operating_cash_flow - capital_expenditures
 */
const METRICS_TO_EXTRACT: MetricType[] = [
  'revenue',
  'net_income',
  'operating_income',
  'eps_basic',
  'eps_diluted',
  'operating_cash_flow',
  'free_cash_flow', // Will be calculated
];

/**
 * Metrics that require exact period matching (no fallback)
 */
const METRICS_REQUIRE_EXACT_PERIOD: MetricType[] = [
  'revenue', // Must match filing's fiscal year exactly
];

/**
 * Extracts financial metrics from XBRL for a filing
 */
export async function extractMetricsForFiling(
  filingId: string,
  options: {
    enforceHistory?: boolean;
    onProgress?: MetricsProgressCallback;
  } = {}
): Promise<MetricsExtractionResult> {
  const { enforceHistory = true, onProgress } = options;
  const supabase = createServerClient();

  try {
    // Step 1: Fetch filing with company info
    onProgress?.('Fetching filing and company information');
    
    const { data: filing, error: filingError } = await supabase
      .from('filings')
      .select(`
        *,
        company:companies(*)
      `)
      .eq('id', filingId)
      .single();

    if (filingError || !filing) {
      return {
        success: false,
        errors: [`Failed to fetch filing: ${filingError?.message || 'Not found'}`],
      };
    }

    const company = (filing as any).company;

    // Only process 10-K and 10-Q filings
    if (filing.filing_type !== '10-K' && filing.filing_type !== '10-Q') {
      return {
        success: false,
        errors: [`Filing type ${filing.filing_type} not supported for metrics extraction`],
      };
    }

    onProgress?.('Filing loaded', {
      companyName: company.name,
      filingType: filing.filing_type,
      accessionNumber: filing.accession_number,
    });

    // Step 2: Extract metrics from XBRL
    onProgress?.('Extracting metrics from SEC XBRL data');
    
    const extractedMetrics: Array<{
      metricType: MetricType;
      value: number;
      unit: string;
      periodType: PeriodType;
      periodEndDate: string;
      success: boolean;
      error?: string;
    }> = [];

    const periodEndDate = filing.period_end_date || filing.filing_date;
    
    // Extract base metrics (excluding free_cash_flow which will be calculated)
    const baseMetrics = METRICS_TO_EXTRACT.filter(m => m !== 'free_cash_flow');
    
    for (const metricType of baseMetrics) {
      onProgress?.(`Extracting ${metricType}`, { metricType });
      
      try {
        // Revenue requires exact period match, others can fallback
        const requireExactPeriod = METRICS_REQUIRE_EXACT_PERIOD.includes(metricType);
        
        const metric = await getMetricForFiling(
          company.cik,
          metricType,
          periodEndDate,
          filing.filing_type as '10-K' | '10-Q',
          filing.accession_number,
          requireExactPeriod
        );

        if (metric) {
          // Validate revenue period alignment with filing
          if (metricType === 'revenue') {
            if (metric.periodEnd !== periodEndDate) {
              extractedMetrics.push({
                metricType,
                value: 0,
                unit: '',
                periodType: filing.filing_type === '10-K' ? 'annual' : 'quarterly',
                periodEndDate: periodEndDate,
                success: false,
                error: `Revenue period (${metric.periodEnd}) does not match filing period (${periodEndDate})`,
              });
              continue;
            }
          }
          
          extractedMetrics.push({
            metricType,
            value: metric.value,
            unit: metric.unit,
            periodType: metric.periodType,
            periodEndDate: metric.periodEnd,
            success: true,
          });
          onProgress?.(`Extracted ${metricType}`, {
            value: metric.value,
            unit: metric.unit,
            periodEnd: metric.periodEnd,
          });
        } else {
          extractedMetrics.push({
            metricType,
            value: 0,
            unit: '',
            periodType: filing.filing_type === '10-K' ? 'annual' : 'quarterly',
            periodEndDate: periodEndDate,
            success: false,
            error: 'Metric not found in XBRL data',
          });
        }
      } catch (error) {
        extractedMetrics.push({
          metricType,
          value: 0,
          unit: '',
          periodType: filing.filing_type === '10-K' ? 'annual' : 'quarterly',
          periodEndDate: periodEndDate,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Calculate Free Cash Flow: operating_cash_flow - capital_expenditures
    onProgress?.('Calculating free_cash_flow', { metricType: 'free_cash_flow' });
    
    const operatingCashFlow = extractedMetrics.find(m => m.metricType === 'operating_cash_flow' && m.success);
    const capitalExpendituresMetric = await getMetricForFiling(
      company.cik,
      'capital_expenditures',
      periodEndDate,
      filing.filing_type as '10-K' | '10-Q',
      filing.accession_number,
      true // Require exact period for CapEx
    );

    let freeCashFlowMetadata: Record<string, unknown> | undefined;
    
    if (operatingCashFlow && capitalExpendituresMetric) {
      const freeCashFlow = operatingCashFlow.value - capitalExpendituresMetric.value;
      
      freeCashFlowMetadata = {
        calculation_method: 'derived',
        formula: 'operating_cash_flow - capital_expenditures',
        sources: {
          operating_cash_flow: operatingCashFlow.value,
          capital_expenditures: capitalExpendituresMetric.value,
        },
      };
      
      extractedMetrics.push({
        metricType: 'free_cash_flow',
        value: freeCashFlow,
        unit: operatingCashFlow.unit, // Should be USD
        periodType: operatingCashFlow.periodType,
        periodEndDate: operatingCashFlow.periodEndDate,
        success: true,
      });
      
      onProgress?.('Calculated free_cash_flow', {
        value: freeCashFlow,
        unit: operatingCashFlow.unit,
        periodEnd: operatingCashFlow.periodEndDate,
        calculation: `${operatingCashFlow.value} - ${capitalExpendituresMetric.value}`,
      });
    } else {
      // Try to find pre-calculated FCF in XBRL
      const preCalculatedFCF = await getMetricForFiling(
        company.cik,
        'free_cash_flow',
        periodEndDate,
        filing.filing_type as '10-K' | '10-Q',
        filing.accession_number,
        true
      );
      
      if (preCalculatedFCF) {
        freeCashFlowMetadata = {
          calculation_method: 'extracted',
          source: 'XBRL',
        };
        
        extractedMetrics.push({
          metricType: 'free_cash_flow',
          value: preCalculatedFCF.value,
          unit: preCalculatedFCF.unit,
          periodType: preCalculatedFCF.periodType,
          periodEndDate: preCalculatedFCF.periodEnd,
          success: true,
        });
        onProgress?.('Extracted free_cash_flow from XBRL', {
          value: preCalculatedFCF.value,
          unit: preCalculatedFCF.unit,
          periodEnd: preCalculatedFCF.periodEnd,
        });
      } else {
        extractedMetrics.push({
          metricType: 'free_cash_flow',
          value: 0,
          unit: '',
          periodType: filing.filing_type === '10-K' ? 'annual' : 'quarterly',
          periodEndDate: periodEndDate,
          success: false,
          error: operatingCashFlow 
            ? 'Capital expenditures not found' 
            : 'Operating cash flow not found',
        });
      }
    }

    // Step 3: Store successful metrics
    const successfulMetrics = extractedMetrics.filter(m => m.success);
    
    if (successfulMetrics.length === 0) {
      return {
        success: false,
        errors: ['No metrics could be extracted from XBRL data'],
        filingId: filing.id,
        companyId: company.id,
      };
    }

    onProgress?.('Storing metrics in database', {
      count: successfulMetrics.length,
    });

    const metricsToStore = successfulMetrics.map(m => {
      const base = {
        filingId: filing.id,
        companyId: company.id,
        metricType: m.metricType,
        value: m.value,
        unit: m.unit,
        periodType: m.periodType,
        periodEndDate: m.periodEndDate,
      };
      
      // Add metadata for free_cash_flow if it was calculated
      if (m.metricType === 'free_cash_flow' && freeCashFlowMetadata) {
        return {
          ...base,
          metadata: freeCashFlowMetadata,
        };
      }
      
      return base;
    });

    const storeResult = await createFinancialMetrics(metricsToStore);

    if (!storeResult.success) {
      return {
        success: false,
        errors: [`Failed to store metrics: ${storeResult.error}`],
        filingId: filing.id,
        companyId: company.id,
      };
    }

    onProgress?.('Metrics stored successfully');

    // Step 4: Enforce history policy
    if (enforceHistory) {
      onProgress?.('Enforcing history policy');
      await enforceHistoryPolicy(company.id, filing.filing_type as '10-K' | '10-Q');
    }

    return {
      success: true,
      filingId: filing.id,
      companyId: company.id,
      metricsExtracted: successfulMetrics.length,
      details: {
        companyName: company.name,
        filingType: filing.filing_type,
        metrics: extractedMetrics.map(m => ({
          metricType: m.metricType,
          value: m.value,
          unit: m.unit,
          success: m.success,
          error: m.error,
        })),
      },
    };
  } catch (error) {
    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Unknown error occurred'],
    };
  }
}
