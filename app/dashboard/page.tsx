/**
 * Dashboard shell.
 *
 * The dashboard itself stays a client component — it is almost entirely
 * interactive, per-user and live. What this server component adds is what is
 * the same for everybody and needed above the fold: the index quotes behind the
 * header's market line (one shared 60 s Redis entry with Discover), plus the
 * greeting, so neither waits on the browser.
 *
 * Everything user-specific — holdings, watchlist, the daily brief — still loads
 * on the client where the session lives.
 *
 * loading.tsx streams the shell so this never costs a blank screen.
 */

import { getMarketIndices } from '@/lib/discover/indices';
import { getInitialWelcome } from '@/lib/dashboard/initial-welcome';
import DashboardClient from './DashboardClient';

export default async function DashboardPage() {
  // Individually non-fatal: no indices just means no market line.
  const [welcome, indices] = await Promise.all([
    getInitialWelcome(),
    getMarketIndices().catch(() => []),
  ]);

  return <DashboardClient initialWelcome={welcome} indices={indices} />;
}
