import { createServerClient } from '@/lib/supabase/client';
import { getCached } from '@/lib/cache/market-data-cache';
import { HEALTH_CATEGORIES, healthCategoryLabel } from '@/lib/finance/health-score';

/**
 * The parts of the stock page that search engines could not see, read for the
 * server-rendered glance: what the company does, and its Health Score.
 *
 * The cards that show these render in the browser and get their data from
 * /api/stock/..., which robots.txt disallows, so even Google's renderer got
 * nothing from them (docs/research/ssr-seo-2026-11-26.md). Cache and database
 * reads only, never TwelveData: a crawl costs no credits. A miss leaves the
 * section out.
 */
export interface GlanceHealth {
  score: number;
  grade: string | null;
  pillars: Array<{ label: string; score: number; max: number }>;
}

export interface GlanceExtras {
  description: string | null;
  health: GlanceHealth | null;
}

type HealthRow = { health_score: number | null; health_score_grade: string | null } & Partial<Record<(typeof HEALTH_CATEGORIES)[number]['column'], number | null>>;

export async function getGlanceExtras(ticker: string, locale: string): Promise<GlanceExtras> {
  const supabase = createServerClient();
  const [healthRow, description] = await Promise.all([
    supabase
      .from('screener_stats')
      .select(`health_score, health_score_grade, ${HEALTH_CATEGORIES.map((c) => c.column).join(', ')}`)
      .eq('ticker', ticker)
      .maybeSingle<HealthRow>()
      .then(({ data }) => data, () => null),
    // The profile text is English. Other languages get the translated copy in
    // the Profile card above; translating here would put an AI call in front of
    // the first byte.
    locale === 'en' ? readDescription(ticker) : Promise.resolve(null),
  ]);

  const health: GlanceHealth | null =
    healthRow?.health_score != null
      ? {
          score: healthRow.health_score,
          grade: healthRow.health_score_grade,
          pillars: HEALTH_CATEGORIES.flatMap((c) => {
            const score = healthRow[c.column];
            return score == null ? [] : [{ label: healthCategoryLabel(c.name), score, max: c.max }];
          }),
        }
      : null;

  return { description, health };
}

/** The TwelveData /profile text the Profile card shows (7-day cache), else the copy kept in company_descriptions. */
async function readDescription(ticker: string): Promise<string | null> {
  const usable = (s: string | null | undefined) => (s && s.trim().length >= 40 ? s.trim() : null);
  const cached = await getCached<{ profile?: { description?: string | null } }>(`profile:${ticker}`);
  const fromProfile = usable(cached?.profile?.description);
  if (fromProfile) return fromProfile;
  const { data } = await createServerClient()
    .from('company_descriptions')
    .select('description')
    .eq('ticker', ticker)
    .maybeSingle<{ description: string | null }>();
  return usable(data?.description);
}
