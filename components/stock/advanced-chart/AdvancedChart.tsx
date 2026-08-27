'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { cn } from '@/lib/utils';

export type ChartTool = 'none' | 'measure' | 'alert';

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
  /** This user's buy/sell markers (when the Trades toggle is on). */
  transactions?: { ts: number; kind: 'buy' | 'sell' }[];
  /** Unix seconds: bars before this are warm-up only (not rendered). */
  displayFrom?: number;
  /** Live price — updates the last (intraday) bar in place. */
  livePrice?: number;
  /** Active interaction tool. */
  tool?: ChartTool;
  /** Called with a clicked price level when the alert tool is active. */
  onCreateAlert?: (price: number) => void;
}

const UP = '#22c55e';
const DOWN = '#ef4444';

interface LastBar { time: UTCTimestamp; open: number; high: number; low: number; close: number }
interface MeasureBox {
  left: number; top: number; width: number; height: number;
  up: boolean; dAbs: number; dPct: number; bars: number; days: number;
}

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
 *
 * When `displayFrom` is set, bars before it are used only as indicator warm-up
 * (they advance prevClose) but are NOT rendered — so a 200-period SMA can cover
 * the whole visible window without the chart showing extra history.
 */
function pricePoints(candles: OHLCV, displayFrom?: number) {
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
    if (displayFrom == null || time >= displayFrom) {
      order.push(i);
      candle.push({ time, open: candles.o[i], high: candles.h[i], low: candles.l[i], close: candles.c[i] });
      line.push({ time, value: candles.c[i] });
      volume.push({ time, value: candles.v[i] || 0, color: candles.c[i] >= prevClose ? `${UP}55` : `${DOWN}55` });
    }
    prevClose = candles.c[i];
  }
  return { candle, line, volume, order };
}

