'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { sankey, sankeyLinkHorizontal, sankeyJustify } from 'd3-sankey';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Info, Loader2 } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface SankeyNode {
  id: string;
  label?: string;
}

interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

interface SankeyData {
  quarter: string;
  nodes: SankeyNode[];
  links: SankeyLink[];
  metadata?: { totalRevenue: number };
}

interface SankeyResponse {
  success: boolean;
  data?: SankeyData;
  confidence?: 'high' | 'medium' | 'low';
  source?: 'xbrl' | 'xbrl+ai' | 'xbrl+segments';
  error?: string;
}

interface SankeyDiagramProps {
  ticker: string;
  isDataLoading?: boolean;
}

interface LayoutNode {
  id: string;
  x0?: number;
  x1?: number;
  y0?: number;
  y1?: number;
  value?: number;
  sourceLinks?: LayoutLink[];
  targetLinks?: LayoutLink[];
}

interface LayoutLink {
  source: LayoutNode;
  target: LayoutNode;
  value: number;
  y0?: number;
  y1?: number;
  width?: number;
  path: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Semantic color system – links inherit TARGET category color
// Revenue=gray, Profit=green, Costs=red, Taxes=orange
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  'Total Revenue': '#94a3b8',
  'Gross Profit': '#22c55e',
  'Operating Income': '#22c55e',
  'Net Income': '#16a34a',
  'Cost of Revenue': '#ef4444',
  'Operating Expenses': '#ef4444',
  'Tax & Other': '#f59e0b',
};

function getCategoryColor(id: string): string {
  return CATEGORY_COLORS[id] ?? '#94a3b8';
}

/** Link color = TARGET category (Revenue→Operating Income = green) */
function getCategoryColorId(id: string): string {
  const slug = id.replace(/\s+/g, '-').replace(/&/g, 'and').toLowerCase();
  return `cat-${slug}`;
}

/** Gradient IDs for flow fills: Profit=green, Expense=red, Tax=orange, Revenue=gray */
const FLOW_GRADIENTS: Record<string, { from: string; to: string }> = {
  'Total Revenue': { from: '#64748b', to: '#94a3b8' },
  'Gross Profit': { from: '#166534', to: '#22c55e' },
  'Operating Income': { from: '#166534', to: '#22c55e' },
  'Net Income': { from: '#14532d', to: '#16a34a' },
  'Cost of Revenue': { from: '#991b1b', to: '#ef4444' },
  'Operating Expenses': { from: '#991b1b', to: '#ef4444' },
  'Tax & Other': { from: '#b45309', to: '#f59e0b' },
};

