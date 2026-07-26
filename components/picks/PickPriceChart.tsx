'use client';

import { useMemo } from 'react';
import {
  Area, AreaChart, CartesianGrid, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { fmtPct, fmtPrice } from './pick-format';

interface CandleResponse {
  success: boolean;
  candles: { t: number[]; c: number[] } | null;
}

interface Point { t: number; label: string; price: number }

/**
 * The pick's own price line with the call marked on it.
 *
 * Deliberately shows a window that starts well before the pick date: seeing
 * only the part after the call makes any pick look like a decisive moment.
 * The line is coloured by performance since entry, and the entry itself is a
 * labelled reference line rather than a legend entry, so the reader can see at
 * a glance whether the call landed before or after the move.
 */
export function PickPriceChart({
  candles, entryPrice, pickDate, currentPrice,
}: {
  candles: CandleResponse['candles'];
  entryPrice: number | null;
  pickDate: string;
  currentPrice: number | null;
}) {
  const data = useMemo<Point[]>(() => {
    if (!candles || candles.t.length === 0) return [];
    return candles.t.map((t, i) => ({
      t,
      price: candles.c[i],
      label: new Date(t * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    }));
  }, [candles]);

  if (data.length < 2) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-xl border border-border/50 bg-card/40 px-6 text-center text-sm text-muted-foreground">
        Price history isn&apos;t available for this one right now.
      </div>
    );
  }

  // Until an entry price exists there is no gain or loss to report, so the line
  // stays achromatic. Painting it emerald would spend the signal colour on
  // nothing — DESIGN.md reserves it for actual financial direction.
  const tone: 'up' | 'down' | 'neutral' =
    entryPrice == null || currentPrice == null
      ? 'neutral'
      : currentPrice >= entryPrice
        ? 'up'
        : 'down';
  const color =
    tone === 'neutral' ? 'var(--picks-benchmark)'
      : tone === 'up' ? 'var(--picks-up)'
        : 'var(--picks-down)';
  const gradientId = `pick-price-${tone}`;

  // The reference line is drawn on the category axis, so it needs the label of
  // the first candle at or after the pick date.
  const entryLabel = data.find(
    (p) => new Date(p.t * 1000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) >= pickDate,
  )?.label;

  return (
    <div className="rounded-xl border border-border/50 bg-card/40 px-1 py-3">
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 12, right: 16, bottom: 0, left: 8 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.2} />
              <stop offset="90%" stopColor={color} stopOpacity={0.02} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke="var(--chart-grid)" strokeOpacity={0.35} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: 'var(--chart-label)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            dy={6}
            minTickGap={44}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: 'var(--chart-label)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={48}
            domain={['auto', 'auto']}
            tickFormatter={(v: number) => `$${fmtPrice(v)}`}
          />

          {entryLabel && (
            <ReferenceLine
              x={entryLabel}
              stroke="var(--chart-label)"
              strokeDasharray="3 3"
              strokeOpacity={0.8}
              label={{
                value: 'Picked',
                position: 'insideTopLeft',
                fill: 'var(--chart-label)',
                fontSize: 10,
              }}
            />
          )}
          {entryPrice != null && (
            <ReferenceLine y={entryPrice} stroke="var(--chart-label)" strokeDasharray="2 4" strokeOpacity={0.5} />
          )}

          <Tooltip
            cursor={{ stroke: 'var(--chart-crosshair)', strokeOpacity: 0.35, strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as Point;
              const since = entryPrice != null && entryPrice > 0
                ? (p.price / entryPrice - 1) * 100
                : null;
              return (
                <div className="space-y-1 rounded-lg border border-border bg-background/95 px-3 py-2 text-xs shadow-lg backdrop-blur-sm">
                  <p className="font-medium text-foreground">
                    {new Date(p.t * 1000).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </p>
                  <p className="font-mono tabular-nums text-foreground/90">${fmtPrice(p.price)}</p>
                  {since != null && (
                    <p className="text-muted-foreground">
                      <span className="font-mono tabular-nums">{fmtPct(since)}</span> since the pick
                    </p>
                  )}
                </div>
              );
            }}
          />

          <Area
            type="monotone"
            dataKey="price"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
