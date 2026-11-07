export type ProjectionMode = "auto" | "target" | "manual";
export type ProjectionAutoMethod = "linearRegression" | "lastSegment";
/** How the projection segment is drawn between anchor and horizon. */
export type ProjectionCurveKind = "linear" | "bezier";
/** @deprecated Stepped density removed — projections always anchor → horizon. */
export type ProjectionPathDensity = "stepped" | "endpoints";

export interface ProjectionPoint {
  date: Date;
  value: number;
}

export interface BuildProjectionPathOptions {
  sourceData: Record<string, unknown>[];
  seriesKey: string;
  xDataKey?: string;
  mode: ProjectionMode;
  autoMethod?: ProjectionAutoMethod;
  /** Auto mode: stepped points per interval, or anchor + end only. Default: stepped */
  pathDensity?: ProjectionPathDensity;
  /** Index in sourceData where projection anchors (default: last point). */
  startIndex?: number;
  /** How many future points to generate (matches source cadence). */
  horizonPoints?: number;
  /** Target Y at the final projected date (target mode). */
  endValue?: number;
  /** Full manual path — anchor + future points (manual mode). */
  points?: ProjectionPoint[];
}

/** Collect numeric Y extents from projection point arrays. */
export function projectionValueExtents(
  paths: ProjectionPoint[][]
): { minValue: number; maxValue: number } | null {
  let minValue = Number.POSITIVE_INFINITY;
  let maxValue = Number.NEGATIVE_INFINITY;

  for (const path of paths) {
    for (const point of path) {
      if (point.value < minValue) {
        minValue = point.value;
      }
      if (point.value > maxValue) {
        maxValue = point.value;
      }
    }
  }

  if (minValue === Number.POSITIVE_INFINITY) {
    return null;
  }

  return { minValue, maxValue };
}
