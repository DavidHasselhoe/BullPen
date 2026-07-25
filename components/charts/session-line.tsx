"use client";

import { curveNatural } from "@visx/curve";
import { LinePath } from "@visx/shape";
import { useId, useMemo, useRef } from "react";
import { useChartStable, useYScale } from "./chart-context";
import { usePathStrokeMetrics } from "./path-stroke-utils";

export type SessionKind = "pre" | "regular" | "post";

export interface SessionRegion {
  /** First data index in this region (inclusive). */
  startIndex: number;
  /** Last data index in this region (inclusive). */
  endIndex: number;
  session: SessionKind;
}

export interface SessionLineProps {
  /** Key in data to use for y values. */
  dataKey: string;
  /** Stroke width for all segments. Default: 2 */
  strokeWidth?: number;
  /**
   * Ordered, non-overlapping index ranges tagged by session. Multi-day
   * ranges (e.g. 1W's 15-min bars) repeat pre→regular→post once per day —
   * this renders however many regions are passed, not just one cycle.
   */
  regions: SessionRegion[];
  /** Stroke for `regular` regions — typically the live green/red color. */
  regularStroke: string;
  /** Stroke for `pre`/`post` regions. Default: #6b7280 */
  mutedStroke?: string;
  /** Stroke opacity for `pre`/`post` regions. Default: 0.55 */
  mutedOpacity?: number;
  /** Dash pattern for `pre` regions. Default: "4,3" */
  preDashArray?: string;
  /** Dash pattern for `post` regions. Default: "1,3" */
  postDashArray?: string;
  yAxisId?: string | number;
}

interface Segment {
  key: string;
  clipX: number;
  clipWidth: number;
  stroke: string;
  strokeOpacity: number;
  dashArray?: string;
}

/**
 * Session-aware line — dashed pre-market, solid regular session, dashed/dotted
 * after-hours, each independently colored, repeating once per day for
 * multi-day intraday ranges. Bklit's shared `Line` only supports a single
 * dashed tail with one shared stroke color, which covers neither the
 * muted-vs-live color split nor more than one transition — built as a
 * standalone component rather than extending `Line` so it can't regress the
 * indicator overlays already relying on that shared component. Clips one
 * copy of the same measured path per region to that region's x-pixel range —
 * simpler and more precise than the tail-only mechanism's path-length
 * approximation, since clipping happens directly in x-pixel space rather
 * than estimated length-along-curve.
 */
export function SessionLine({
  dataKey,
  strokeWidth = 2,
  regions,
  regularStroke,
  mutedStroke = "#6b7280",
  mutedOpacity = 0.55,
  preDashArray = "4,3",
  postDashArray = "1,3",
  yAxisId,
}: SessionLineProps) {
  const { data, renderData, xScale, innerWidth, innerHeight, xAccessor } = useChartStable();
  const yScale = useYScale(yAxisId);

  const getY = (d: Record<string, unknown>) => {
    const value = d[dataKey];
    return typeof value === "number" ? (yScale(value) ?? 0) : 0;
  };

  const pathRef = useRef<SVGPathElement>(null);
  const { pathD } = usePathStrokeMetrics(pathRef, [renderData, innerWidth]);

  const segments = useMemo<Segment[]>(() => {
    if (data.length === 0 || regions.length === 0) return [];

    const xAt = (index: number): number => {
      const point = data[index];
      if (!point) return 0;
      return xScale(xAccessor(point)) ?? 0;
    };

    const pad = strokeWidth * 2;
    const lastIndex = data.length - 1;

    return regions.map((region, i) => {
      const isFirst = i === 0;
      const isLast = i === regions.length - 1;
      const startX = isFirst ? -pad : xAt(region.startIndex);
      const endX = isLast ? innerWidth + pad : xAt(Math.min(region.endIndex, lastIndex));

      const style =
        region.session === "regular"
          ? { stroke: regularStroke, strokeOpacity: 1, dashArray: undefined }
          : {
              stroke: mutedStroke,
              strokeOpacity: mutedOpacity,
              dashArray: region.session === "pre" ? preDashArray : postDashArray,
            };

      return {
        key: `${region.session}-${region.startIndex}`,
        clipX: startX,
        clipWidth: Math.max(0, endX - startX),
        ...style,
      };
    });
  }, [data, regions, innerWidth, strokeWidth, mutedStroke, mutedOpacity, preDashArray, postDashArray, regularStroke, xScale, xAccessor]);

  const reactId = useId().replace(/:/g, "");

  return (
    <>
      {/* Invisible measurement path — same curve/accessors as the visible segments below. */}
      <LinePath
        curve={curveNatural}
        data={renderData}
        innerRef={pathRef}
        stroke="transparent"
        strokeWidth={strokeWidth}
        x={(d) => xScale(xAccessor(d)) ?? 0}
        y={getY}
      />
      {pathD &&
        segments.map((seg, i) => {
          const clipId = `session-line-clip-${reactId}-${i}`;
          return (
            <g key={seg.key}>
              <defs>
                <clipPath id={clipId}>
                  <rect
                    height={innerHeight + strokeWidth * 2}
                    width={seg.clipWidth}
                    x={seg.clipX}
                    y={-strokeWidth}
                  />
                </clipPath>
              </defs>
              <path
                clipPath={`url(#${clipId})`}
                d={pathD}
                fill="none"
                stroke={seg.stroke}
                strokeDasharray={seg.dashArray}
                strokeLinecap="round"
                strokeOpacity={seg.strokeOpacity}
                strokeWidth={strokeWidth}
              />
            </g>
          );
        })}
    </>
  );
}

SessionLine.displayName = "SessionLine";

export default SessionLine;
