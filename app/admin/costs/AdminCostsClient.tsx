'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, Activity } from 'lucide-react';
import type { CostsResponse } from '@/app/api/admin/costs/route';

const FEATURE_COLORS: Record<string, string> = {
  portfolio_builder: 'bg-primary',
  chat:              'bg-emerald-500',
  why_today:         'bg-amber-500',
  compare_explain:   'bg-violet-500',
  risk_analysis:     'bg-rose-500',
  competitors:       'bg-cyan-500',
  daily_brief:       'bg-indigo-500',
};

function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function AdminCostsClient() {
  const { data, isLoading, error } = useQuery<CostsResponse>({
    queryKey: ['admin-costs'],
    queryFn: async () => {
      const res = await fetch('/api/admin/costs');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 30_000,
  });

  return (
    <main className="container mx-auto max-w-6xl py-8 px-4 sm:px-6 lg:px-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">AI Costs</h1>
        <p className="text-sm text-muted-foreground/80 mt-1">
          Last 7 days of <code className="font-mono text-xs">ai_usage</code> aggregated by feature and user.
        </p>
      </header>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 mb-6 text-sm text-red-400">
          Failed to load: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="h-24 rounded-xl bg-muted/30 animate-pulse" />
          <div className="h-24 rounded-xl bg-muted/30 animate-pulse" />
        </div>
      )}

      {data && (
        <>
          {/* Top stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground/60 font-semibold">
                  <DollarSign className="h-3.5 w-3.5" />
                  Spend, last 7 days
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold tabular-nums">{fmtUsd(data.totalUsd7d)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground/60 font-semibold">
                  <Activity className="h-3.5 w-3.5" />
                  Total AI calls, last 7 days
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold tabular-nums">{data.totalCalls7d.toLocaleString()}</p>
              </CardContent>
            </Card>
          </div>

          {/* Per-feature breakdown */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Spend by feature</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.perFeature.length === 0 ? (
                <p className="text-sm text-muted-foreground">No usage yet.</p>
              ) : (
                data.perFeature.map((f) => {
                  const pct = data.totalUsd7d > 0 ? (f.cost_usd / data.totalUsd7d) * 100 : 0;
                  return (
                    <div key={f.feature}>
                      <div className="flex items-baseline justify-between text-sm mb-1">
                        <span className="font-mono">{f.feature}</span>
                        <span className="text-muted-foreground/70 tabular-nums">
                          {fmtUsd(f.cost_usd)} · {f.calls} calls
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted/30 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${FEATURE_COLORS[f.feature] ?? 'bg-primary'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Top users */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Top 10 spending users</CardTitle>
            </CardHeader>
            <CardContent>
              {data.topUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No usage yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-widest text-muted-foreground/50 text-left">
                      <th className="py-2 font-semibold">User</th>
                      <th className="py-2 font-semibold text-right">Calls</th>
                      <th className="py-2 font-semibold text-right">Spend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topUsers.map((u, i) => (
                      <tr key={u.user_id ?? `null-${i}`} className="border-t border-border/30">
                        <td className="py-2 font-mono text-xs text-muted-foreground/80">
                          {u.email ?? (u.user_id ? 'no email' : '(system / cron)')}
                        </td>
                        <td className="py-2 text-right tabular-nums">{u.calls}</td>
                        <td className="py-2 text-right tabular-nums">{fmtUsd(u.cost_usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {/* Recent calls */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Recent calls</CardTitle>
            </CardHeader>
            <CardContent>
              {data.recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">No usage yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-widest text-muted-foreground/50 text-left">
                        <th className="py-2 font-semibold">When</th>
                        <th className="py-2 font-semibold">Feature</th>
                        <th className="py-2 font-semibold">Model</th>
                        <th className="py-2 font-semibold text-right">In tok</th>
                        <th className="py-2 font-semibold text-right">Out tok</th>
                        <th className="py-2 font-semibold text-right">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent.map((r) => (
                        <tr key={r.id} className="border-t border-border/30">
                          <td className="py-1.5 font-mono text-muted-foreground/70 whitespace-nowrap">
                            {new Date(r.created_at).toLocaleString()}
                          </td>
                          <td className="py-1.5 font-mono">{r.feature}</td>
                          <td className="py-1.5 font-mono text-muted-foreground/70">{r.model}</td>
                          <td className="py-1.5 text-right tabular-nums">{r.input_tokens ?? '—'}</td>
                          <td className="py-1.5 text-right tabular-nums">{r.output_tokens ?? '—'}</td>
                          <td className="py-1.5 text-right tabular-nums">{fmtUsd(r.cost_usd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
