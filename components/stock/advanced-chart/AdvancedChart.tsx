'use client';

import { useEffect, useMemo, useRef } from 'react';
import {
  createChart, createSeriesMarkers, ColorType, CrosshairMode, LineStyle,
  CandlestickSeries, LineSeries, AreaSeries, HistogramSeries,
  type IChartApi, type ISeriesApi, type UTCTimestamp, type SeriesType,
  type SeriesMarker, type Time,
} from 'lightweight-charts';
import {
  getIndicatorDef,
  indicatorLabel,
  type OHLCV,
  type IndicatorInstance,
} from '@/lib/finance/indicators';
import type { AdvancedChartType } from '@/hooks/use-chart-prefs';

interface Props {
  candles: OHLCV | null;
  chartType: AdvancedChartType;
  indicators: IndicatorInstance[];
  showVolume: boolean;
  isDark: boolean;
  /** Intraday ranges show the time on the axis. */
  intraday: boolean;
  /** Bumping this re-fits the visible range (e.g. on range change). */
  fitKey: string;
  /** Past earnings events to mark on the price series (when the Events toggle is on). */
  events?: { ts: number; beat: boolean | null }[];
}

const UP = '#22c55e';
const DOWN = '#ef4444';

function chartTheme(isDark: boolean) {
  const text = isDark ? '#a1a1aa' : '#52525b';
  const grid = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
  const border = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';
  return {
    layout: {
      background: { type: ColorType.Solid, color: 'transparent' },
      textColor: text,
      fontFamily: 'inherit',
      attributionLogo: false,
    },
    grid: { vertLines: { color: grid }, horzLines: { color: grid } },
    rightPriceScale: { borderColor: border },
    timeScale: { borderColor: border },
    crosshair: { mode: CrosshairMode.Normal },
  };
}

/**
 * Sort ascending + dedupe by time (lightweight-charts requires strictly
 * ascending, unique times). Returns `order` — the original candle indices in the
 * accepted order — so indicator series can be built with the identical ordering.
 */
function pricePoints(candles: OHLCV) {
  const idx = candles.t.map((_, i) => i).sort((a, b) => candles.t[a] - candles.t[b]);
  const seen = new Set<number>();
  const order: number[] = [];
  const candle: { time: UTCTimestamp; open: number; high: number; low: number; close: number }[] = [];
  const line: { time: UTCTimestamp; value: number }[] = [];
  const volume: { time: UTCTimestamp; value: number; color: string }[] = [];
  let prevClose = 0;
  for (const i of idx) {
    const time = candles.t[i] as UTCTimestamp;
    if (seen.has(time)) continue;
    seen.add(time);
    order.push(i);
    candle.push({ time, open: candles.o[i], high: candles.h[i], low: candles.l[i], close: candles.c[i] });
    line.push({ time, value: candles.c[i] });
    volume.push({ time, value: candles.v[i] || 0, color: candles.c[i] >= prevClose ? `${UP}55` : `${DOWN}55` });
    prevClose = candles.c[i];
  }
  return { candle, line, volume, order };
}

