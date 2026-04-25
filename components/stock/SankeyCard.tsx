'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import { sankey, sankeyLinkHorizontal, sankeyLeft } from 'd3-sankey';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { Network, Lock } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface IncomeStatementPeriod {
  fiscal_date: string;
  revenue: number | null;
  gross_profit: number | null;
  operating_income: number | null;
  net_income: number | null;
  r_and_d_expenses: number | null;
  selling_general_administrative_expenses: number | null;
}

interface FinancialsResponse {
  success: boolean;
  error?: string;
  data: IncomeStatementPeriod[];
}

type Period = 'annual' | 'quarterly';
type Confidence = 'high' | 'medium' | 'low';

// ─── Node color palette ───────────────────────────────────────────────────────
// Two variants — used only for node rects and link gradients (not text labels)

const NODE_PALETTE: Record<string, { light: string; dark: string }> = {
  'Total Revenue':    { light: '#6366f1', dark: '#818cf8' },
  'Cost of Revenue':  { light: '#ef4444', dark: '#f87171' },
  'Gross Profit':     { light: '#10b981', dark: '#34d399' },
  'R&D':              { light: '#f59e0b', dark: '#fbbf24' },
  'SG&A':             { light: '#8b5cf6', dark: '#a78bfa' },
  'Other OpEx':       { light: '#64748b', dark: '#94a3b8' },
  'Total Costs':      { light: '#ef4444', dark: '#f87171' },
  'Costs & Tax':      { light: '#ef4444', dark: '#f87171' },
  'Operating Income': { light: '#22c55e', dark: '#4ade80' },
  'Tax & Other':      { light: '#f43f5e', dark: '#fb7185' },
  'Net Income':       { light: '#059669', dark: '#10b981' },
};
const FALLBACK = { light: '#94a3b8', dark: '#64748b' };

