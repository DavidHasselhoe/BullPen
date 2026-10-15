"use client";

import { animate, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { LINE_LOADING_PULSE_EASE } from "./line-loading-timing";
import {
  computeSeriesPathPoints,
  interpolateSeriesPathPoints,
  type SeriesPathPoint,
  seriesPathFromPoints,
  seriesPathTransitionSignature,
} from "./series-path-utils";

// biome-ignore lint/suspicious/noExplicitAny: d3 curve factory type
type CurveFactory = any;

export interface UseAnimatedSeriesPathOptions {
  renderData: Record<string, unknown>[];
  xAccessor: (datum: Record<string, unknown>) => Date;
  xScale: (value: Date) => number | undefined;
  yScale: (value: number) => number | undefined;
  dataKey: string;
  curve: CurveFactory;
  chartPhase: string;
  durationMs: number;
  innerWidth: number;
  enabled: boolean;
}

export function useAnimatedSeriesPath({
  renderData,
  xAccessor,
  xScale,
  yScale,
  dataKey,
  curve,
  chartPhase,
  durationMs,
  innerWidth,
  enabled,
}: UseAnimatedSeriesPathOptions) {
  const reducedMotion = useReducedMotion();
  const [animatedPoints, setAnimatedPoints] = useState<
    SeriesPathPoint[] | null
  >(null);
  const displayedPointsRef = useRef<SeriesPathPoint[] | null>(null);
  const animatingRef = useRef(false);

  const xScaleDomain = useMemo(() => {
    const scaleWithDomain = xScale as { domain?: () => [Date, Date] };
    return scaleWithDomain.domain?.() ?? [new Date(0), new Date(0)];
  }, [xScale]);

  const transitionSignature = useMemo(
    () =>
      seriesPathTransitionSignature({
        renderData,
        xAccessor,
        dataKey,
        innerWidth,
        xDomainMin: xScaleDomain[0]?.getTime?.() ?? 0,
        xDomainMax: xScaleDomain[1]?.getTime?.() ?? 0,
      }),
    [renderData, xAccessor, dataKey, innerWidth, xScaleDomain]
  );

  const targetPoints = useMemo(
    () =>
      computeSeriesPathPoints(renderData, xAccessor, xScale, yScale, dataKey),
    [renderData, xAccessor, xScale, yScale, dataKey]
  );

  const prevTransitionSignatureRef = useRef(transitionSignature);

  // The running animation reads the scales and data through this ref, not
  // through effect deps. The y-domain tweens alongside a data transition, so
  // yScale changes every frame; as a dep it re-ran the effect, whose cleanup
  // stopped the animation before onComplete could clear `animatedPoints`. The
  // re-run then saw an unchanged signature and returned, leaving the line
  // frozen on its first interpolated frame (the previous range's shape) while
  // hover dots used the live scale. Found on the holdings S&P line 2026-10-15.
  const latestRef = useRef({ renderData, xAccessor, xScale, yScale, dataKey, targetPoints });
  useEffect(() => {
    latestRef.current = { renderData, xAccessor, xScale, yScale, dataKey, targetPoints };
    if (!animatingRef.current) {
      displayedPointsRef.current = targetPoints;
    }
  }, [renderData, xAccessor, xScale, yScale, dataKey, targetPoints]);

  useEffect(() => {
    const latest = latestRef.current;
    const shouldAnimate =
      enabled &&
      !reducedMotion &&
      chartPhase === "ready" &&
      durationMs > 0 &&
      latest.renderData.length > 0;

    if (!shouldAnimate) {
      animatingRef.current = false;
      setAnimatedPoints(null);
      displayedPointsRef.current = latest.targetPoints;
      prevTransitionSignatureRef.current = transitionSignature;
      return;
    }

    if (prevTransitionSignatureRef.current === transitionSignature) {
      // Same data, but an animation was stopped by the cleanup below (it never
      // reaches onComplete): drop its last frame rather than freeze on it.
      if (!animatingRef.current) setAnimatedPoints(null);
      return;
    }
    prevTransitionSignatureRef.current = transitionSignature;

    const fromPoints = displayedPointsRef.current ?? latest.targetPoints;
    if (fromPoints.length === 0) {
      displayedPointsRef.current = latest.targetPoints;
      return;
    }

    animatingRef.current = true;
    const fromSnapshot = fromPoints;

    const control = animate(0, 1, {
      duration: durationMs / 1000,
      ease: [...LINE_LOADING_PULSE_EASE],
      onUpdate: (progress) => {
        const live = latestRef.current;
        const currentTarget = computeSeriesPathPoints(
          live.renderData,
          live.xAccessor,
          live.xScale,
          live.yScale,
          live.dataKey
        );
        const next = interpolateSeriesPathPoints(
          fromSnapshot,
          currentTarget,
          progress
        );
        displayedPointsRef.current = next;
        setAnimatedPoints(next);
      },
      onComplete: () => {
        animatingRef.current = false;
        displayedPointsRef.current = latestRef.current.targetPoints;
        setAnimatedPoints(null);
      },
    });

    return () => {
      control.stop();
      animatingRef.current = false;
    };
  }, [transitionSignature, chartPhase, durationMs, enabled, reducedMotion]);

  const activePoints = animatedPoints ?? targetPoints;
  const pathD = useMemo(
    () => seriesPathFromPoints(activePoints, curve),
    [activePoints, curve]
  );

  return {
    pathD,
    isPathAnimating: animatedPoints != null,
  };
}