function getLinkGradientId(link: LayoutLink): string {
  const id = link.target.id;
  return FLOW_GRADIENTS[id] ? getCategoryColorId(id) : 'cat-total-revenue';
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting
// ─────────────────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatPercentage(value: number, total: number): string {
  return total > 0 ? `${((value / total) * 100).toFixed(1)}%` : '0%';
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

const NODE_WIDTH = 8;
const NODE_PADDING = 50;
const LINK_OPACITY_IDLE = 0.85;
const LINK_OPACITY_DIMMED = 0.25;
const LABEL_OFFSET = 18;
const TOOLTIP_OFFSET = 10;
const TOOLTIP_PADDING = 4;

export function SankeyDiagram({ ticker, isDataLoading = false }: SankeyDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 620 });

  const { data, isLoading, error } = useQuery<SankeyResponse>({
    queryKey: ['sankey', ticker],
    queryFn: async () => {
      const response = await fetch(`/api/stock/${ticker}/sankey`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 400 && errorData.error?.includes('No quarterly')) {
          throw new Error('DATA_LOADING');
        }
        throw new Error(errorData.error || 'Failed to fetch Sankey diagram');
      }
      return response.json();
    },
    enabled: !!ticker,
    staleTime: 1000 * 60 * 60,
    refetchInterval: (query) => {
      const err = query.state.error;
      if (err instanceof Error && err.message === 'DATA_LOADING') return 5000;
      return false;
    },
    retry: (failureCount, err) => {
      if (err instanceof Error && err.message === 'DATA_LOADING') return false;
      return failureCount < 2;
    },
  });

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth;
        setDimensions({
          width: Math.max(800, w - 32),
          height: 620,
        });
      }
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const { layoutNodes, layoutLinks, totalRevenue } = useMemo(() => {
    if (!data?.data || data.data.nodes.length === 0 || data.data.links.length === 0) {
      return { layoutNodes: [] as LayoutNode[], layoutLinks: [] as LayoutLink[], totalRevenue: 0 };
    }

    const sankeyData = data.data;
    const totalRev = sankeyData.metadata?.totalRevenue || 0;
    const margin = { top: 40, right: 160, bottom: 40, left: 160 };
    const { width, height } = dimensions;

    const graph = {
      nodes: sankeyData.nodes.map((n) => ({ ...n })) as LayoutNode[],
      links: sankeyData.links.map((l) => ({ source: l.source, target: l.target, value: l.value })),
    };

    const nodeMap = new Map<string, LayoutNode>();
    graph.nodes.forEach((n) => nodeMap.set(n.id, n));

    graph.links = graph.links
      .map((l) => {
        const src = nodeMap.get(l.source as string);
        const tgt = nodeMap.get(l.target as string);
        if (!src || !tgt) return null;
        return { ...l, source: src, target: tgt };
      })
      .filter(Boolean) as typeof graph.links;

    const sankeyGenerator = sankey<LayoutNode, { source: LayoutNode; target: LayoutNode; value: number }>()
      .nodeWidth(NODE_WIDTH)
      .nodePadding(NODE_PADDING)
      .iterations(64)
      .extent([
        [margin.left, margin.top],
        [width - margin.right, height - margin.bottom],
      ])
      .nodeAlign(sankeyJustify);

    sankeyGenerator(graph);

    const linkPathGen = sankeyLinkHorizontal();
    const layoutLinks: LayoutLink[] = graph.links.map((link) => ({
      ...link,
      path: linkPathGen(link) ?? '',
    })) as LayoutLink[];

    return {
      layoutNodes: graph.nodes,
      layoutLinks,
      totalRevenue: totalRev,
    };
  }, [data?.data, dimensions]);

  const [hoveredLink, setHoveredLink] = useState<LayoutLink | null>(null);
  const [hoveredNode, setHoveredNode] = useState<LayoutNode | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [tooltipContent, setTooltipContent] = useState<'link' | 'node' | null>(null);

  /** Position tooltip close to cursor (~10px offset), only nudge when needed to stay in view */
  const getClampedTooltipStyle = (clientX: number, clientY: number) => {
    const offset = TOOLTIP_OFFSET;
    const pad = TOOLTIP_PADDING;
    const tw = 220;
    const th = 72;
    const container = containerRef.current;
    if (!container) {
      return { left: clientX + offset, top: clientY + offset, position: 'fixed' as const };
    }
    const rect = container.getBoundingClientRect();
    // Prefer placement to the right and slightly below cursor (keeps tooltip near hovered element)
    let x = clientX + offset;
    let y = clientY + offset;
    // Nudge only the minimum needed to stay in bounds
    if (x + tw > rect.right - pad) x = Math.max(rect.left + pad, clientX - tw - offset);
    if (x < rect.left + pad) x = rect.left + pad;
    if (y + th > rect.bottom - pad) y = Math.max(rect.top + pad, clientY - th - offset);
    if (y < rect.top + pad) y = rect.top + pad;
    return { left: x, top: y, position: 'fixed' as const };
  };

  const connectedLinkIds = useMemo(() => {
    if (!hoveredNode) return new Set<number>();
    const ids = new Set<number>();
    layoutLinks.forEach((l, i) => {
      if (l.source === hoveredNode || l.target === hoveredNode) ids.add(i);
    });
    return ids;
  }, [hoveredNode, layoutLinks]);

  const isLinkHighlighted = (link: LayoutLink, i: number): boolean => {
    if (hoveredLink === link) return true;
    if (hoveredNode && connectedLinkIds.has(i)) return true;
    return false;
  };

  const getLinkOpacity = (link: LayoutLink, i: number): number => {
    const highlighted = isLinkHighlighted(link, i);
    if (hoveredLink || hoveredNode) {
      return highlighted ? 1 : LINK_OPACITY_DIMMED;
    }
    return LINK_OPACITY_IDLE;
  };

  const handleLinkHover = (e: React.MouseEvent, link: LayoutLink | null) => {
    setHoveredLink(link);
    if (link) {
      setTooltipPos({ x: e.clientX, y: e.clientY });
      setTooltipContent('link');
      setHoveredNode(null);
    }
  };

  const handleNodeHover = (e: React.MouseEvent, node: LayoutNode | null) => {
    setHoveredNode(node);
    if (node) {
      setTooltipPos({ x: e.clientX, y: e.clientY });
      setTooltipContent('node');
      setHoveredLink(null);
    }
  };

  const clearLinkHover = () => {
    setHoveredLink(null);
    setTooltipContent((c) => (c === 'link' ? null : c));
  };

  const clearNodeHover = () => {
    setHoveredNode(null);
    setTooltipContent((c) => (c === 'node' ? null : c));
  };

  // ─── Loading / Error states ────────────────────────────────────────────────

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Income Statement Flow</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[620px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const isDataStillLoading = error instanceof Error && error.message === 'DATA_LOADING';
  const hasRealError = error && !isDataStillLoading;

  if (isDataStillLoading || (isDataLoading && (!data?.success || !data?.data))) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Income Statement Flow</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[400px] flex-col items-center justify-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium text-foreground">Generating financial flow diagram...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (hasRealError || (data?.success === false && !isDataStillLoading)) return null;

  const sankeyData = data?.data;
  const confidence = data?.confidence ?? 'medium';
  const source = data?.source ?? 'xbrl';

  if (!sankeyData) return null;

  const chartWidth = dimensions.width;
  const chartHeight = dimensions.height;
  const chartCenterX = chartWidth / 2;

  // ─── Render diagram ────────────────────────────────────────────────────────

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">
            {sankeyData.quarter} Income Statement Flow
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge
              variant={confidence === 'high' ? 'default' : confidence === 'medium' ? 'secondary' : 'outline'}
              className="text-xs"
            >
              {source === 'xbrl+segments' || source === 'xbrl+ai' ? 'Detailed breakdown' : 'Standard breakdown'}
            </Badge>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">
                    Based on latest quarterly filing
                    {source === 'xbrl+segments' && ' with revenue segment breakdown'}
                    {source === 'xbrl+ai' && ' with AI-assisted analysis'}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div
          ref={containerRef}
          className="w-full overflow-x-auto rounded-lg"
          style={{ backgroundColor: 'hsl(220 15% 11%)' }}
          onMouseLeave={() => {
            setHoveredLink(null);
            setHoveredNode(null);
            setTooltipContent(null);
          }}
        >
          <svg
            width={chartWidth}
            height={chartHeight}
            style={{ minHeight: 620 }}
            className="block"
          >
            <defs>
              {/* Drop shadow for nodes */}
              <filter id="node-shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx={0} dy={1} stdDeviation={2} floodColor="rgba(0,0,0,0.25)" />
              </filter>
              {/* Flow gradients – profit=green, expense=red, tax=orange, revenue=gray */}
              {Object.entries(FLOW_GRADIENTS).map(([id, { from, to }]) => (
                <linearGradient
                  key={id}
                  id={getCategoryColorId(id)}
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="0%"
                >
                  <stop offset="0%" stopColor={from} />
                  <stop offset="100%" stopColor={to} />
                </linearGradient>
              ))}
            </defs>
            {/* Links – smooth curved bands, gradient fills, semantic color by target */}
            <g fill="none" strokeLinecap="round" pointerEvents="stroke">
              {layoutLinks.map((link, i) => {
                const gradientId = getLinkGradientId(link);
                const thickness = Math.max(2, (link.width ?? 0) * 0.7);
                const opacity = getLinkOpacity(link, i);
                return (
                  <motion.path
                    key={`link-${i}`}
                    d={link.path}
                    stroke={`url(#${gradientId})`}
                    strokeWidth={thickness}
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{
                      pathLength: 1,
                      opacity,
                    }}
                    transition={{
                      pathLength: { duration: 0.35, ease: 'easeOut' },
                      opacity: { duration: 0.2 },
                    }}
                    style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                    onMouseEnter={(e) => handleLinkHover(e, link)}
                    onMouseMove={(e) => handleLinkHover(e, link)}
                    onMouseLeave={clearLinkHover}
                  />
                );
              })}
            </g>

            {/* Nodes – minimal 8px vertical bars, rounded, subtle shadow */}
            <g pointerEvents="all">
              {layoutNodes.map((node, i) => {
                const x0 = node.x0 ?? 0;
                const x1 = node.x1 ?? 0;
                const y0 = node.y0 ?? 0;
                const y1 = node.y1 ?? 0;
                const w = x1 - x0;
                const h = y1 - y0;
                const color = getCategoryColor(node.id);
                const isLeftHalf = (x0 + x1) / 2 < chartCenterX;

                return (
                  <motion.g
                    key={node.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.35, delay: i * 0.04, ease: 'easeOut' }}
                  >
                    <rect
                      x={x0}
                      y={y0}
                      width={w}
                      height={h}
                      rx={3}
                      ry={3}
                      fill={color}
                      stroke="rgba(255,255,255,0.25)"
                      strokeWidth={1}
                      filter="url(#node-shadow)"
                      onMouseEnter={(e) => handleNodeHover(e, node)}
                      onMouseMove={(e) => handleNodeHover(e, node)}
                      onMouseLeave={clearNodeHover}
                      style={{ cursor: 'pointer' }}
                    />
                    {/* Labels outside nodes – metric 14px, value 17px bold */}
                    <g>
                      <text
                        x={isLeftHalf ? x0 - LABEL_OFFSET : x1 + LABEL_OFFSET}
                        y={(y0 + y1) / 2 - 10}
                        textAnchor={isLeftHalf ? 'end' : 'start'}
                        dominantBaseline="middle"
                        fill="#f1f5f9"
                        fontSize={14}
                        fontWeight={500}
                      >
                        {node.id}
                      </text>
                      <text
                        x={isLeftHalf ? x0 - LABEL_OFFSET : x1 + LABEL_OFFSET}
                        y={(y0 + y1) / 2 + 12}
                        textAnchor={isLeftHalf ? 'end' : 'start'}
                        dominantBaseline="middle"
                        fill="#f1f5f9"
                        fontSize={17}
                        fontWeight={700}
                      >
                        {formatCurrency(node.value ?? 0)}
                      </text>
                    </g>
                  </motion.g>
                );
              })}
            </g>
          </svg>

          {/* Tooltip – follows cursor, 12px offset, clamped to container */}
          {tooltipContent === 'link' && hoveredLink && (
            <div
              className="fixed z-[1000] pointer-events-none rounded-lg border border-border bg-popover px-3 py-2.5 text-sm shadow-xl"
              style={getClampedTooltipStyle(tooltipPos.x, tooltipPos.y)}
            >
              <div className="font-semibold text-foreground">
                {hoveredLink.source.id} → {hoveredLink.target.id}
              </div>
              <div className="mt-1 text-base font-bold">
                {formatCurrency(hoveredLink.value)}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {formatPercentage(hoveredLink.value, totalRevenue || 1)} of revenue
              </div>
            </div>
          )}

          {tooltipContent === 'node' && hoveredNode && (
            <div
              className="z-[1000] pointer-events-none rounded-lg border border-border bg-popover px-3 py-2.5 text-sm shadow-xl"
              style={getClampedTooltipStyle(tooltipPos.x, tooltipPos.y)}
            >
              <div className="font-semibold text-foreground">{hoveredNode.id}</div>
              <div className="mt-1 text-base font-bold">
                {formatCurrency(hoveredNode.value ?? 0)}
              </div>
              {totalRevenue && totalRevenue > 0 && (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {formatPercentage(hoveredNode.value ?? 0, totalRevenue)} of revenue
                </div>
              )}
            </div>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Hover over flows or nodes to see details
        </p>
      </CardContent>
    </Card>
  );
}