function pickColor(id: string, isDark: boolean): string {
  return (NODE_PALETTE[id] ?? FALLBACK)[isDark ? 'dark' : 'light'];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtVal(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3)  return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(val: number, total: number): string {
  if (total === 0) return '—';
  return `${((val / total) * 100).toFixed(1)}%`;
}

function fmtLabel(date: string, period: Period): string {
  const d = new Date(date);
  if (period === 'annual') return d.getFullYear().toString();
  const q = Math.ceil((d.getMonth() + 1) / 3);
  return `Q${q} ${d.getFullYear()}`;
}

// ─── Sankey data builder ──────────────────────────────────────────────────────

interface RawNode { id: string }
interface RawLink { source: string; target: string; value: number }

function buildGraph(row: IncomeStatementPeriod): { nodes: RawNode[]; links: RawLink[] } | null {
  const rev = row.revenue;
  if (!rev || rev <= 0) return null;

  const gp  = row.gross_profit;
  const oi  = row.operating_income;
  const ni  = row.net_income;
  const rd  = row.r_and_d_expenses;
  const sga = row.selling_general_administrative_expenses;

  const nodes: RawNode[] = [{ id: 'Total Revenue' }];
  const links: RawLink[] = [];

  const push = (src: string, tgt: string, val: number) => {
    if (val <= 0) return;
    if (!nodes.find(n => n.id === tgt)) nodes.push({ id: tgt });
    links.push({ source: src, target: tgt, value: val });
  };

  if (gp != null) {
    // Revenue → Cost of Revenue + Gross Profit
    const cogs = Math.max(0, rev - gp);
    if (cogs > 0) push('Total Revenue', 'Cost of Revenue', cogs);
    push('Total Revenue', 'Gross Profit', gp);

    const mid = 'Gross Profit';

    if (oi != null && oi > 0) {
      // Gross Profit → OpEx detail + Operating Income
      if (rd  != null && rd  > 0) push(mid, 'R&D', rd);
      if (sga != null && sga > 0) push(mid, 'SG&A', sga);
      const knownOpEx  = (rd ?? 0) + (sga ?? 0);
      const opExTotal  = Math.max(0, gp - oi);
      const otherOpEx  = Math.max(0, opExTotal - knownOpEx);
      if (otherOpEx > 0) push(mid, 'Other OpEx', otherOpEx);
      push(mid, 'Operating Income', oi);

      // Operating Income → Tax & Net Income
      if (ni != null && ni > 0) {
        const taxOther = Math.max(0, oi - ni);
        if (taxOther > 0) push('Operating Income', 'Tax & Other', taxOther);
        push('Operating Income', 'Net Income', ni);
      }
    } else if (ni != null && ni > 0) {
      // No operating income — simplified: GP → costs + net income
      if (rd  != null && rd  > 0) push(mid, 'R&D', rd);
      if (sga != null && sga > 0) push(mid, 'SG&A', sga);
      const knownOpEx = (rd ?? 0) + (sga ?? 0);
      const otherCosts = Math.max(0, gp - ni - knownOpEx);
      if (otherCosts > 0) push(mid, 'Other Costs', otherCosts);
      push(mid, 'Net Income', ni);
    } else {
      // Only gross profit — show cost/GP split
      if (rd  != null && rd  > 0) push(mid, 'R&D', rd);
      if (sga != null && sga > 0) push(mid, 'SG&A', sga);
    }
  } else if (ni != null && ni > 0) {
    // Minimal: only revenue and net income
    const totalCosts = Math.max(0, rev - ni);
    if (totalCosts > 0) push('Total Revenue', 'Total Costs', totalCosts);
    push('Total Revenue', 'Net Income', ni);
  }

  if (links.length === 0) return null;
  return { nodes, links };
}

function deriveConfidence(row: IncomeStatementPeriod): Confidence {
  const core   = [row.gross_profit, row.operating_income, row.net_income].filter(v => v != null).length;
  const detail = row.r_and_d_expenses != null || row.selling_general_administrative_expenses != null;
  if (core === 3 && detail) return 'high';
  if (core >= 2)            return 'medium';
  return 'low';
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

interface Tip { x: number; y: number; id: string; value: number; pct: string }

// ─── Chart ───────────────────────────────────────────────────────────────────

const CHART_H = 420;
const PAD     = { top: 10, right: 172, bottom: 10, left: 6 };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyLink = any;

interface SankeyChartProps {
  graph: { nodes: RawNode[]; links: RawLink[] };
  width: number;
  revenue: number;
  isDark: boolean;
  ticker: string;
  onTip: (tip: Tip | null) => void;
}

function SankeyChart({ graph, width, revenue, isDark, ticker, onTip }: SankeyChartProps) {
  const innerW = width - PAD.left - PAD.right;
  const innerH = CHART_H - PAD.top - PAD.bottom;

  const layout = useMemo(() => {
    if (innerW <= 0) return null;
    try {
      const gen = sankey<RawNode, RawLink>()
        .nodeId((d) => d.id)
        .nodeWidth(20)
        .nodePadding(16)
        .nodeAlign(sankeyLeft)
        .extent([[0, 0], [innerW, innerH]]);
      return gen({
        nodes: graph.nodes.map(n => ({ ...n })),
        links: graph.links.map(l => ({ ...l })),
      });
    } catch {
      return null;
    }
  }, [graph, innerW, innerH]);

  if (!layout) return null;

  return (
    <motion.svg
      key={`${ticker}-${width}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
      width={width}
      height={CHART_H}
      style={{ overflow: 'visible', display: 'block' }}
    >
      <defs>
        {(layout.links as AnyLink[]).map((link, i) => {
          const srcColor = pickColor((link.source as AnyNode).id, isDark);
          const tgtColor = pickColor((link.target as AnyNode).id, isDark);
          return (
            <linearGradient
              key={i}
              id={`sk-${ticker}-${i}`}
              gradientUnits="userSpaceOnUse"
              x1={(link.source as AnyNode).x1}
              y1={0}
              x2={(link.target as AnyNode).x0}
              y2={0}
            >
              <stop offset="0%"   stopColor={srcColor} stopOpacity={0.65} />
              <stop offset="100%" stopColor={tgtColor} stopOpacity={0.55} />
            </linearGradient>
          );
        })}
      </defs>

      <g transform={`translate(${PAD.left},${PAD.top})`}>
        {/* Links */}
        {(layout.links as AnyLink[]).map((link, i) => {
          const path = sankeyLinkHorizontal()(link);
          if (!path) return null;
          return (
            <path
              key={i}
              d={path}
              fill="none"
              stroke={`url(#sk-${ticker}-${i})`}
              strokeWidth={Math.max(2, link.width as number)}
              strokeOpacity={0.55}
            />
          );
        })}

        {/* Nodes + labels */}
        {(layout.nodes as AnyNode[]).map((node) => {
          const color  = pickColor(node.id as string, isDark);
          const nodeH  = (node.y1 as number) - (node.y0 as number);
          const midY   = ((node.y0 as number) + (node.y1 as number)) / 2;
          const midX   = ((node.x0 as number) + (node.x1 as number)) / 2;
          const isRight = midX > innerW * 0.55;
          const lx     = isRight ? (node.x0 as number) - 10 : (node.x1 as number) + 10;
          const anchor = isRight ? 'end' : 'start';
          const showSub = nodeH > 20;
          const val     = (node.value as number) ?? 0;

          return (
            <g
              key={node.id as string}
              onMouseEnter={(e) => onTip({
                x: e.clientX, y: e.clientY,
                id: node.id as string,
                value: val,
                pct: revenue > 0 ? fmtPct(val, revenue) : '—',
              })}
              onMouseLeave={() => onTip(null)}
              style={{ cursor: 'default' }}
            >
              {/* Node rect */}
              <rect
                x={node.x0 as number} y={node.y0 as number}
                width={(node.x1 as number) - (node.x0 as number)}
                height={nodeH}
                fill={color}
                rx={3}
                opacity={0.9}
              />
              {/* Primary label — uses CSS variable so it adapts to theme with no JS */}
              <text
                x={lx}
                y={midY - (showSub ? 8 : 0)}
                textAnchor={anchor}
                dominantBaseline="middle"
                fontSize={12}
                fontWeight={700}
                fontFamily="ui-sans-serif,system-ui,sans-serif"
                fill="var(--foreground)"
                style={{ userSelect: 'none', pointerEvents: 'none' }}
              >
                {node.id as string}
              </text>
              {/* Sub-label: value + pct */}
              {showSub && (
                <text
                  x={lx}
                  y={midY + 8}
                  textAnchor={anchor}
                  dominantBaseline="middle"
                  fontSize={11}
                  fontFamily="ui-sans-serif,system-ui,sans-serif"
                  fill="var(--muted-foreground)"
                  style={{ userSelect: 'none', pointerEvents: 'none' }}
                >
                  {fmtVal(val)}{revenue > 0 ? ` · ${fmtPct(val, revenue)}` : ''}
                </text>
              )}
            </g>
          );
        })}
      </g>
    </motion.svg>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

export function SankeyCard({ ticker }: { ticker: string }) {
  const { resolvedTheme } = useTheme();
  // mounted guard prevents hydration mismatch — node colours flash on first render otherwise
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === 'dark';

  const [period, setPeriod]         = useState<Period>('quarterly');
  const [periodIdx, setPeriodIdx]   = useState(0);
  const [chartWidth, setChartWidth] = useState(0);
  const [tip, setTip]               = useState<Tip | null>(null);
  const containerRef                = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setChartWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { setPeriodIdx(0); }, [period]);

  const { data, isLoading } = useQuery<FinancialsResponse>({
    queryKey: ['stock-financials', ticker, 'income', period],
    queryFn: () =>
      fetch(`/api/stock/${ticker}/financials?type=income&period=${period}`).then(r => r.json()),
    enabled: !!ticker,
    staleTime: 24 * 60 * 60 * 1000,
    retry: false,
  });

  const rows    = useMemo(() => (data?.data ?? []).slice(0, 5), [data]);
  const row     = rows[periodIdx] ?? null;
  const graph   = useMemo(() => (row ? buildGraph(row) : null), [row]);
  const conf    = useMemo(() => (row ? deriveConfidence(row) : null), [row]);
  const revenue = row?.revenue ?? 0;

  const isPlanRestricted = !isLoading && data?.error === 'plan_restricted';
  const noData = !isLoading && !isPlanRestricted && (!data?.success || rows.length === 0 || !graph);

  return (
    <>
      <div className="mb-8 rounded-2xl border border-border/50 bg-card shadow-xl overflow-hidden">
        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-4 px-6 pt-5 pb-4 flex-wrap border-b border-border/40">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Network className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold leading-tight text-foreground">Revenue Flow</h2>
              <p className="text-xs text-muted-foreground mt-0.5">How revenue becomes profit</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Confidence dot */}
            {conf && !noData && !isPlanRestricted && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn('h-2 w-2 rounded-full shrink-0', {
                  'bg-emerald-500': conf === 'high',
                  'bg-amber-400':   conf === 'medium',
                  'bg-slate-400':   conf === 'low',
                })} />
                {conf.charAt(0).toUpperCase() + conf.slice(1)} confidence
              </span>
            )}

            {/* Annual / Quarterly toggle */}
            <div className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/50 p-0.5">
              {(['annual', 'quarterly'] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={cn('rounded-md px-2.5 py-1 text-xs font-medium transition-all', {
                    'bg-background text-foreground shadow-sm': period === p,
                    'text-muted-foreground hover:text-foreground': period !== p,
                  })}
                >
                  {p === 'annual' ? 'Annual' : 'Quarterly'}
                </button>
              ))}
            </div>

            {/* Period picker */}
            {rows.length > 1 && !isPlanRestricted && (
              <div className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/50 p-0.5">
                {rows.map((r, i) => (
                  <button
                    key={r.fiscal_date}
                    onClick={() => setPeriodIdx(i)}
                    className={cn('rounded-md px-2.5 py-1 text-xs font-medium transition-all', {
                      'bg-background text-foreground shadow-sm': periodIdx === i,
                      'text-muted-foreground hover:text-foreground': periodIdx !== i,
                    })}
                  >
                    {fmtLabel(r.fiscal_date, period)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Chart area ── */}
        <div ref={containerRef} className="px-4 py-5">
          {isLoading && (
            <Skeleton className="w-full rounded-xl" style={{ height: CHART_H }} />
          )}

          {isPlanRestricted && (
            <div
              className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border/40 bg-muted/20 text-sm"
              style={{ height: CHART_H }}
            >
              <Lock className="h-6 w-6 text-muted-foreground" />
              <p className="text-muted-foreground text-center max-w-xs">
                {period === 'quarterly' ? 'Quarterly' : 'Annual'} income statement data requires a higher plan.
                <br />
                <span className="text-xs opacity-70">Try switching to Annual above.</span>
              </p>
            </div>
          )}

          {noData && (
            <div
              className="flex items-center justify-center rounded-xl border border-border/40 bg-muted/20 text-sm text-muted-foreground"
              style={{ height: CHART_H }}
            >
              Financial flow data not available for this period
            </div>
          )}

          {!isLoading && !noData && !isPlanRestricted && graph && chartWidth > 0 && (
            <SankeyChart
              graph={graph}
              width={chartWidth}
              revenue={revenue}
              isDark={isDark}
              ticker={ticker}
              onTip={setTip}
            />
          )}
        </div>

        {/* ── Node colour legend ── */}
        {!isLoading && !noData && !isPlanRestricted && (
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-6 pb-5 text-xs text-muted-foreground">
            {Object.entries(NODE_PALETTE)
              .filter(([id]) => graph?.nodes.some(n => n.id === id))
              .map(([id, colors]) => (
                <span key={id} className="flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-sm shrink-0"
                    style={{ background: colors[isDark ? 'dark' : 'light'] }}
                  />
                  {id}
                </span>
              ))}
          </div>
        )}
      </div>

      {/* ── Floating tooltip ──
          Rendered OUTSIDE the card so backdrop-filter doesn't trap `position:fixed` */}
      {tip && (
        <div
          className="pointer-events-none fixed z-[200] rounded-xl border shadow-2xl px-3 py-2.5 text-xs bg-popover border-border"
          style={{ left: tip.x + 14, top: tip.y - 12, minWidth: 160 }}
        >
          <p className="font-semibold text-foreground mb-1.5">{tip.id}</p>
          <div className="space-y-1">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Value</span>
              <span className="font-medium tabular-nums text-foreground">{fmtVal(tip.value)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">% of Revenue</span>
              <span className="font-medium tabular-nums text-foreground">{tip.pct}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
