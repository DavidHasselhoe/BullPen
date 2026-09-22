'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import { sankey, sankeyLinkHorizontal, sankeyLeft } from 'd3-sankey';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { motion, useReducedMotion } from 'framer-motion';
import { Network, Lock, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useAIPanel } from '@/components/ai/AIPanelProvider';
import type { RevenuePart } from '@/lib/segments/select-breakdown';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IncomeStatementPeriod {
  fiscal_date: string;
  revenue: number | null;
  gross_profit: number | null;
  operating_income: number | null;
  net_income: number | null;
  r_and_d_expenses: number | null;
  selling_general_administrative_expenses: number | null;
  /** The currency the statement is reported in, which is not the trading currency. */
  reported_currency?: string | null;
}

interface FinancialsResponse {
  success: boolean;
  error?: string;
  data: IncomeStatementPeriod[];
}

interface SegmentsResponse {
  success: boolean;
  parts: RevenuePart[] | null;
  basis: 'product' | 'segment' | null;
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
  'Operating Loss':   { light: '#dc2626', dark: '#ef4444' },
  'Net Loss':         { light: '#b91c1c', dark: '#dc2626' },
};
const FALLBACK = { light: '#94a3b8', dark: '#64748b' };

function pickColor(id: string, isDark: boolean): string {
  return (NODE_PALETTE[id] ?? FALLBACK)[isDark ? 'dark' : 'light'];
}

// ─── Revenue sources ─────────────────────────────────────────────────────────
// Where the money came from, read from the company's own SEC filing (see
// lib/segments/). These are one visual family shaded by size, so they read as
// "the parts of revenue" rather than as unrelated categories; the income
// statement downstream keeps its own semantic colours.

const SOURCE_PREFIX = 'src:';

const SOURCE_RAMP: Record<'light' | 'dark', string[]> = {
  light: ['#4f46e5', '#5b55e6', '#6366f1', '#818cf8', '#a5b4fc', '#bdc7fd', '#d3dafe', '#e4e8ff', '#eef1ff'],
  dark:  ['#a5b4fc', '#818cf8', '#6366f1', '#5b55e6', '#4f46e5', '#4740d4', '#4338ca', '#3b31b4', '#342a9e'],
};

function isSource(id: string): boolean {
  return id.startsWith(SOURCE_PREFIX);
}

/** Node ids are prefixed so a part called "Other" cannot collide with "Other OpEx". */
function sourceId(label: string): string {
  return `${SOURCE_PREFIX}${label}`;
}

function sourceColor(id: string, order: string[], isDark: boolean): string {
  const ramp = SOURCE_RAMP[isDark ? 'dark' : 'light'];
  const i = order.indexOf(id);
  return ramp[Math.min(i < 0 ? 0 : i, ramp.length - 1)];
}

function nodeColor(id: string, order: string[], isDark: boolean): string {
  return isSource(id) ? sourceColor(id, order, isDark) : pickColor(id, isDark);
}

// Node `id` strings double as graph-wiring keys (buildGraph source/target
// references, NODE_PALETTE color lookups) — they must stay fixed English
// identifiers. This maps each one to a translated key purely for display.
const NODE_LABEL_KEYS: Record<string, string> = {
  'Total Revenue': 'sankeyNodeTotalRevenue',
  'Cost of Revenue': 'sankeyNodeCostOfRevenue',
  'Gross Profit': 'sankeyNodeGrossProfit',
  'R&D': 'sankeyNodeRnD',
  'SG&A': 'sankeyNodeSgA',
  'Other OpEx': 'sankeyNodeOtherOpEx',
  'Other Costs': 'sankeyNodeOtherCosts',
  'Total Costs': 'sankeyNodeTotalCosts',
  'Costs & Tax': 'sankeyNodeCostsAndTax',
  'Operating Income': 'sankeyNodeOperatingIncome',
  'Tax & Other': 'sankeyNodeTaxAndOther',
  'Net Income': 'sankeyNodeNetIncome',
  'Operating Loss': 'sankeyNodeOperatingLoss',
  'Net Loss': 'sankeyNodeNetLoss',
};