export function AdvancedChart({ candles, chartType, indicators, showVolume, isDark, intraday, fitKey, events }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType>[]>([]);
  const priceSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const lastFitKey = useRef<string>('');

  // ── Create chart once ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      autoSize: true,
      ...chartTheme(isDark),
    });
    chartRef.current = chart;
    return () => {
      chart.remove();
      chartRef.current = null;
      priceSeriesRef.current = null;
      seriesRef.current = [];
    };
    // create once; theme handled in its own effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Theme ────────────────────────────────────────────────────────────────
  useEffect(() => {
    chartRef.current?.applyOptions(chartTheme(isDark));
  }, [isDark]);

  // ── Axis time format per range ─────────────────────────────────────────────
  useEffect(() => {
    chartRef.current?.timeScale().applyOptions({ timeVisible: intraday, secondsVisible: false });
  }, [intraday]);

  // Pre-compute candle-derived point sets (independent of chart type).
  const points = useMemo(() => (candles ? pricePoints(candles) : null), [candles]);

  // ── Rebuild all series on data / type / indicator / volume change ───────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !candles || !points) return;

    // Tear down previous series.
    for (const s of seriesRef.current) {
      try { chart.removeSeries(s); } catch { /* already gone */ }
    }
    seriesRef.current = [];
    priceSeriesRef.current = null;

    // ── Price series ──
    let priceSeries: ISeriesApi<SeriesType>;
    if (chartType === 'candles') {
      priceSeries = chart.addSeries(CandlestickSeries, {
        upColor: UP, downColor: DOWN, borderVisible: false, wickUpColor: UP, wickDownColor: DOWN,
      });
      (priceSeries as ISeriesApi<'Candlestick'>).setData(points.candle);
    } else if (chartType === 'area') {
      priceSeries = chart.addSeries(AreaSeries, {
        lineColor: UP, topColor: `${UP}40`, bottomColor: `${UP}00`, lineWidth: 2,
      });
      (priceSeries as ISeriesApi<'Area'>).setData(points.line);
    } else {
      priceSeries = chart.addSeries(LineSeries, { color: UP, lineWidth: 2 });
      (priceSeries as ISeriesApi<'Line'>).setData(points.line);
    }
    priceSeriesRef.current = priceSeries;
    seriesRef.current.push(priceSeries);

    // ── Event markers (past earnings), snapped to the nearest candle ──
    if (events?.length) {
      const times = points.order.map((i) => candles.t[i]);
      if (times.length) {
        const first = times[0];
        const last = times[times.length - 1];
        const used = new Set<number>();
        const markers: SeriesMarker<Time>[] = [];
        for (const ev of events) {
          if (ev.ts < first - 86_400 || ev.ts > last + 86_400) continue;
          let best = times[0];
          let bestDiff = Infinity;
          for (const t of times) {
            const diff = Math.abs(t - ev.ts);
            if (diff < bestDiff) { bestDiff = diff; best = t; }
          }
          if (used.has(best)) continue;
          used.add(best);
          const color = ev.beat === null ? '#f59e0b' : ev.beat ? UP : DOWN;
          markers.push({ time: best as Time, position: 'belowBar', color, shape: 'circle', text: 'E' });
        }
        markers.sort((a, b) => (a.time as number) - (b.time as number));
        if (markers.length) createSeriesMarkers(priceSeries, markers);
      }
    }

    // ── Volume (overlay at the bottom of the price pane) ──
    if (showVolume) {
      const vol = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' }, priceScaleId: '', lastValueVisible: false, priceLineVisible: false,
      });
      vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      (vol as ISeriesApi<'Histogram'>).setData(points.volume);
      seriesRef.current.push(vol);
    }

    // ── Indicators ──
    let nextPane = 1; // pane 0 is price; oscillators get their own panes
    for (const inst of indicators) {
      const def = getIndicatorDef(inst.type);
      if (!def) continue;
      const params = { ...inst.params };
      let output: Record<string, (number | null)[]>;
      try { output = def.compute(candles, params); } catch { continue; }

      const paneIndex = def.group === 'oscillator' ? nextPane++ : 0;
      let refTarget: ISeriesApi<SeriesType> | null = null;

      for (const line of def.lines) {
        const raw = output[line.key];
        if (!raw) continue;
        // Build in the same sorted/deduped order as the price series.
        const data = points.order
          .map((i) => ({ time: candles.t[i] as UTCTimestamp, value: raw[i] }))
          .filter((d) => d.value != null) as { time: UTCTimestamp; value: number }[];
        if (!data.length) continue;
        const color = line.primary && inst.color ? inst.color : line.color;

        if (line.histogram) {
          const hist = chart.addSeries(HistogramSeries, {
            priceLineVisible: false, lastValueVisible: false,
          }, paneIndex);
          hist.setData(data.map((d) => ({ ...d, color: d.value >= 0 ? `${UP}99` : `${DOWN}99` })));
          seriesRef.current.push(hist);
          refTarget ??= hist;
        } else {
          const ls = chart.addSeries(LineSeries, {
            color,
            lineWidth: (line.width ?? 2) as 1 | 2 | 3 | 4,
            lineStyle: line.dashed ? LineStyle.Dashed : LineStyle.Solid,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: def.group === 'oscillator',
          }, paneIndex);
          ls.setData(data);
          seriesRef.current.push(ls);
          refTarget ??= ls;
        }
      }

      // Oscillator reference levels (e.g. RSI 30/70) on the pane's first series.
      if (refTarget && def.refLines) {
        for (const ref of def.refLines) {
          refTarget.createPriceLine({
            price: ref.value, color: ref.color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true,
          });
        }
      }
    }

    // Give the price pane more height than oscillator panes.
    const panes = chart.panes();
    if (panes.length > 1) {
      panes[0].setStretchFactor(3);
      for (let i = 1; i < panes.length; i++) panes[i].setStretchFactor(1);
    }

    if (lastFitKey.current !== fitKey) {
      chart.timeScale().fitContent();
      lastFitKey.current = fitKey;
    }
  }, [candles, points, chartType, indicators, showVolume, fitKey, events]);

  // ── Alt+R / Option+R → reset zoom (TradingView parity) ──────────────────────
  // `e.code === 'KeyR'` is layout/OS-independent (Mac Option+R mangles `e.key`).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.code !== 'KeyR') return;
      const chart = chartRef.current;
      if (!chart) return;
      e.preventDefault();
      // Re-enable vertical autoscale on every pane, then fit the time axis.
      for (const s of seriesRef.current) {
        try { s.priceScale().applyOptions({ autoScale: true }); } catch { /* detached */ }
      }
      chart.timeScale().fitContent();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Crosshair OHLC legend (written imperatively to avoid re-renders) ─────────
  useEffect(() => {
    const chart = chartRef.current;
    const legend = legendRef.current;
    if (!chart || !legend) return;
    const handler = (param: Parameters<Parameters<IChartApi['subscribeCrosshairMove']>[0]>[0]) => {
      const ps = priceSeriesRef.current;
      if (!ps || !param.time || !param.seriesData.has(ps)) { legend.textContent = ''; return; }
      const d = param.seriesData.get(ps) as { open?: number; high?: number; low?: number; close?: number; value?: number };
      if (d.open != null && d.close != null) {
        const up = d.close >= d.open;
        legend.innerHTML =
          `<span class="text-muted-foreground">O</span> ${d.open.toFixed(2)} ` +
          `<span class="text-muted-foreground">H</span> ${d.high?.toFixed(2)} ` +
          `<span class="text-muted-foreground">L</span> ${d.low?.toFixed(2)} ` +
          `<span class="text-muted-foreground">C</span> <span style="color:${up ? UP : DOWN}">${d.close.toFixed(2)}</span>`;
      } else if (d.value != null) {
        legend.innerHTML = `<span class="text-muted-foreground">Price</span> ${d.value.toFixed(2)}`;
      }
    };
    chart.subscribeCrosshairMove(handler);
    return () => chart.unsubscribeCrosshairMove(handler);
  }, []);

  // Active indicator legend chips (top-left, below OHLC).
  const indicatorLegend = indicators.map((inst) => {
    const def = getIndicatorDef(inst.type);
    const color = inst.color ?? def?.lines.find((l) => l.primary)?.color ?? def?.lines[0]?.color ?? '#888';
    return { id: inst.id, label: indicatorLabel(inst), color };
  });

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {/* Crosshair OHLC + indicator legend */}
      <div className="pointer-events-none absolute left-3 top-2 z-10 space-y-1">
        <div ref={legendRef} className="text-xs font-medium tabular-nums text-foreground/90" />
        {indicatorLegend.length > 0 && (
          <div className="flex flex-col gap-0.5">
            {indicatorLegend.map((l) => (
              <span key={l.id} className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: l.color }} />
                {l.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
