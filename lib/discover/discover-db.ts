// Discover Page Database Queries
// Read-only queries for the Discover/Home page

import { createServerClient } from '../supabase/client';
import { getLogoManifest, logoUrlFromManifest, type LogoManifest } from '../logos/logo-manifest';
import type { Trend, Signal, Company } from '../types/database';

function enrichCompanyLogo<T extends { ticker: string; logo_url?: string | null }>(company: T, manifest: LogoManifest): T {
  return { ...company, logo_url: company.logo_url || logoUrlFromManifest(manifest, company.ticker) };
}

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
    // Fired now, awaited just before first use — resolves concurrently with
    // the trends/signals queries below instead of adding its own latency.
    const logoManifestPromise = getLogoManifest();

    // Add timeout wrapper for queries
    const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
      return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`Query timeout after ${ms}ms`)), ms)
        ),
      ]);
    };

    // Get recent trends with company info (10 second timeout)
    const { data: trendsData, error: trendsError } = await withTimeout(
      supabase
        .from('trends')
        .select(`
          *,
          company:companies(id, name, ticker, logo_url)
        `)
        .order('strength', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit),
      10000 // 10 second timeout
    );

    if (trendsError) {
      return { success: false, error: 'Database unavailable' };
    }

    // Get recent active signals with company info (10 second timeout)
    const { data: signalsData, error: signalsError } = await withTimeout(
      supabase
        .from('signals')
        .select(`
          *,
          company:companies(id, name, ticker, logo_url)
        `)
        .eq('is_active', true)
        .order('strength', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit),
      10000 // 10 second timeout
    );

    if (signalsError) {
      return { success: false, error: 'Database unavailable' };
    }

    // Cast to proper types
    const trends = (trendsData || []) as Array<Trend & { company?: Company }>;
    const signals = (signalsData || []) as Array<Signal & { company?: Company }>;
    const logoManifest = await logoManifestPromise;

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
        company: enrichCompanyLogo(company, logoManifest),
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
        // Was pushed unenriched — trends got a logo fallback above, signals
        // never did, for no evident reason. Matching them now that this
        // function is already being touched for the extension-guessing fix.
        company: enrichCompanyLogo(company, logoManifest),
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
    // Fired now, awaited just before first use.
    const logoManifestPromise = getLogoManifest();

    // Add timeout wrapper for queries
    const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
      return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`Query timeout after ${ms}ms`)), ms)
        ),
      ]);
    };

    // Get all companies (with timeout)
    const { data: companies, error: companiesError } = await withTimeout(
      supabase
        .from('companies')
        .select('id, ticker, name, logo_url')
        .limit(100), // Reasonable limit for initial query
      10000 // 10 second timeout
    );

    if (companiesError) {
      return { success: false, error: 'Database unavailable' };
    }

    if (!companies || companies.length === 0) {
      return { success: true, data: [] };
    }

    const companiesList = (companies || []) as Company[];
    const companyIds = companiesList.map((c) => c.id);

    const { data: trendsData } = await withTimeout(
      supabase
        .from('trends')
        .select('company_id, trend_type, strength, direction')
        .in('company_id', companyIds)
        .order('strength', { ascending: false })
        .limit(200),
      10000
    );

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

    // Combine and rank companies (enrich logo from storage when DB has none)
    const logoManifest = await logoManifestPromise;
    const ranked = companiesList.map((company) => {
      const enriched = enrichCompanyLogo(company, logoManifest);
      const trend = trendMap.get(company.id) || null;

      const supportingLabel: string | null = trend
        ? trend.type.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
        : null;

      return {
        company: enriched,
        compositeScore: null as number | null,
        compositeDirection: null as 'bullish' | 'bearish' | 'neutral' | null,
        strongestTrend: trend,
        supportingLabel,
      };
    });

    // Sort by trend strength
    ranked.sort((a, b) => {
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
