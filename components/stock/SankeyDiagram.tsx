'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as d3 from 'd3';
import { sankey, sankeyLinkHorizontal, sankeyLeft, sankeyRight, sankeyJustify } from 'd3-sankey';
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
  metadata?: {
    totalRevenue: number;
  };
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
  isDataLoading?: boolean; // Optional prop to indicate if company data is still loading
}

// Type definitions for d3-sankey
interface SankeyNodeExtra {
  id: string;
  x0?: number;
  x1?: number;
  y0?: number;
  y1?: number;
  value?: number;
  sourceLinks?: SankeyLinkExtra[];
  targetLinks?: SankeyLinkExtra[];
}

interface SankeyLinkExtra {
  source: SankeyNodeExtra | string;
  target: SankeyNodeExtra | string;
  value: number;
  y0?: number;
  y1?: number;
  width?: number;
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`;
  }
  return `$${value.toFixed(0)}`;
}

function formatPercentage(value: number, total: number): string {
  return `${((value / total) * 100).toFixed(1)}%`;
}

export function SankeyDiagram({ ticker, isDataLoading = false }: SankeyDiagramProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  const { data, isLoading, error } = useQuery<SankeyResponse>({
    queryKey: ['sankey', ticker],
    queryFn: async () => {
      const response = await fetch(`/api/stock/${ticker}/sankey`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        // If it's a "no data" error, it might still be loading
        if (response.status === 400 && errorData.error?.includes('No quarterly')) {
          throw new Error('DATA_LOADING'); // Special error to indicate data might still be loading
        }
        throw new Error(errorData.error || 'Failed to fetch Sankey diagram');
      }
      return response.json();
    },
    enabled: !!ticker,
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
    // Auto-refetch when data is loading to catch when it becomes available
    refetchInterval: (query) => {
      const error = query.state.error;
      // If we're in a "data loading" state, poll every 5 seconds
      if (error instanceof Error && error.message === 'DATA_LOADING') {
        return 5000; // Poll every 5 seconds
      }
      return false; // Don't poll if we have data or a real error
    },
    retry: (failureCount, error) => {
      // Don't retry if it's a "data loading" error - we'll poll instead
      if (error instanceof Error && error.message === 'DATA_LOADING') {
        return false;
      }
      return failureCount < 2;
    },
  });

  // Update dimensions on mount and resize
  useEffect(() => {
    const updateDimensions = () => {
      if (svgRef.current?.parentElement) {
        const containerWidth = svgRef.current.parentElement.clientWidth;
        setDimensions({
          width: Math.max(800, containerWidth - 32),
          height: 600,
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Render Sankey diagram
  useEffect(() => {
    if (!data?.data || !svgRef.current || isLoading) return;

    const sankeyData = data.data;
    const totalRevenue = sankeyData.metadata?.totalRevenue || 0;

    // Clear previous render
    d3.select(svgRef.current).selectAll('*').remove();

    if (sankeyData.nodes.length === 0 || sankeyData.links.length === 0) {
      return;
    }

    const width = dimensions.width;
    const height = dimensions.height;
    const margin = { top: 20, right: 20, bottom: 20, left: 20 };

    const svg = d3
      .select(svgRef.current)
      .attr('width', width)
      .attr('height', height);

    // Prepare data for d3-sankey
    const graph = {
      nodes: sankeyData.nodes.map((n) => ({ ...n })) as SankeyNodeExtra[],
      links: sankeyData.links.map((l) => ({
        source: l.source,
        target: l.target,
        value: l.value,
      })) as SankeyLinkExtra[],
    };

    // Create Sankey layout
    const sankeyGenerator = sankey<SankeyNodeExtra, SankeyLinkExtra>()
      .nodeWidth(24)
      .nodePadding(10)
      .extent([
        [margin.left, margin.top],
        [width - margin.right, height - margin.bottom],
      ])
      .nodeAlign(sankeyJustify);

    // Map node IDs to objects
    const nodeMap = new Map<string, SankeyNodeExtra>();
    graph.nodes.forEach((node) => {
      nodeMap.set(node.id, node as SankeyNodeExtra);
    });

    // Convert link source/target from strings to node objects
    graph.links = graph.links.map((link) => {
      const sourceNode = typeof link.source === 'string' ? nodeMap.get(link.source) : link.source;
      const targetNode = typeof link.target === 'string' ? nodeMap.get(link.target) : link.target;
      
      if (!sourceNode || !targetNode) {
        throw new Error(`Invalid link: source or target node not found`);
      }
      
      return {
        ...link,
        source: sourceNode,
        target: targetNode,
      };
    });

    // Compute layout
    sankeyGenerator(graph);

    // Color scheme
    const colorScale = d3.scaleOrdinal<string, string>()
      .domain(['Total Revenue', 'Cost of Revenue', 'Operating Expenses', 'Operating Income', 'Net Income', 'Tax & Other'])
      .range([
        '#94a3b8', // Revenue - neutral gray
        '#ef4444', // Cost of Revenue - red
        '#f97316', // Operating Expenses - orange
        '#22c55e', // Operating Income - green
        '#10b981', // Net Income - green
        '#f59e0b', // Tax & Other - amber
      ]);

    // Draw links
    const link = svg
      .append('g')
      .attr('fill', 'none')
      .attr('stroke-opacity', 0.5)
      .selectAll('path')
      .data(graph.links)
      .join('path')
      .attr('d', sankeyLinkHorizontal())
      .attr('stroke', (d) => {
        const sourceId = typeof d.source === 'object' && d.source !== null && 'id' in d.source ? (d.source as SankeyNodeExtra).id : String(d.source);
        return colorScale(sourceId) || '#94a3b8';
      })
      .attr('stroke-width', (d) => Math.max(1, d.width || 0))
      .style('mix-blend-mode', 'multiply')
      .on('mouseenter', function (event, d) {
        d3.select(this).attr('stroke-opacity', 0.8);
      })
      .on('mouseleave', function () {
        d3.select(this).attr('stroke-opacity', 0.5);
      });

    // Add tooltips to links
    const linkTooltip = d3
      .select('body')
      .append('div')
      .attr('class', 'sankey-tooltip')
      .style('position', 'absolute')
      .style('padding', '8px 12px')
      .style('background', 'rgba(0, 0, 0, 0.9)')
      .style('color', 'white')
      .style('border-radius', '4px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('opacity', 0)
      .style('z-index', 1000);

    link
      .on('mouseenter', function (event, d) {
        const sourceId = typeof d.source === 'object' && 'id' in d.source ? d.source.id : String(d.source);
        const targetId = typeof d.target === 'object' && 'id' in d.target ? d.target.id : String(d.target);
        const value = d.value || 0;
        const percentage = totalRevenue > 0 ? formatPercentage(value, totalRevenue) : '0%';

        linkTooltip
          .html(`
            <div><strong>${sourceId} → ${targetId}</strong></div>
            <div>${formatCurrency(value)}</div>
            <div>${percentage} of revenue</div>
          `)
          .style('opacity', 1)
          .style('left', `${event.pageX + 10}px`)
          .style('top', `${event.pageY + 10}px`);
      })
      .on('mousemove', function (event) {
        linkTooltip
          .style('left', `${event.pageX + 10}px`)
          .style('top', `${event.pageY + 10}px`);
      })
      .on('mouseleave', function () {
        linkTooltip.style('opacity', 0);
      });

    // Draw nodes
    const node = svg
      .append('g')
      .selectAll('rect')
      .data(graph.nodes)
      .join('rect')
      .attr('x', (d) => d.x0 || 0)
      .attr('y', (d) => d.y0 || 0)
      .attr('height', (d) => (d.y1 || 0) - (d.y0 || 0))
      .attr('width', (d) => (d.x1 || 0) - (d.x0 || 0))
      .attr('fill', (d) => colorScale(d.id) || '#94a3b8')
      .attr('stroke', '#fff')
      .attr('stroke-width', 1)
      .on('mouseenter', function () {
        d3.select(this).attr('stroke-width', 2);
      })
      .on('mouseleave', function () {
        d3.select(this).attr('stroke-width', 1);
      });

    // Add labels
    const label = svg
      .append('g')
      .attr('font-family', 'sans-serif')
      .attr('font-size', 12)
      .selectAll('text')
      .data(graph.nodes)
      .join('text')
      .attr('x', (d) => {
        const x = (d.x0 || 0) + (d.x1 || 0);
        return x < width / 2 ? (d.x1 || 0) + 6 : (d.x0 || 0) - 6;
      })
      .attr('y', (d) => ((d.y0 || 0) + (d.y1 || 0)) / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', (d) => {
        const x = (d.x0 || 0) + (d.x1 || 0);
        return x < width / 2 ? 'start' : 'end';
      })
      .attr('fill', '#1f2937')
      .text((d) => d.id);

    // Add value labels
    const valueLabel = svg
      .append('g')
      .attr('font-family', 'sans-serif')
      .attr('font-size', 11)
      .attr('fill', '#6b7280')
      .selectAll('text')
      .data(graph.nodes)
      .join('text')
      .attr('x', (d) => {
        const x = (d.x0 || 0) + (d.x1 || 0);
        return x < width / 2 ? (d.x1 || 0) + 6 : (d.x0 || 0) - 6;
      })
      .attr('y', (d) => ((d.y0 || 0) + (d.y1 || 0)) / 2 + 14)
      .attr('text-anchor', (d) => {
        const x = (d.x0 || 0) + (d.x1 || 0);
        return x < width / 2 ? 'start' : 'end';
      })
      .text((d) => {
        const value = d.value || 0;
        return formatCurrency(value);
      });

    // Cleanup tooltip on unmount
    return () => {
      linkTooltip.remove();
    };
  }, [data, dimensions, isLoading]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Income Statement Flow</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[600px] w-full" />
        </CardContent>
      </Card>
    );
  }

  // Check if error indicates data is still loading (not a real error)
  const isDataStillLoading = error instanceof Error && error.message === 'DATA_LOADING';
  const hasRealError = error && !isDataStillLoading;

  if (isDataStillLoading || (isDataLoading && (!data?.success || !data?.data))) {
    // Show loading state when data might still be generating
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Income Statement Flow</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[400px] flex-col items-center justify-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">
                Generating financial flow diagram...
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                This may take a few moments. The diagram will appear automatically.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (hasRealError || (data?.success === false && data?.error && !isDataStillLoading)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Income Statement Flow</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[400px] items-center justify-center text-sm text-muted-foreground">
            {error instanceof Error && error.message !== 'DATA_LOADING'
              ? 'Unable to load financial flow diagram'
              : data?.error || 'No financial data available for this period'}
          </div>
        </CardContent>
      </Card>
    );
  }

  const sankeyData = data?.data;
  const confidence = data?.confidence || 'medium';
  const source = data?.source || 'xbrl';

  if (!sankeyData) {
    return null;
  }

  return (
    <Card>
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
        <div className="w-full overflow-x-auto">
          <svg ref={svgRef} className="w-full" style={{ minHeight: '600px' }} />
        </div>
        <p className="mt-4 text-xs text-muted-foreground text-center">
          Hover over flows to see values and percentages
        </p>
      </CardContent>
    </Card>
  );
}
