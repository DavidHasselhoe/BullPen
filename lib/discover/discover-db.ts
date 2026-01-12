// Discover Page Database Queries
// Read-only queries for the Discover/Home page

import { createServerClient } from '../supabase/client';
import type { Trend, Signal, Filing, Company } from '../types/database';

export interface DiscoverDBResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Gets recent fundamental changes (trends and signals combined)
 * Returns strongest trends and most recent significant signals
 */
export async function getRecentFundamentalChanges(
  limit: number = 6
): Promise<DiscoverDBResult<Array<{
  type: 'trend' | 'signal';
  company: Company;
  trend?: Trend;
  signal?: Signal;
  direction: 'positive' | 'negative' | 'neutral';
  strength: number;
  description: string;
  context: string;
}>>> {
  const supabase = createServerClient();

  try {
    // Get recent trends with company info
    const { data: trendsData, error: trendsError } = await supabase
      .from('trends')
      .select(`
        *,
        company:companies(id, name, ticker, logo_url)
      `)
      .order('strength', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (trendsError) {
      return { success: false, error: trendsError.message };
    }

    // Get recent active signals with company info
    const { data: signalsData, error: signalsError } = await supabase
      .from('signals')
      .select(`
        *,
        company:companies(id, name, ticker, logo_url)
      `)
      .eq('is_active', true)
      .order('strength', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (signalsError) {
      return { success: false, error: signalsError.message };
    }

    // Cast to proper types
    const trends = (trendsData || []) as Array<Trend & { company?: Company }>;
    const signals = (signalsData || []) as Array<Signal & { company?: Company }>;

    // Combine and format results
    const changes: Array<{
      type: 'trend' | 'signal';
      company: Company;
      trend?: Trend;
      signal?: Signal;
      direction: 'positive' | 'negative' | 'neutral';
      strength: number;
      description: string;
      context: string;
    }> = [];

    // Process trends
    for (const trend of trends) {
      const company = trend.company;
      if (!company) continue;

      // Format trend type for description
      const trendTypeLabel = trend.trend_type
        .split('_')
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

      changes.push({
        type: 'trend',
        company,
        trend: {
          id: trend.id,
          company_id: trend.company_id,
          metric_type: trend.metric_type,
          trend_type: trend.trend_type,
          period_type: trend.period_type,
          direction: trend.direction,
          strength: trend.strength,
          explanation: trend.explanation,
          periods_analyzed: trend.periods_analyzed,
          metadata: trend.metadata,
          created_at: trend.created_at,
          updated_at: trend.updated_at,
        },
        direction: trend.direction,
        strength: trend.strength,
        description: trend.explanation,
        context: `${trendTypeLabel} (${trend.metric_type.replace('_', ' ')})`,
      });
    }

    // Process signals
    for (const signal of signals) {
      const company = signal.company;
      if (!company) continue;

      // Convert signal direction to trend direction format
      const direction: 'positive' | 'negative' | 'neutral' =
        signal.direction === 'bullish'
          ? 'positive'
          : signal.direction === 'bearish'
          ? 'negative'
          : 'neutral';

      changes.push({
        type: 'signal',
        company,
        signal: {
          id: signal.id,
          company_id: signal.company_id,
          filing_id: signal.filing_id,
          signal_type: signal.signal_type,
          direction: signal.direction,
          strength: signal.strength,
          title: signal.title,
          description: signal.description,
          evidence: signal.evidence,
          is_active: signal.is_active,
          expires_at: signal.expires_at,
          metadata: signal.metadata,
          created_at: signal.created_at,
          updated_at: signal.updated_at,
        },
        direction,
        strength: signal.strength,
        description: signal.description,
        context: 'Latest filing',
      });
    }

    // Sort by strength (descending) and take top N
    changes.sort((a, b) => b.strength - a.strength);
    const topChanges = changes.slice(0, limit);

    return { success: true, data: topChanges };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Gets recently analyzed filings
 * Returns completed filings with insight counts
 */
export async function getRecentFilings(
  limit: number = 10
): Promise<DiscoverDBResult<Array<{
  filing: Filing;
  company: Company;
  insightsCount: number;
}>>> {
  const supabase = createServerClient();

  try {
    const { data: filings, error: filingsError } = await supabase
      .from('filings')
      .select(`
        *,
        company:companies(id, name, ticker, logo_url)
      `)
      .eq('processing_status', 'completed')
      .in('filing_type', ['10-K', '10-Q'])
      .order('filing_date', { ascending: false })
      .limit(limit);

    if (filingsError) {
      return { success: false, error: filingsError.message };
    }

    if (!filings || filings.length === 0) {
      return { success: true, data: [] };
    }

    // Cast to proper types
    const filingsWithCompany = (filings || []) as Array<Filing & { company?: Company }>;

    // Get insight counts for each filing
    const filingIds = filingsWithCompany.map((f) => f.id);
    const { data: insightsData } = await supabase
      .from('ai_insights')
      .select('filing_id')
      .in('filing_id', filingIds);

    // Count insights per filing
    const insights = (insightsData || []) as Array<{ filing_id: string }>;
    const insightsCountMap = new Map<string, number>();
    insights.forEach((insight) => {
      const count = insightsCountMap.get(insight.filing_id) || 0;
      insightsCountMap.set(insight.filing_id, count + 1);
    });

    const result = filingsWithCompany
      .filter((f) => f.company)
      .map((f) => {
        const company = f.company!;
        return {
          filing: {
            id: f.id,
            company_id: f.company_id,
            accession_number: f.accession_number,
            filing_type: f.filing_type,
            filing_date: f.filing_date,
            period_end_date: f.period_end_date,
            fiscal_year: f.fiscal_year,
            fiscal_quarter: f.fiscal_quarter,
            source_url: f.source_url,
            document_url: f.document_url,
            processing_status: f.processing_status,
            processing_error: f.processing_error,
            metadata: f.metadata,
            created_at: f.created_at,
            updated_at: f.updated_at,
          },
          company,
          insightsCount: insightsCountMap.get(f.id) || 0,
        };
      });

    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Gets companies to watch (ranked by composite score or trend strength)
 */
export async function getCompaniesToWatch(
  limit: number = 10
): Promise<DiscoverDBResult<Array<{
  company: Company;
  compositeScore: number | null;
  compositeDirection: 'bullish' | 'bearish' | 'neutral' | null;
  strongestTrend: {
    type: string;
    strength: number;
    direction: 'positive' | 'negative' | 'neutral';
  } | null;
  supportingLabel: string | null;
}>>> {
  const supabase = createServerClient();

  try {
    // Get all companies
    const { data: companies, error: companiesError } = await supabase
      .from('companies')
      .select('id, ticker, name, logo_url')
      .limit(100); // Reasonable limit for initial query

    if (companiesError) {
      return { success: false, error: companiesError.message };
    }

    if (!companies || companies.length === 0) {
      return { success: true, data: [] };
    }

    const companiesList = (companies || []) as Company[];
    const companyIds = companiesList.map((c) => c.id);

    // Get composite scores from latest filings (stored in filings.metadata)
    const { data: filingsData } = await supabase
      .from('filings')
      .select('id, company_id, filing_date, metadata')
      .eq('processing_status', 'completed')
      .in('company_id', companyIds)
      .order('filing_date', { ascending: false });

    // Extract composite scores from metadata for latest filing per company
    const filings = (filingsData || []) as Array<{ id: string; company_id: string; filing_date: string; metadata: unknown }>;
    const latestFilingIds = new Map<string, string>();
    const scoreMap = new Map<string, { score: number; direction: 'bullish' | 'bearish' | 'neutral' }>();
    
    filings.forEach((filing) => {
      if (!latestFilingIds.has(filing.company_id)) {
        latestFilingIds.set(filing.company_id, filing.id);
        
        // Extract composite score from metadata
        const metadata = filing.metadata as Record<string, unknown> | null;
        if (metadata?.composite_score) {
          const cs = metadata.composite_score as {
            composite_score?: number;
            direction?: 'bullish' | 'bearish' | 'neutral';
          };
          if (cs.composite_score !== undefined) {
            scoreMap.set(filing.id, {
              score: cs.composite_score,
              direction: cs.direction || 'neutral',
            });
          }
        }
      }
    });

    // Get strongest trends per company
    const { data: trendsData } = await supabase
      .from('trends')
      .select('*')
      .in('company_id', companyIds)
      .order('strength', { ascending: false });

    const trends = (trendsData || []) as Trend[];
    const trendMap = new Map<
      string,
      { type: string; strength: number; direction: 'positive' | 'negative' | 'neutral' }
    >();
    trends.forEach((trend) => {
      const existing = trendMap.get(trend.company_id);
      if (!existing || trend.strength > existing.strength) {
        trendMap.set(trend.company_id, {
          type: trend.trend_type,
          strength: trend.strength,
          direction: trend.direction,
        });
      }
    });

    // Combine and rank companies
    const ranked = companiesList.map((company) => {
      const latestFilingId = latestFilingIds.get(company.id);
      const composite = latestFilingId ? scoreMap.get(latestFilingId) : null;
      const trend = trendMap.get(company.id) || null;

      // Generate supporting label
      let supportingLabel: string | null = null;
      if (trend) {
        const trendLabel = trend.type
          .split('_')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
        supportingLabel = trendLabel;
      } else if (composite) {
        supportingLabel = `Composite score: ${composite.score.toFixed(1)}`;
      }

      return {
        company,
        compositeScore: composite?.score || null,
        compositeDirection: composite?.direction || null,
        strongestTrend: trend,
        supportingLabel,
      };
    });

    // Sort by composite score (if available), then by trend strength
    ranked.sort((a, b) => {
      // Prefer companies with composite scores
      if (a.compositeScore !== null && b.compositeScore === null) return -1;
      if (a.compositeScore === null && b.compositeScore !== null) return 1;
      if (a.compositeScore !== null && b.compositeScore !== null) {
        return b.compositeScore - a.compositeScore;
      }

      // Then by trend strength
      const aTrendStrength = a.strongestTrend?.strength || 0;
      const bTrendStrength = b.strongestTrend?.strength || 0;
      return bTrendStrength - aTrendStrength;
    });

    return { success: true, data: ranked.slice(0, limit) };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
