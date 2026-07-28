'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface HealthScoreHistoryPoint {
  fiscalDate: string;
  snapshotDate: string;
  score: number;
  grade: string;
}

interface Props {
  ticker: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  history: HealthScoreHistoryPoint[];
}

function formatQuarterLabel(fiscalDate: string): string {
  const d = new Date(fiscalDate);
  if (Number.isNaN(d.getTime())) return fiscalDate;
  const quarter = Math.floor(d.getMonth() / 3) + 1;
  return `Q${quarter} '${String(d.getFullYear()).slice(2)}`;
}

function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function HealthScoreHistoryModal({ ticker, open, onOpenChange, history }: Props) {
  const chartData = history.map((h) => ({ ...h, label: formatQuarterLabel(h.fiscalDate) }));
  const listNewestFirst = [...history].reverse();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{ticker} — Financial Health History</DialogTitle>
        </DialogHeader>

        {history.length < 2 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            We just started tracking history for this company — check back after the next earnings report.
          </p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <YAxis domain={[0, 100]} hide />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#71717a', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  dy={6}
                />
                <ReferenceLine y={70} stroke="#71717a" strokeDasharray="3 3" strokeOpacity={0.3} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const pt = payload[0].payload as (typeof chartData)[number];
                    return (
                      <div className="rounded-lg border border-border bg-background/95 px-3 py-2 shadow-lg backdrop-blur-sm text-xs space-y-0.5">
                        <p className="font-semibold text-foreground">{pt.score}/100 · {pt.grade}</p>
                        <p className="text-muted-foreground">{formatFullDate(pt.snapshotDate)}</p>
                      </div>
                    );
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#10b981', strokeWidth: 0 }}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>

            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {listNewestFirst.map((pt, i) => {
                const prev = listNewestFirst[i + 1];
                const delta = prev ? pt.score - prev.score : null;
                return (
                  <div
                    key={pt.fiscalDate}
                    className="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-border/40 last:border-0"
                  >
                    <span className="text-muted-foreground">{formatFullDate(pt.snapshotDate)}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground tabular-nums">{pt.score}/100</span>
                      <span className="text-muted-foreground">{pt.grade}</span>
                      {delta !== null && delta !== 0 && (
                        <span className={cn(
                          'flex items-center gap-0.5 font-medium tabular-nums',
                          delta > 0 ? 'text-emerald-500' : 'text-red-500'
                        )}>
                          {delta > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                          {Math.abs(delta)}
                        </span>
                      )}
                      {delta === 0 && (
                        <span className="flex items-center text-muted-foreground/85">
                          <Minus className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
