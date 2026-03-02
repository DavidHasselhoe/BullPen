/**
 * Earnings alert emails for users who hold a company that just filed.
 *
 * When the cron ingests a new 10-K / 10-Q / 20-F, we notify holders who opted in.
 */

import { createServerClient } from '@/lib/supabase/client';
import { sendEmail } from './resend';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://bullpen.no';

interface Holder {
  id: string;
  email: string;
}

/**
 * Get users who hold the given ticker and have earnings alerts enabled.
 * Default: enabled (treat absent preference as true).
 */
async function getHoldersForTicker(ticker: string): Promise<Holder[]> {
  const supabase = createServerClient();
  const symbol = ticker.toUpperCase();

  const { data: holders, error: holdersError } = await supabase
    .from('user_holdings')
    .select('user_id')
    .eq('symbol', symbol);

  if (holdersError || !holders?.length) return [];

  const userIds = [...new Set(holders.map((h: { user_id: string }) => h.user_id))];

  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, email, settings')
    .in('id', userIds)
    .not('email', 'is', null);

  if (usersError || !users?.length) return [];

  const result: Holder[] = [];
  for (const u of users as { id: string; email: string; settings?: unknown }[]) {
    const settings = u.settings as { notifications?: { holdings_earnings?: boolean } } | undefined;
    const optedIn = settings?.notifications?.holdings_earnings !== false; // default true
    if (optedIn && u.email) result.push({ id: u.id, email: u.email });
  }
  return result;
}

/**
 * Fetch latest revenue and EPS for a company (for email summary).
 */
async function getLatestMetrics(
  ticker: string,
): Promise<{ revenue?: string; eps?: string }> {
  const supabase = createServerClient();

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('ticker', ticker.toUpperCase())
    .single();

  if (!company) return {};

  const fmtRev = (n: number) => {
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    return `$${n.toLocaleString()}`;
  };

  const [revRes, epsRes] = await Promise.all([
    supabase
      .from('financial_metrics')
      .select('value')
      .eq('company_id', company.id)
      .eq('metric_type', 'revenue')
      .eq('period_type', 'quarterly')
      .order('period_end_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('financial_metrics')
      .select('value')
      .eq('company_id', company.id)
      .eq('metric_type', 'eps_diluted')
      .eq('period_type', 'quarterly')
      .order('period_end_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    revenue: revRes.data?.value != null ? fmtRev(Number(revRes.data.value)) : undefined,
    eps: epsRes.data?.value != null ? `$${Number(epsRes.data.value).toFixed(2)}` : undefined,
  };
}

function buildEmailHtml(
  companyName: string,
  ticker: string,
  formType: string,
  metrics: { revenue?: string; eps?: string },
): string {
  const stockUrl = `${APP_URL}/stock/${ticker}`;
  const metricsHtml =
    metrics.revenue || metrics.eps
      ? `
    <p style="margin: 12px 0; font-size: 14px; color: #64748b;">
      ${metrics.revenue ? `Revenue: ${metrics.revenue}` : ''}
      ${metrics.revenue && metrics.eps ? ' · ' : ''}
      ${metrics.eps ? `EPS: ${metrics.eps}` : ''}
    </p>
  `
      : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; padding: 24px;">
  <div style="max-width: 480px; margin: 0 auto;">
    <h1 style="font-size: 20px; margin: 0 0 8px;">New earnings report</h1>
    <p style="margin: 0; font-size: 16px; color: #94a3b8;">
      <strong>${companyName}</strong> (${ticker}) filed a new ${formType}.
    </p>
    ${metricsHtml}
    <p style="margin: 20px 0 0;">
      <a href="${stockUrl}" style="display: inline-block; background: #22c55e; color: white; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: 600;">
        View in BullPen
      </a>
    </p>
    <p style="margin: 24px 0 0; font-size: 12px; color: #64748b;">
      You received this because you hold ${ticker} and have earnings alerts enabled. Open Settings in the app to change preferences.
    </p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Send earnings alert emails to all users who hold the given ticker and have alerts enabled.
 * Call this after successfully ingesting a company's new filing.
 */
export async function sendEarningsAlerts(
  ticker: string,
  companyName: string,
  formType: string,
): Promise<{ sent: number; errors: string[] }> {
  const holders = await getHoldersForTicker(ticker);
  if (holders.length === 0) return { sent: 0, errors: [] };

  const metrics = await getLatestMetrics(ticker);
  const html = buildEmailHtml(companyName, ticker, formType, metrics);

  const errors: string[] = [];
  let sent = 0;

  // Resend rate limit: ~10 req/sec — add small delay between sends when multiple holders
  const EMAIL_DELAY_MS = 150;

  for (let i = 0; i < holders.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, EMAIL_DELAY_MS));

    try {
      await sendEmail({
        to: holders[i].email,
        subject: `${ticker} — New ${formType} filed`,
        html,
      });
      sent++;
    } catch (err) {
      errors.push(`${holders[i].email}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  return { sent, errors };
}
