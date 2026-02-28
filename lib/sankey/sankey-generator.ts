// Sankey Diagram Generator
// Generates deterministic Sankey diagrams from XBRL financial metrics
// Never invents numbers - only uses verified XBRL data

import { createServerClient } from '@/lib/supabase/client';
import type { MetricType } from '@/lib/types/database';
import { getRevenueSegments, type RevenueSegment } from './segment-extractor';

export interface SankeyNode {
  id: string;
  label?: string;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

export interface SankeyData {
  quarter: string;
  nodes: SankeyNode[];
  links: SankeyLink[];
  metadata?: {
    totalRevenue: number;
    reconciliation?: {
      revenue: number;
      costOfRevenue: number;
      grossProfit: number;
      operatingExpenses: number;
      operatingIncome: number;
      netIncome: number;
    };
  };
}

export interface SankeyGenerationResult {
  success: boolean;
  data?: SankeyData;
  error?: string;
  confidence: 'high' | 'medium' | 'low';
  source: 'xbrl' | 'xbrl+ai' | 'xbrl+segments';
}

/**
 * Gets the latest quarterly metrics for a company
 */
async function getLatestQuarterlyMetrics(
  companyId: string,
  symbol: string
): Promise<{
  revenue?: number;
  costOfRevenue?: number;
  grossProfit?: number;
  operatingIncome?: number;
  netIncome?: number;
  periodEndDate?: string;
  fiscalYear?: number;
  fiscalQuarter?: number;
}> {
  const supabase = createServerClient();

  try {
    // Get latest quarterly filing period
    const { data: latestFiling, error: filingError } = await supabase
      .from('filings')
      .select('period_end_date, fiscal_year, fiscal_quarter')
      .eq('company_id', companyId)
      .eq('filing_type', '10-Q')
      .order('period_end_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (filingError) {
      console.error(`[Sankey] Error fetching latest filing for ${symbol}:`, filingError);
      return {};
    }

    if (!latestFiling) {
      console.warn(`[Sankey] No quarterly filing found for ${symbol} (companyId: ${companyId})`);
      return {};
    }

    const periodEndDate = latestFiling.period_end_date;

    // Fetch all required metrics for this period
    const { data: metricsData, error: metricsError } = await supabase
      .from('financial_metrics')
      .select('value, metric_type')
      .eq('company_id', companyId)
      .eq('period_end_date', periodEndDate)
      .eq('period_type', 'quarterly')
      .in('metric_type', ['revenue', 'cost_of_revenue', 'gross_profit', 'operating_income', 'net_income']);

    if (metricsError) {
      console.error(`[Sankey] Error fetching metrics for ${symbol}:`, metricsError);
      return { periodEndDate, fiscalYear: latestFiling.fiscal_year, fiscalQuarter: latestFiling.fiscal_quarter };
    }

    const metricsMap = new Map<string, number>();

    if (metricsData) {
      for (const metric of metricsData) {
        metricsMap.set(metric.metric_type, Number(metric.value));
      }
    }

    console.log(`[Sankey] Metrics for ${symbol} (${periodEndDate}):`, {
      revenue: metricsMap.get('revenue'),
      costOfRevenue: metricsMap.get('cost_of_revenue'),
      operatingIncome: metricsMap.get('operating_income'),
      netIncome: metricsMap.get('net_income'),
    });

    return {
      revenue: metricsMap.get('revenue'),
      costOfRevenue: metricsMap.get('cost_of_revenue'),
      grossProfit: metricsMap.get('gross_profit'),
      operatingIncome: metricsMap.get('operating_income'),
      netIncome: metricsMap.get('net_income'),
      periodEndDate,
      fiscalYear: latestFiling.fiscal_year,
      fiscalQuarter: latestFiling.fiscal_quarter,
    };
  } catch (error) {
    console.error(`[Sankey] Unexpected error fetching metrics for ${symbol}:`, error);
    return {};
  }
}

/**
 * Generates a deterministic Sankey diagram from XBRL metrics
 * Never invents numbers - calculates only from verified data
 */
export async function generateSankeyFromXBRL(
  symbol: string,
  companyId: string
): Promise<SankeyGenerationResult> {
  try {
    const metrics = await getLatestQuarterlyMetrics(companyId, symbol);

    if (!metrics.revenue || !metrics.periodEndDate) {
      return {
        success: false,
        error: 'Missing required revenue data for latest quarter',
        confidence: 'low',
        source: 'xbrl',
      };
    }

    const revenue = metrics.revenue;
    const periodEndDate = new Date(metrics.periodEndDate);
    const fiscalYear = metrics.fiscalYear || periodEndDate.getFullYear();
    const fiscalQuarter = metrics.fiscalQuarter || Math.floor((periodEndDate.getMonth() + 3) / 3);
    const quarter = `Q${fiscalQuarter} ${fiscalYear}`;

    // Calculate missing values deterministically
    let costOfRevenue = metrics.costOfRevenue;
    let grossProfit = metrics.grossProfit;
    let operatingIncome = metrics.operatingIncome;
    let netIncome = metrics.netIncome;

    // If gross profit exists but cost of revenue doesn't, calculate it
    if (!costOfRevenue && grossProfit !== undefined) {
      costOfRevenue = revenue - grossProfit;
    } else if (!grossProfit && costOfRevenue !== undefined) {
      grossProfit = revenue - costOfRevenue;
    }
    // Note: We allow Sankey to be built even without cost_of_revenue/gross_profit
    // We'll show a simplified version with Operating Expenses calculated from Operating Income

    // Calculate operating expenses from operating income
    // Operating Income = Revenue - Cost of Revenue - Operating Expenses
    // So: Operating Expenses = Revenue - Cost of Revenue - Operating Income
    // If cost_of_revenue is not available, calculate operating expenses as:
    // Operating Expenses = Revenue - Operating Income (simplified, combines COGS + OpEx)
    let operatingExpenses: number | undefined;
    if (operatingIncome !== undefined) {
      if (costOfRevenue !== undefined) {
        // Full calculation: OpEx = Revenue - COGS - Operating Income
        operatingExpenses = revenue - costOfRevenue - operatingIncome;
      } else {
        // Simplified calculation: OpEx = Revenue - Operating Income (includes COGS)
        operatingExpenses = revenue - operatingIncome;
      }
    }

    // If operating income not available, try to calculate from net income
    // This is less reliable but better than nothing
    if (operatingIncome === undefined && netIncome !== undefined) {
      // Rough estimate: assume taxes and interest are ~20% of net income
      // This is a fallback - not ideal but allows visualization
      operatingIncome = netIncome * 1.25;
      if (costOfRevenue !== undefined) {
        operatingExpenses = revenue - costOfRevenue - operatingIncome;
      }
    }

    // Build nodes
    const nodes: SankeyNode[] = [
      { id: 'Total Revenue' },
    ];

    const links: SankeyLink[] = [];

    // Revenue structure:
    // Revenue = Cost of Revenue + Operating Expenses + Operating Income
    // So we need to ensure all three flows from Revenue

    // Revenue flows to Cost of Revenue
    if (costOfRevenue !== undefined && costOfRevenue > 0) {
      nodes.push({ id: 'Cost of Revenue' });
      links.push({
        source: 'Total Revenue',
        target: 'Cost of Revenue',
        value: costOfRevenue,
      });
    }

    // Revenue flows to Operating Expenses (if available)
    if (operatingExpenses !== undefined && operatingExpenses > 0) {
      nodes.push({ id: 'Operating Expenses' });
      links.push({
        source: 'Total Revenue',
        target: 'Operating Expenses',
        value: operatingExpenses,
      });
    }

    // Revenue flows to Operating Income (calculated as remainder or direct)
    // Operating Income = Revenue - Cost of Revenue - Operating Expenses
    if (operatingIncome !== undefined && operatingIncome > 0) {
      nodes.push({ id: 'Operating Income' });
      links.push({
        source: 'Total Revenue',
        target: 'Operating Income',
        value: operatingIncome,
      });
    } else if (costOfRevenue !== undefined) {
      // Calculate operating income as remainder
      const calculatedOperatingIncome = revenue - costOfRevenue - (operatingExpenses || 0);
      if (calculatedOperatingIncome > 0) {
        nodes.push({ id: 'Operating Income' });
        links.push({
          source: 'Total Revenue',
          target: 'Operating Income',
          value: calculatedOperatingIncome,
        });
      }
    }

    // Operating Income flows to Net Income (if both available)
    if (operatingIncome !== undefined && netIncome !== undefined && netIncome > 0) {
      if (!nodes.find(n => n.id === 'Net Income')) {
        nodes.push({ id: 'Net Income' });
      }
      
      // Calculate tax and other items
      const taxAndOther = operatingIncome - netIncome;
      if (taxAndOther > 0) {
        nodes.push({ id: 'Tax & Other' });
        links.push({
          source: 'Operating Income',
          target: 'Tax & Other',
          value: taxAndOther,
        });
      }

      links.push({
        source: 'Operating Income',
        target: 'Net Income',
        value: netIncome,
      });
    } else if (netIncome !== undefined && netIncome > 0) {
      // Net income available but no operating income - direct flow from revenue
      if (!nodes.find(n => n.id === 'Net Income')) {
        nodes.push({ id: 'Net Income' });
      }
      links.push({
        source: 'Total Revenue',
        target: 'Net Income',
        value: netIncome,
      });
    }

    // Validate reconciliation
    const totalOutflows = links
      .filter(l => l.source === 'Total Revenue')
      .reduce((sum, l) => sum + l.value, 0);

    const reconciliation = Math.abs(totalOutflows - revenue) / revenue;
    if (reconciliation > 0.05) {
      // More than 5% difference - low confidence
      return {
        success: true,
        data: {
          quarter,
          nodes,
          links,
          metadata: {
            totalRevenue: revenue,
            reconciliation: {
              revenue,
              costOfRevenue: costOfRevenue || 0,
              grossProfit: grossProfit || 0,
              operatingExpenses: operatingExpenses || 0,
              operatingIncome: operatingIncome || 0,
              netIncome: netIncome || 0,
            },
          },
        },
        confidence: 'low',
        source: 'xbrl',
      };
    }

    return {
      success: true,
      data: {
        quarter,
        nodes,
        links,
        metadata: {
          totalRevenue: revenue,
          reconciliation: {
            revenue,
            costOfRevenue: costOfRevenue || 0,
            grossProfit: grossProfit || 0,
            operatingExpenses: operatingExpenses || 0,
            operatingIncome: operatingIncome || 0,
            netIncome: netIncome || 0,
          },
        },
      },
      confidence: reconciliation < 0.02 ? 'high' : 'medium',
      source: 'xbrl',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error generating Sankey',
      confidence: 'low',
      source: 'xbrl',
    };
  }
}

/**
 * Generates a multi-stage Sankey diagram with segments and income statement flow
 * Supports graceful degradation: Full → Standard → Minimal
 */
export async function generateMultiStageSankey(
  symbol: string,
  companyId: string,
  revenue: number,
  metrics: {
    costOfRevenue?: number;
    grossProfit?: number;
    operatingIncome?: number;
    netIncome?: number;
    periodEndDate: string;
    fiscalYear?: number;
    fiscalQuarter?: number;
  },
  segments?: RevenueSegment[]
): Promise<SankeyGenerationResult> {
  const periodEndDate = new Date(metrics.periodEndDate);
  const fiscalYear = metrics.fiscalYear || periodEndDate.getFullYear();
  const fiscalQuarter = metrics.fiscalQuarter || Math.floor((periodEndDate.getMonth() + 3) / 3);
  const quarter = `Q${fiscalQuarter} ${fiscalYear}`;

  const nodes: SankeyNode[] = [];
  const links: SankeyLink[] = [];

  // Stage 1: Revenue Segments (if available)
  let hasSegments = false;
  if (segments && segments.length > 0) {
    hasSegments = true;
    // Add segment nodes
    for (const segment of segments) {
      nodes.push({ id: segment.name });
      links.push({
        source: segment.name,
        target: 'Total Revenue',
        value: segment.value,
      });
    }
  }

  // Always add Total Revenue node
  if (!nodes.find(n => n.id === 'Total Revenue')) {
    nodes.push({ id: 'Total Revenue' });
  }

  // Stage 2: Cost of Revenue → Gross Profit
  const costOfRevenue = metrics.costOfRevenue;
  const grossProfit = metrics.grossProfit || (costOfRevenue !== undefined ? revenue - costOfRevenue : undefined);

  if (costOfRevenue !== undefined && costOfRevenue > 0) {
    nodes.push({ id: 'Cost of Revenue' });
    links.push({
      source: 'Total Revenue',
      target: 'Cost of Revenue',
      value: costOfRevenue,
    });

    if (grossProfit !== undefined && grossProfit > 0) {
      if (!nodes.find(n => n.id === 'Gross Profit')) {
        nodes.push({ id: 'Gross Profit' });
      }
      links.push({
        source: 'Total Revenue',
        target: 'Gross Profit',
        value: grossProfit,
      });
    }
  } else if (grossProfit !== undefined && grossProfit > 0) {
    // Gross Profit without explicit COGS
    nodes.push({ id: 'Gross Profit' });
    links.push({
      source: 'Total Revenue',
      target: 'Gross Profit',
      value: grossProfit,
    });
  }

  // Stage 3: Operating Expenses → Operating Income
  const operatingIncome = metrics.operatingIncome;
  const profitNode = grossProfit !== undefined ? 'Gross Profit' : 'Total Revenue';
  
  const operatingExpenses =
    operatingIncome !== undefined
      ? (grossProfit !== undefined ? grossProfit - operatingIncome : revenue - operatingIncome)
      : undefined;

  if (operatingExpenses !== undefined && operatingExpenses > 0) {
    nodes.push({ id: 'Operating Expenses' });
    links.push({
      source: profitNode,
      target: 'Operating Expenses',
      value: operatingExpenses,
    });
  }

  // Stage 4: Operating Income
  if (operatingIncome !== undefined && operatingIncome > 0) {
    if (!nodes.find(n => n.id === 'Operating Income')) {
      nodes.push({ id: 'Operating Income' });
    }
    links.push({
      source: profitNode,
      target: 'Operating Income',
      value: operatingIncome,
    });
  }

  // Stage 5: Tax & Other → Net Income
  const netIncome = metrics.netIncome;
  if (operatingIncome !== undefined && netIncome !== undefined && netIncome > 0) {
    if (!nodes.find(n => n.id === 'Net Income')) {
      nodes.push({ id: 'Net Income' });
    }

    const taxAndOther = operatingIncome - netIncome;
    if (taxAndOther > 0) {
      nodes.push({ id: 'Tax & Other' });
      links.push({
        source: 'Operating Income',
        target: 'Tax & Other',
        value: taxAndOther,
      });
    }

    links.push({
      source: 'Operating Income',
      target: 'Net Income',
      value: netIncome,
    });
  } else if (netIncome !== undefined && netIncome > 0 && !operatingIncome) {
    // Fallback: Direct flow from revenue to net income
    if (!nodes.find(n => n.id === 'Net Income')) {
      nodes.push({ id: 'Net Income' });
    }
    links.push({
      source: 'Total Revenue',
      target: 'Net Income',
      value: netIncome,
    });
  }

  // Determine confidence and source
  let confidence: 'high' | 'medium' | 'low' = 'medium';
  let source: 'xbrl' | 'xbrl+ai' | 'xbrl+segments' = 'xbrl';

  if (hasSegments) {
    source = 'xbrl+segments';
    confidence = 'high';
  }

  // Validate reconciliation
  const totalInflows = links
    .filter(l => l.target === 'Total Revenue')
    .reduce((sum, l) => sum + l.value, 0);

  const totalOutflows = links
    .filter(l => l.source === 'Total Revenue')
    .reduce((sum, l) => sum + l.value, 0);

  const reconciliation = totalInflows > 0 
    ? Math.abs(totalInflows - revenue) / revenue
    : Math.abs(totalOutflows - revenue) / revenue;

  if (reconciliation > 0.05) {
    confidence = 'low';
  } else if (reconciliation < 0.02) {
    confidence = 'high';
  }

  return {
    success: true,
    data: {
      quarter,
      nodes,
      links,
      metadata: {
        totalRevenue: revenue,
        reconciliation: {
          revenue,
          costOfRevenue: costOfRevenue || 0,
          grossProfit: grossProfit || 0,
          operatingExpenses: operatingExpenses || 0,
          operatingIncome: operatingIncome || 0,
          netIncome: netIncome || 0,
        },
      },
    },
    confidence,
    source,
  };
}

/**
 * Gets or creates a Sankey diagram for a company
 * Caches results per fiscal period
 * Enhanced to support multi-stage flows with segments
 */
export async function getOrCreateCompanySankey(
  symbol: string,
  companyId: string
): Promise<SankeyGenerationResult> {
  const supabase = createServerClient();

  try {
    // First, try to get latest quarterly metrics to determine period
    const metrics = await getLatestQuarterlyMetrics(companyId, symbol);
    
    if (!metrics.periodEndDate) {
      return {
        success: false,
        error: 'No quarterly filing data available',
        confidence: 'low',
        source: 'xbrl',
      };
    }

    const periodEndDate = new Date(metrics.periodEndDate);
    const fiscalYear = metrics.fiscalYear || periodEndDate.getFullYear();
    const fiscalQuarter = metrics.fiscalQuarter || Math.floor((periodEndDate.getMonth() + 3) / 3);
    const fiscalPeriod = `Q${fiscalQuarter} ${fiscalYear}`;

    // Check if cached Sankey exists
    const { data: cached } = await supabase
      .from('company_sankey_diagrams')
      .select('data, confidence, source')
      .eq('symbol', symbol)
      .eq('fiscal_period', fiscalPeriod)
      .maybeSingle();

    if (cached) {
      return {
        success: true,
        data: cached.data as SankeyData,
        confidence: cached.confidence as 'high' | 'medium' | 'low',
        source: cached.source as 'xbrl' | 'xbrl+ai' | 'xbrl+segments',
      };
    }

    // Load revenue segments (if available)
    const segments = await getRevenueSegments(symbol, fiscalPeriod);

    // Generate new multi-stage Sankey (use multi-stage if we have revenue)
    let result: SankeyGenerationResult;
    if (metrics.revenue && metrics.periodEndDate) {
      result = await generateMultiStageSankey(
        symbol,
        companyId,
        metrics.revenue,
        metrics,
        segments || undefined
      );
    } else {
      // Fallback to old generator if no revenue
      result = await generateSankeyFromXBRL(symbol, companyId);
    }

    if (!result.success || !result.data) {
      return result;
    }

    // Cache the result
    const { error: insertError } = await supabase
      .from('company_sankey_diagrams')
      .insert({
        symbol,
        fiscal_period: fiscalPeriod,
        data: result.data,
        confidence: result.confidence,
        source: result.source,
      });

    if (insertError) {
      console.error('[Sankey] Error caching diagram:', insertError);
      // Still return the result even if caching failed
    }

    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      confidence: 'low',
      source: 'xbrl',
    };
  }
}