export function AdvancedChart({
  candles, chartType, indicators, showVolume, isDark, intraday, fitKey, events, transactions, displayFrom,
  livePrice, tool = 'none', onCreateAlert,
}: Props) {
  const { t } = useTranslation('stock');
  const containerRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType>[]>([]);
  const priceSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const lastBarRef = useRef<LastBar | null>(null);
  const lastFitKey = useRef<string>('');
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [measureBox, setMeasureBox] = useState<MeasureBox | null>(null);
  const [alertHoverPrice, setAlertHoverPrice] = useState<{ y: number; price: number } | null>(null);
  // Per-line series lookup for the hover legend — keyed by `${instanceId}-${lineKey}`
  // so a multi-line indicator (BB, MACD) gets one value per line, not one per instance.
  const lineSeriesRef = useRef<Map<string, ISeriesApi<SeriesType>>>(new Map());
  const lineValueElsRef = useRef<Map<string, HTMLSpanElement>>(new Map());
  const [legendLines, setLegendLines] = useState<{ id: string; lineKey: string; label: string; color: string }[]>([]);

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
  // Indicators still compute over the full `candles` (incl. warm-up); only the
  // rendered bars are limited to >= displayFrom.
  const points = useMemo(() => (candles ? pricePoints(candles, displayFrom) : null), [candles, displayFrom]);

  // ── Rebuild all series on data / type / indicator / volume change ───────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !candles || !points) return;

    for (const s of seriesRef.current) {
      try { chart.removeSeries(s); } catch { /* already gone */ }
    }
    seriesRef.current = [];
    priceSeriesRef.current = null;
    lineSeriesRef.current.clear();

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
    lastBarRef.current = points.candle.length ? points.candle[points.candle.length - 1] : null;

    // Markers (earnings events + SMA crosses) are all set in one call at the end.
    const markers: SeriesMarker<Time>[] = [];

    // ── Event markers (past earnings), snapped to the nearest candle ──
    if (events?.length) {
      const times = points.order.map((i) => candles.t[i]);
      if (times.length) {
        const first = times[0];
        const last = times[times.length - 1];
        const used = new Set<number>();
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
      }
    }

    // ── Buy/sell markers, snapped to the nearest candle ──
    if (transactions?.length) {
      const times = points.order.map((i) => candles.t[i]);
      if (times.length) {
        const first = times[0];
        const last = times[times.length - 1];
        for (const tx of transactions) {
          if (tx.ts < first - 86_400 || tx.ts > last + 86_400) continue;
          let best = times[0];
          let bestDiff = Infinity;
          for (const t of times) {
            const diff = Math.abs(t - tx.ts);
            if (diff < bestDiff) { bestDiff = diff; best = t; }
          }
          markers.push({
            time: best as Time,
            position: tx.kind === 'buy' ? 'belowBar' : 'aboveBar',
            color: tx.kind === 'buy' ? UP : DOWN,
            shape: tx.kind === 'buy' ? 'arrowUp' : 'arrowDown',
            text: tx.kind === 'buy' ? t('advancedChartMarkerBuy') : t('advancedChartMarkerSell'),
          });
        }
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
    const smaOutputs: { period: number; values: (number | null)[] }[] = [];
    const newLegendLines: { id: string; lineKey: string; label: string; color: string }[] = [];
    for (const inst of indicators) {
      const def = getIndicatorDef(inst.type);
      if (!def) continue;
      const params = { ...inst.params };
      let output: Record<string, (number | null)[]>;
      try { output = def.compute(candles, params); } catch { continue; }

      if (inst.type === 'sma' && output.sma) {
        smaOutputs.push({ period: params.length ?? 0, values: output.sma });
      }

      const paneIndex = def.group === 'oscillator' ? nextPane++ : 0;
      let refTarget: ISeriesApi<SeriesType> | null = null;

      for (const line of def.lines) {
        const raw = output[line.key];
        if (!raw) continue;
        const data = points.order
          .map((i) => ({ time: candles.t[i] as UTCTimestamp, value: raw[i] }))
          .filter((d) => d.value != null) as { time: UTCTimestamp; value: number }[];
        if (!data.length) continue;
        const color = line.primary && inst.color ? inst.color : line.color;
        const rowKey = `${inst.id}-${line.key}`;

        if (line.histogram) {
          const hist = chart.addSeries(HistogramSeries, {
            priceLineVisible: false, lastValueVisible: false,
          }, paneIndex);
          hist.setData(data.map((d) => ({ ...d, color: d.value >= 0 ? `${UP}99` : `${DOWN}99` })));
          seriesRef.current.push(hist);
          lineSeriesRef.current.set(rowKey, hist);
          refTarget ??= hist;
        } else {
          const ls = chart.addSeries(LineSeries, {
            color,
            lineWidth: (line.width ?? 2) as 1 | 2 | 3 | 4,
            lineStyle: line.dashed ? LineStyle.Dashed : LineStyle.Solid,
            priceLineVisible: false,
            lastValueVisible: false,
            // A hover dot on every indicator line (not just oscillators) — the
            // same "here's exactly where this line is" affordance the price
            // series already has, now consistent across all of them.
            crosshairMarkerVisible: true,
          }, paneIndex);
          ls.setData(data);
          seriesRef.current.push(ls);
          lineSeriesRef.current.set(rowKey, ls);
          refTarget ??= ls;
        }
        const rowLabel = def.lines.length > 1 ? `${indicatorLabel(inst)} ${line.label}` : indicatorLabel(inst);
        newLegendLines.push({ id: inst.id, lineKey: line.key, label: rowLabel, color });
      }

      if (refTarget && def.refLines) {
        for (const ref of def.refLines) {
          refTarget.createPriceLine({
            price: ref.value, color: ref.color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true,
          });
        }
      }
    }

    // ── Golden / death cross markers (when two SMAs are present) ──
    if (smaOutputs.length >= 2) {
      const sorted = [...smaOutputs].sort((a, b) => a.period - b.period);
      const shortV = sorted[0].values;
      const longV = sorted[sorted.length - 1].values;
      let prevI = -1;
      for (const i of points.order) {
        if (prevI >= 0) {
          const ps = shortV[prevI], pl = longV[prevI], cs = shortV[i], cl = longV[i];
          if (ps != null && pl != null && cs != null && cl != null) {
            const prevDiff = ps - pl;
            const diff = cs - cl;
            if (prevDiff <= 0 && diff > 0) {
              markers.push({ time: candles.t[i] as Time, position: 'belowBar', color: UP, shape: 'arrowUp', text: 'GC' });
            } else if (prevDiff >= 0 && diff < 0) {
              markers.push({ time: candles.t[i] as Time, position: 'aboveBar', color: DOWN, shape: 'arrowDown', text: 'DC' });
            }
          }
        }
        prevI = i;
      }
    }

    if (markers.length) {
      markers.sort((a, b) => (a.time as number) - (b.time as number));
      createSeriesMarkers(priceSeries, markers);
    }

    const panes = chart.panes();
    if (panes.length > 1) {
      panes[0].setStretchFactor(3);
      for (let i = 1; i < panes.length; i++) panes[i].setStretchFactor(1);
    }

    if (lastFitKey.current !== fitKey) {
      chart.timeScale().fitContent();
      lastFitKey.current = fitKey;
    }

    setLegendLines(newLegendLines);
  }, [candles, points, chartType, indicators, showVolume, fitKey, events, transactions, t]);

  // ── Live last-bar update (intraday) ─────────────────────────────────────────
  useEffect(() => {
    if (livePrice == null) return;
    const ps = priceSeriesRef.current;
    const last = lastBarRef.current;
    if (!ps || !last) return;
    if (chartType === 'candles') {
      (ps as ISeriesApi<'Candlestick'>).update({
        time: last.time, open: last.open,
        high: Math.max(last.high, livePrice), low: Math.min(last.low, livePrice), close: livePrice,
      });
    } else {
      (ps as ISeriesApi<'Line'>).update({ time: last.time, value: livePrice });
    }
  }, [livePrice, chartType]);

  // ── Alt+R / Option+R → reset zoom (TradingView parity) ──────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.code !== 'KeyR') return;
      const chart = chartRef.current;
      if (!chart) return;
      e.preventDefault();
      for (const s of seriesRef.current) {
        try { s.priceScale().applyOptions({ autoScale: true }); } catch { /* detached */ }
      }
      chart.timeScale().fitContent();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Crosshair OHLC + indicator-value legend (written imperatively to avoid
  //    re-renders — this fires on every pixel of mouse movement) ─────────────
  useEffect(() => {
    const chart = chartRef.current;
    const legend = legendRef.current;
    if (!chart || !legend) return;
    const clearIndicatorValues = () => {
      for (const el of lineValueElsRef.current.values()) el.textContent = '';
    };
    const handler = (param: Parameters<Parameters<IChartApi['subscribeCrosshairMove']>[0]>[0]) => {
      const ps = priceSeriesRef.current;
      if (!ps || !param.time || !param.seriesData.has(ps)) {
        legend.textContent = '';
        clearIndicatorValues();
        return;
      }
      const d = param.seriesData.get(ps) as { open?: number; high?: number; low?: number; close?: number; value?: number };
      if (d.open != null && d.close != null) {
        const up = d.close >= d.open;
        legend.innerHTML =
          `<span class="text-muted-foreground">O</span> ${d.open.toFixed(2)} ` +
          `<span class="text-muted-foreground">H</span> ${d.high?.toFixed(2)} ` +
          `<span class="text-muted-foreground">L</span> ${d.low?.toFixed(2)} ` +
          `<span class="text-muted-foreground">C</span> <span style="color:${up ? UP : DOWN}">${d.close.toFixed(2)}</span>`;
      } else if (d.value != null) {
        legend.innerHTML = `<span class="text-muted-foreground">${t('advancedChartPriceLabel')}</span> ${d.value.toFixed(2)}`;
      }

      for (const [key, series] of lineSeriesRef.current.entries()) {
        const el = lineValueElsRef.current.get(key);
        if (!el) continue;
        const ld = param.seriesData.get(series) as { value?: number } | undefined;
        el.textContent = ld?.value != null ? ld.value.toFixed(2) : '';
      }
    };
    chart.subscribeCrosshairMove(handler);
    return () => chart.unsubscribeCrosshairMove(handler);
  }, [t]);

  // Clear tool-specific overlay state when leaving that tool.
  useEffect(() => {
    if (tool !== 'measure') { setMeasureBox(null); dragRef.current = null; }
    if (tool !== 'alert') setAlertHoverPrice(null);
  }, [tool]);

  // ── Interaction overlay (measure + alert) ──────────────────────────────────
  function localXY(e: { clientX: number; clientY: number }) {
    const r = containerRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function computeBox(x1: number, y1: number, x2: number, y2: number): MeasureBox | null {
    const ps = priceSeriesRef.current;
    const chart = chartRef.current;
    if (!ps || !chart) return null;
    const p1 = ps.coordinateToPrice(y1);
    const p2 = ps.coordinateToPrice(y2);
    if (p1 == null || p2 == null) return null;
    const ts = chart.timeScale();
    const l1 = ts.coordinateToLogical(x1);
    const l2 = ts.coordinateToLogical(x2);
    const t1 = ts.coordinateToTime(x1) as number | null;
    const t2 = ts.coordinateToTime(x2) as number | null;
    const dAbs = (p2 as number) - (p1 as number);
    const dPct = p1 ? (dAbs / (p1 as number)) * 100 : 0;
    const bars = l1 != null && l2 != null ? Math.abs(Math.round((l2 as number) - (l1 as number))) : 0;
    const days = t1 != null && t2 != null ? Math.abs(t2 - t1) / 86_400 : 0;
    return {
      left: Math.min(x1, x2), top: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1),
      up: dAbs >= 0, dAbs, dPct, bars, days,
    };
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (tool !== 'measure') return;
    const { x, y } = localXY(e);
    dragRef.current = { x, y };
    setMeasureBox(null);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (tool === 'measure') {
      if (!dragRef.current) return;
      const { x, y } = localXY(e);
      setMeasureBox(computeBox(dragRef.current.x, dragRef.current.y, x, y));
      return;
    }
    if (tool === 'alert') {
      const { y } = localXY(e);
      const price = priceSeriesRef.current?.coordinateToPrice(y);
      setAlertHoverPrice(price != null ? { y, price: price as number } : null);
    }
  };
  const onPointerUp = () => { if (tool === 'measure') dragRef.current = null; };
  const onPointerLeave = () => { if (tool === 'alert') setAlertHoverPrice(null); };
  const onClick = (e: React.MouseEvent) => {
    if (tool !== 'alert' || !onCreateAlert) return;
    const { y } = localXY(e);
    const price = priceSeriesRef.current?.coordinateToPrice(y);
    if (price != null) onCreateAlert(price as number);
  };

  const span = measureBox
    ? measureBox.days >= 1 ? `${Math.round(measureBox.days)}d` : `${Math.round(measureBox.days * 24)}h`
    : '';

  // Reference price for the alert-tool hover badge's color (above current = bullish
  // alert, below = bearish) — same up/down comparison the modal makes when it turns
  // the clicked price into price_above/price_below. Neutral gray (not a third
  // accent color) for the rare case there's no reference price yet — DESIGN.md
  // reserves emerald/red as the only meaningful colors.
  const alertRefPrice = livePrice ?? lastBarRef.current?.close ?? null;
  const alertBadgeColor = alertHoverPrice && alertRefPrice != null
    ? (alertHoverPrice.price >= alertRefPrice ? UP : DOWN)
    : '#71717a';

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {/* Crosshair OHLC + indicator legend — indicator rows carry a value span
          that's blank at rest and filled in imperatively on crosshair move
          (see the subscribeCrosshairMove effect), same pattern as the OHLC
          line above it so hovering never triggers a React re-render. */}
      <div className="pointer-events-none absolute left-3 top-2 z-10 min-w-[132px] space-y-1">
        <div ref={legendRef} className="text-xs font-medium tabular-nums text-foreground/90" />
        {legendLines.length > 0 && (
          <div className="flex flex-col gap-0.5">
            {legendLines.map((l) => {
              const rowKey = `${l.id}-${l.lineKey}`;
              return (
                <span key={rowKey} className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: l.color }} />
                  <span className="truncate">{l.label}</span>
                  <span
                    ref={(el) => {
                      if (el) lineValueElsRef.current.set(rowKey, el);
                      else lineValueElsRef.current.delete(rowKey);
                    }}
                    className="ml-auto shrink-0 tabular-nums text-foreground/80"
                  />
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Tool hint */}
      {tool !== 'none' && (
        <div className="pointer-events-none absolute right-3 top-2 z-20 rounded-md bg-background/80 px-2 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur">
          {tool === 'measure' ? t('advancedChartMeasureHint') : t('advancedChartAlertHint')}
        </div>
      )}

      {/* Interaction capture layer (only intercepts when a tool is active) */}
      <div
        className={cn('absolute inset-0 z-20', tool === 'none' ? 'pointer-events-none' : 'cursor-crosshair')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        onClick={onClick}
      >
        {/* Alert-tool hover preview — a dashed line + price badge that tracks the
            cursor so the exact price about to be set is always visible before
            clicking. Colored against the last known price the same way the modal
            classifies the click as price_above/price_below. */}
        {tool === 'alert' && alertHoverPrice && (
          <>
            <div
              className="absolute left-0 right-0 border-t border-dashed"
              style={{ top: alertHoverPrice.y, borderColor: alertBadgeColor }}
            />
            <div
              className="absolute right-2 -translate-y-1/2 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-semibold tabular-nums text-white shadow-lg"
              style={{ top: alertHoverPrice.y, background: alertBadgeColor }}
            >
              {t('advancedChartSetAlertAt', { price: `$${alertHoverPrice.price.toFixed(2)}` })}
            </div>
          </>
        )}

        {measureBox && (
          <>
            <div
              className="absolute border"
              style={{
                left: measureBox.left, top: measureBox.top, width: measureBox.width, height: measureBox.height,
                background: measureBox.up ? `${UP}1f` : `${DOWN}1f`,
                borderColor: measureBox.up ? UP : DOWN,
              }}
            />
            <div
              className="absolute -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-semibold tabular-nums text-white shadow-lg"
              style={{
                left: measureBox.left + measureBox.width / 2,
                top: Math.max(0, measureBox.top - 34),
                background: measureBox.up ? UP : DOWN,
              }}
            >
              {measureBox.dAbs >= 0 ? '+' : ''}{measureBox.dAbs.toFixed(2)} ({measureBox.dPct >= 0 ? '+' : ''}{measureBox.dPct.toFixed(2)}%)
              <span className="ml-1.5 font-normal opacity-90">{t('advancedChartMeasureSummary', { bars: measureBox.bars, span })}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