function nodeLabel(id: string, t: TFunction): string {
  // A revenue source's label is the company's own wording from its filing,
  // so there is nothing to translate and nothing to look up.
  if (isSource(id)) return id.slice(SOURCE_PREFIX.length);
  const key = NODE_LABEL_KEYS[id];
  return key ? t(key) : id;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Money, in the currency the company actually reports in.
 *
 * Statements are not always in dollars and the trading currency is no guide:
 * SAP's ADR trades in USD on the NYSE and files in EUR, so labelling its
 * revenue "$36.80B" is simply wrong. The symbol comes from the statement's own
 * meta, and falls back to a dollar sign only when the feed gives nothing.
 */
function currencySymbol(code?: string | null): string {
  if (!code || code === 'USD') return '$';
  try {
    const parts = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 0,
    }).formatToParts(1);
    return parts.find((p) => p.type === 'currency')?.value ?? `${code} `;
  } catch {
    return `${code} `;
  }
}

function fmtVal(n: number, currency?: string | null): string {
  const sign = currencySymbol(currency);
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${sign}${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `${sign}${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6)  return `${sign}${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3)  return `${sign}${(n / 1e3).toFixed(1)}K`;
  return `${sign}${n.toFixed(0)}`;
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

/** Exported for scripts/test-sankey-graph.ts — the flow arithmetic is worth
 *  pinning, since a node that does not balance shows a wrong number rather
 *  than an error. */
export function buildGraph(
  row: IncomeStatementPeriod,
  sources?: RevenuePart[] | null,
): { nodes: RawNode[]; links: RawLink[] } | null {
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

  // Revenue sources feed the trunk. Two or more, or there is nothing to show:
  // a single source is just revenue with an extra box drawn around it.
  if (sources && sources.length >= 2) {
    for (const source of sources) {
      if (source.value <= 0) continue;
      const id = sourceId(source.label);
      if (!nodes.find((n) => n.id === id)) nodes.push({ id });
      links.push({ source: id, target: 'Total Revenue', value: source.value });
    }
  }

  if (gp != null && gp <= 0) {
    // Costs exceeded revenue, so there is no gross profit to branch from.
    // Every downstream link hangs off that node, so it was never created,
    // d3 threw on the dangling reference and the whole chart rendered as
    // "no data": Micron's FY2023 was blank rather than bad. All of revenue
    // went to cost of revenue, which is true and is as far as a flow
    // diagram can honestly go; the shortfall is named in the caption under
    // the chart instead of drawn as a flow that does not exist.
    push('Total Revenue', 'Cost of Revenue', rev);
  } else if (gp != null) {
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
      if (ni != null && ni > 0 && ni > oi) {
        // Net income above operating income, which happens on a large
        // non-operating gain: Alphabet's Q2 2026 carried $97.83B of other
        // income, so $112.19B of net income came out of $40.77B of operating
        // income. Pushing `ni` out of the Operating Income node made d3 value
        // that node at its outflow (a node is the larger of its two sides), so
        // the chart displayed operating income as $112.19B, 93.7% of revenue.
        // The gap has to enter the graph as its own inflow instead. It is the
        // same quantity as the Tax & Other outflow below with the sign
        // flipped, which is why it carries the same name.
        push('Operating Income', 'Net Income', oi);
        const nonOperating = ni - oi;
        if (!nodes.find((n) => n.id === 'Tax & Other')) nodes.push({ id: 'Tax & Other' });
        links.push({ source: 'Tax & Other', target: 'Net Income', value: nonOperating });
      } else if (ni != null && ni > 0) {
        const taxOther = Math.max(0, oi - ni);
        if (taxOther > 0) push('Operating Income', 'Tax & Other', taxOther);
        push('Operating Income', 'Net Income', ni);
      } else if (ni != null && ni <= 0) {
        // Profitable at the operating line, loss-making after it. Same
        // reasoning as the operating loss above: show it.
        push('Operating Income', 'Net Loss', Math.abs(ni));
      }
    } else if (oi != null && oi <= 0) {
      // A loss, drawn rather than dropped. `push` skips anything <= 0, so a
      // loss-making period used to lose its whole profit branch and render as
      // revenue and costs with nothing to compare them against: Micron's
      // FY2023 chart was actively misleading. The loss is shown at its
      // magnitude as its own outflow, which is what it is.
      if (rd  != null && rd  > 0) push(mid, 'R&D', rd);
      if (sga != null && sga > 0) push(mid, 'SG&A', sga);
      push(mid, 'Operating Loss', Math.abs(oi));
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

// [display:...] is stripped in BullpenChat before rendering — the full prompt still reaches the AI
function buildExplainQuery(
  ticker: string,
  revenue: number,
  periodLabel: string,
  graph: { nodes: RawNode[]; links: RawLink[] },
  currency?: string | null,
): string {
  const flowLines = graph.links
    .map((l) => `  ${l.source} -> ${l.target}: ${fmtVal(l.value, currency)} (${fmtPct(l.value, revenue)} of revenue)`)
    .join('\n');

  return `[display:Explain ${ticker} Revenue Flow]\nYou are a financial analyst inside Bullpen. Explain how ${ticker}'s revenue breaks down into costs and profit for ${periodLabel}, using the flow data below.

## Input Data
Company: ${ticker}
Period: ${periodLabel}
Total Revenue: ${fmtVal(revenue, currency)}
Flow (each line is a dollar amount moving from one bucket to the next):
${flowLines}

## Output Format (follow exactly)

**${ticker} — Revenue Flow: ${periodLabel}**

**Bottom Line**
2 sentences max: how much of each revenue dollar survives to net income, and the single biggest driver of where the rest goes.

**Where the Money Goes**
2-4 bullets, one per major bucket (cost of revenue, R&D, SG&A, tax, etc.) — dollar amount, % of revenue, and one sharp sentence on what it signals about the business.

**How to Interpret This**
2-3 bullets on what stands out here — margin structure, cost discipline, anything unusual for this kind of company.

## Rules
- Max ~180 words total
- No filler, no definitions of basic accounting terms — assume the reader can read a sankey chart
- Every sentence must add new information
- Do NOT restate every line of the flow — synthesize`;
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

interface Tip { x: number; y: number; id: string; value: number; pct: string }

/** Fixed so the flip decision near the viewport edge can be made before paint. */
const TIP_WIDTH = 180;

// ─── Chart ───────────────────────────────────────────────────────────────────

/** Loading and empty states render before the graph exists, so they need a fixed height. */
const PLACEHOLDER_H = 420;

/**
 * The diagram's own minimum width, independent of the viewport.
 *
 * With revenue sources the chart runs up to seven columns deep, and seven
 * labelled columns cannot fit a phone: at 360px each column gets about 40px
 * while a label needs 100px, so every label collides with its neighbour
 * whatever the placement rule. Below this width the chart keeps its size and
 * its container scrolls, which is what every dense financial chart does and is
 * the only option that loses no data.
 */
const CHART_W_MIN = 700;
const CHART_H_MIN = 320;
const CHART_H_MAX = 520;
// top: a stacked label is two lines drawn ABOVE its node, about 28px tall, so
// the first row needs that much clearance or its label leaves the viewbox.
// It used to be 10, which is why a top node drew its label inside itself.
const PAD = { top: 34, right: 172, bottom: 10, left: 6 };

function chartMetrics(nodeCount: number) {
  return {
    // Taller as the chart gains rows, which it now does: revenue sources add a
    // whole column of nodes.
    height: Math.max(CHART_H_MIN, Math.min(CHART_H_MAX, nodeCount * 44)),
    pad: PAD,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyLink = any;

interface SankeyChartProps {
  graph: { nodes: RawNode[]; links: RawLink[] };
  width: number;
  revenue: number;
  currency?: string | null;
  isDark: boolean;
  ticker: string;
  periodLabel: string;
  onTip: (tip: Tip | null) => void;
}

function SankeyChart({ graph, width, revenue, currency, isDark, ticker, periodLabel, onTip }: SankeyChartProps) {
  const { t } = useTranslation('stock');
  const { height: chartH, pad } = chartMetrics(graph.nodes.length);
  const innerW = width - pad.left - pad.right;
  const innerH = chartH - pad.top - pad.bottom;

  // Source nodes shade by size, so the ramp needs their order up front.
  const sourceOrder = useMemo(
    () =>
      graph.links
        .filter((l) => isSource(l.source))
        .slice()
        .sort((a, b) => b.value - a.value)
        .map((l) => l.source),
    [graph],
  );

  const reducedMotion = useReducedMotion();
  const titleId = `sankey-title-${ticker}`;
  const descId = `sankey-desc-${ticker}`;
  // Which node has keyboard focus, so its rect can show a ring.
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const layout = useMemo(() => {
    if (innerW <= 0) return null;
    try {
      const gen = sankey<RawNode, RawLink>()
        .nodeId((d) => d.id)
        .nodeWidth(20)
        // Two stacked label lines occupy ~28px above a node, so anything less
        // than that lets a lower row's label land on the row above it. At 16
        // the Cost of Revenue value line was drawn through "Gross Profit", and
        // SG&A's through "Operating Income".
        .nodePadding(30)
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
      // Keyed on the ticker alone: keyed on width too, every ResizeObserver
      // tick remounted the svg and replayed the fade, so dragging a window
      // edge flickered continuously.
      key={ticker}
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={reducedMotion ? undefined : { opacity: 1 }}
      transition={{ duration: 0.35 }}
      width={width}
      height={chartH}
      style={{ overflow: 'visible', display: 'block' }}
      role="img"
      aria-labelledby={`${titleId} ${descId}`}
    >
      {/* The chart's content in words. Built from the same links the chart
          draws, so a screen reader and the picture can never disagree. */}
      <title id={titleId}>{t('sankeyA11yTitle', { ticker, period: periodLabel })}</title>
      <desc id={descId}>
        {graph.links
          .map((l) =>
            t('sankeyA11yFlow', {
              from: nodeLabel(l.source, t),
              to: nodeLabel(l.target, t),
              value: fmtVal(l.value, currency),
              pct: fmtPct(l.value, revenue),
            }),
          )
          .join(' ')}
      </desc>

      <defs>
        {(layout.links as AnyLink[]).map((link, i) => {
          const srcColor = nodeColor((link.source as AnyNode).id, sourceOrder, isDark);
          const tgtColor = nodeColor((link.target as AnyNode).id, sourceOrder, isDark);
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

      <g transform={`translate(${pad.left},${pad.top})`}>
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
        {(layout.nodes as AnyNode[]).map((node, _i, allNodes) => {
          const maxDepth = Math.max(...allNodes.map((n) => (n.depth as number) ?? 0));
          const color  = nodeColor(node.id as string, sourceOrder, isDark);
          const nodeH  = (node.y1 as number) - (node.y0 as number);
          const midY   = ((node.y0 as number) + (node.y1 as number)) / 2;
          const midX   = ((node.x0 as number) + (node.x1 as number)) / 2;
          // A label in a middle column goes above its node rather than beside
          // it. Beside only works while there is an outer column to grow into:
          // once revenue gained a column of sources the columns narrowed and
          // "Gross Profit" rendered on top of "Operating Income". Above is
          // collision-free at any column count.
          const depth = (node.depth as number) ?? 0;
          const stacked = depth > 0 && depth < maxDepth;
          const isRight = midX > innerW * 0.55;
          const lx = stacked
            ? (node.x0 as number)
            : isRight ? (node.x0 as number) - 10 : (node.x1 as number) + 10;
          const anchor = stacked ? 'start' : isRight ? 'end' : 'start';
          const showSub = !stacked && nodeH > 20;
          // Always above the node, never inside it. The old rule put the label
          // inside whenever the node started within 32px of the top, because
          // there was no room above — which is what drew "Gross Profit" and
          // "Cost of Revenue" on top of their own coloured bars, dark text on a
          // saturated fill, and let the second line spill out of a short node
          // onto the label below. PAD.top now reserves the clearance instead,
          // so there is always somewhere honest to put it.
          const stackedY = (node.y0 as number) - 19;
          // d3 gives a node the larger of its inflow and outflow, so once
          // revenue has sources feeding it the trunk reads as their sum. That
          // differs from reported revenue whenever a filing carries a negative
          // component (Alphabet's hedging losses put it 0.03% out), and two
          // different revenue figures on one page is worse than none. The
          // trunk always shows what the company reported.
          const val = node.id === 'Total Revenue'
            ? revenue
            : ((node.value as number) ?? 0);

          const label = nodeLabel(node.id as string, t);
          const pct = revenue > 0 ? fmtPct(val, revenue) : '—';
          const tipAt = (x: number, y: number) => onTip({ x, y, id: label, value: val, pct });

          return (
            <g
              key={node.id as string}
              // Focus has no pointer coordinates, so the tooltip is placed
              // from the node's own rect. Without this the values are
              // unreachable by keyboard, and on a phone unreachable entirely.
              tabIndex={0}
              role="button"
              aria-label={t('sankeyA11yNode', { label, value: fmtVal(val, currency), pct })}
              onFocus={(e) => {
                setFocusedId(node.id as string);
                const box = (e.currentTarget as SVGGElement).getBoundingClientRect();
                tipAt(box.right, box.top + box.height / 2);
              }}
              onBlur={() => {
                setFocusedId(null);
                onTip(null);
              }}
              onMouseMove={(e) => tipAt(e.clientX, e.clientY)}
              onMouseLeave={() => onTip(null)}
              onPointerDown={(e) => {
                if (e.pointerType === 'mouse') return;
                tipAt(e.clientX, e.clientY);
              }}
              style={{ cursor: 'default', outline: 'none' }}
            >
              {/* Node rect */}
              <rect
                x={node.x0 as number} y={node.y0 as number}
                width={(node.x1 as number) - (node.x0 as number)}
                height={nodeH}
                fill={color}
                rx={3}
                opacity={0.9}
                stroke={focusedId === node.id ? 'var(--ring)' : undefined}
                strokeWidth={focusedId === node.id ? 2 : undefined}
              />
              {/* Primary label — uses CSS variable so it adapts to theme with no JS */}
              <text
                x={lx}
                y={stacked ? stackedY : midY - (showSub ? 8 : 0)}
                textAnchor={anchor}
                dominantBaseline={stacked ? 'auto' : 'middle'}
                fontSize={12}
                fontWeight={700}
                fontFamily="ui-sans-serif,system-ui,sans-serif"
                fill="var(--foreground)"
                style={{ userSelect: 'none', pointerEvents: 'none' }}
              >
                {stacked ? (
                  <>
                    {/* Two lines, not one: inline, the name plus its value is
                        wider than a column and collides with the next one. */}
                    <tspan x={lx}>{label}</tspan>
                    <tspan x={lx} dy={13} fontSize={11} fontWeight={400} fill="var(--muted-foreground)">
                      {fmtVal(val, currency)}
                      {revenue > 0 ? ` · ${pct}` : ''}
                    </tspan>
                  </>
                ) : (
                  label
                )}
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
                  {fmtVal(val, currency)}{revenue > 0 ? ` · ${fmtPct(val, revenue)}` : ''}
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
  const { t } = useTranslation('stock');
  const { open: openAIPanel } = useAIPanel();
  const { resolvedTheme } = useTheme();
  // mounted guard prevents hydration mismatch — node colours flash on first render otherwise
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
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

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setPeriodIdx(0); }, [period]);

  const { data, isLoading } = useQuery<FinancialsResponse>({
    queryKey: ['stock-financials', ticker, 'income', period],
    queryFn: () =>
      fetch(`/api/stock/${ticker}/financials?type=income&period=${period}`).then(r => r.json()),
    enabled: !!ticker,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: false,
  });

  const rows    = useMemo(() => (data?.data ?? []).slice(0, 5), [data]);
  const row     = rows[periodIdx] ?? null;

  // Where the revenue came from, from the company's SEC filing. Absent on the
  // first view of a stock (the endpoint fills its cache in the background) and
  // absent for good on roughly a third of filers, so the chart must be
  // complete without it.
  const { data: segmentData } = useQuery<SegmentsResponse>({
    queryKey: ['stock-segments', ticker, row?.fiscal_date, period],
    queryFn: () =>
      fetch(
        `/api/stock/${ticker}/segments?periodEnd=${row!.fiscal_date}&revenue=${row!.revenue}&period=${period}`,
      ).then((r) => r.json()),
    enabled: !!ticker && !!row?.fiscal_date && !!row?.revenue,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 48 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const graph = useMemo(
    () => (row ? buildGraph(row, segmentData?.parts) : null),
    [row, segmentData],
  );
  const conf    = useMemo(() => (row ? deriveConfidence(row) : null), [row]);
  const revenue = row?.revenue ?? 0;
  // The statement's own reporting currency, not the share's trading currency.
  const currency = row?.reported_currency ?? null;

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
              <h2 className="text-base font-semibold leading-tight text-foreground">{t('sankeyCardTitle')}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{t('sankeyCardSubtitle')}</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* How much of the income statement the filing broke out. It was
                labelled "confidence", which reads as confidence in the
                numbers; what it actually measures is how many lines are
                available to draw. */}
            {conf && !noData && !isPlanRestricted && (
              <span
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
                title={t('sankeyDetailTooltip')}
              >
                <span className={cn('h-2 w-2 rounded-full shrink-0', {
                  'bg-emerald-500': conf === 'high',
                  'bg-amber-400':   conf === 'medium',
                  'bg-slate-400':   conf === 'low',
                })} />
                {conf === 'high' ? t('sankeyDetailFull') : conf === 'medium' ? t('sankeyDetailPartial') : t('sankeyDetailLimited')}
              </span>
            )}

            {/* Explain button */}
            {!isLoading && !noData && !isPlanRestricted && graph && row && (
              <button
                onClick={() => openAIPanel({ query: buildExplainQuery(ticker, revenue, fmtLabel(row.fiscal_date, period), graph, currency) })}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <Sparkles className="h-3 w-3" />
                {t('sankeyExplainButton')}
              </button>
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
                  {p === 'annual' ? t('sankeyAnnual') : t('sankeyQuarterly')}
                </button>
              ))}
            </div>

            {/* Period picker */}
            {rows.length > 1 && !isPlanRestricted && (
              // Scrolls rather than wrapping: five period buttons on a phone
              // used to break onto a second line and push the chart down.
              <div className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-border bg-muted/50 p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {rows.map((r, i) => (
                  <button
                    key={r.fiscal_date}
                    onClick={() => setPeriodIdx(i)}
                    className={cn('shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-all', {
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
        {/* The diagram holds its own width and this scrolls under it, rather
            than the diagram shrinking until its labels pile up. */}
        <div
          ref={containerRef}
          className="overflow-x-auto px-4 py-5 [scrollbar-width:thin]"
        >
          {isLoading && (
            <Skeleton className="w-full rounded-xl" style={{ height: PLACEHOLDER_H }} />
          )}

          {isPlanRestricted && (
            <div
              className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border/40 bg-muted/20 text-sm"
              style={{ height: PLACEHOLDER_H }}
            >
              <Lock className="h-6 w-6 text-muted-foreground" />
              <p className="text-muted-foreground text-center max-w-xs">
                {period === 'quarterly' ? t('sankeyPlanRestrictedQuarterly') : t('sankeyPlanRestrictedAnnual')}
                <br />
                <span className="text-xs opacity-70">{t('sankeyPlanRestrictedHint')}</span>
              </p>
            </div>
          )}

          {noData && (
            <div
              className="flex items-center justify-center rounded-xl border border-border/40 bg-muted/20 text-sm text-muted-foreground"
              style={{ height: PLACEHOLDER_H }}
            >
              {t('sankeyNoData')}
            </div>
          )}

          {!isLoading && !noData && !isPlanRestricted && graph && chartWidth > 0 && (
            <SankeyChart
              graph={graph}
              width={Math.max(chartWidth, CHART_W_MIN)}
              revenue={revenue}
              currency={currency}
              isDark={isDark}
              ticker={ticker}
              periodLabel={row ? fmtLabel(row.fiscal_date, period) : ''}
              onTip={setTip}
            />
          )}
        </div>

        {/* ── Costs above revenue, which a flow diagram cannot draw ── */}
        {!isLoading && !noData && !isPlanRestricted && row && row.gross_profit != null && row.gross_profit <= 0 && (
          <p className="px-6 pb-1 text-xs text-amber-500">
            {t('sankeyGrossLossNote', { amount: fmtVal(Math.abs(row.gross_profit), currency) })}
          </p>
        )}

        {/* ── Where the revenue split came from ── */}
        {!isLoading && !noData && !isPlanRestricted && segmentData?.basis && (
          <p className="px-6 pb-1 text-xs text-muted-foreground/85">
            {segmentData.basis === 'product'
              ? t('sankeySourceNoteProduct')
              : t('sankeySourceNoteSegment')}
          </p>
        )}

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
                  {nodeLabel(id, t)}
                </span>
              ))}
          </div>
        )}
      </div>

      {/* ── Floating tooltip — portalled to document.body so no CSS transform
          or backdrop-filter ancestor can trap the fixed position ── */}
      {tip && mounted && createPortal(
        <div
          className="pointer-events-none fixed z-[9999] rounded-xl border shadow-2xl px-3 py-2.5 text-xs bg-popover border-border"
          // Flipped to the other side of the cursor near the right edge, and
          // never allowed above the viewport: a node at the edge of a wide
          // chart used to push its own tooltip off screen.
          style={{
            left: tip.x + TIP_WIDTH + 20 > window.innerWidth ? tip.x - TIP_WIDTH - 10 : tip.x + 10,
            top: Math.max(8, tip.y - 40),
            width: TIP_WIDTH,
          }}
        >
          <p className="font-semibold text-foreground mb-1.5">{tip.id}</p>
          <div className="space-y-1">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">{t('sankeyTooltipValue')}</span>
              <span className="font-medium tabular-nums text-foreground">{fmtVal(tip.value, currency)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">{t('sankeyTooltipPercentOfRevenue')}</span>
              <span className="font-medium tabular-nums text-foreground">{tip.pct}</span>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
