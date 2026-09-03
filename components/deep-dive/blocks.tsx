'use client';

/**
 * Renderers for each DeepDiveReport block type. Data-driven: BlockRenderer
 * switches on block.type. Visual language matches the rest of BullPen
 * (Card surfaces, tabular-nums, emerald/amber/red signal colors).
 */

import { useState, type ComponentType } from 'react';
import { useTheme } from 'next-themes';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Minus, Check, X, AlertTriangle, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { tierBadgeClass, tierTextClass, type Tier } from '@/lib/ui/severity-tiers';
import { RangeBar } from '@/components/viz/RangeBar';
import { glossaryText } from '@/components/ui/GlossaryText';
import type { Block, BullBearPoint } from '@/lib/ai/deep-dive/schema';

/** Trailing muted citation, e.g. "(10-Q Q3 2026)". Skips rendering when absent. */
function Source({ source }: { source?: string }) {
  if (!source) return null;
  return <span className="ml-1.5 text-[10px] text-muted-foreground/60 whitespace-nowrap">({source})</span>;
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

type Tone = 'positive' | 'negative' | 'neutral' | undefined;

function toneText(tone: Tone): string {
  if (tone === 'positive') return 'text-emerald-500';
  if (tone === 'negative') return 'text-red-500';
  return 'text-foreground';
}
function toneBadge(tone: Tone): string {
  if (tone === 'positive') return 'bg-emerald-500/10 text-emerald-500';
  if (tone === 'negative') return 'bg-red-500/10 text-red-500';
  return 'bg-muted text-muted-foreground';
}

/** Deep Dive's `severity` (low/medium/high) onto the shared status/severity
 *  tier system — matches Risk Analysis's own severity badges exactly,
 *  rather than the block system's previous ad hoc red/amber/muted set. */
function severityTier(severity: 'low' | 'medium' | 'high'): Tier {
  if (severity === 'high') return 'risk';
  if (severity === 'medium') return 'caution';
  return 'info';
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <h3 className="mb-3 text-sm font-semibold text-foreground">
      {children}
    </h3>
  );
}

const SEGMENT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#6b7280'];

// ─── kpi_grid ───────────────────────────────────────────────────────────────

function KpiGrid({ block }: { block: Extract<Block, { type: 'kpi_grid' }> }) {
  const seen = new Set<string>();
  return (
    <section>
      <SectionTitle>{block.title}</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
        {block.items.map((item, i) => (
          <div key={i} className="rounded-xl border border-border/60 bg-muted/20 p-3">
            <p className="text-[11px] text-muted-foreground leading-tight">
              {glossaryText(item.label, seen)}
            </p>
            <p className={cn('text-xl font-bold tabular-nums mt-1 leading-none', toneText(item.tone))}>
              {item.value}
            </p>
            {item.sublabel && (
              <p className="text-[11px] text-muted-foreground/85 mt-1 leading-tight">
                {glossaryText(item.sublabel, seen)}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── bar_chart ────────────────────────────────────────────────────────────────

function BarChartBlock({ block }: { block: Extract<Block, { type: 'bar_chart' }> }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const axis = isDark ? '#52525b' : '#a1a1aa';
  const unit = block.unit ?? '';

  const fmt = (v: number) => {
    const s = Math.abs(v) >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : String(v);
    return unit.startsWith('$') ? `$${s}${unit.slice(1)}` : `${s}${unit}`;
  };

  return (
    <section>
      <SectionTitle>{block.title}</SectionTitle>
      <div className="flex items-center gap-4 mb-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[#3b82f6]" /> Actual</span>
        {block.series.some((s) => s.projected) && (
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[#3b82f6]/40" /> Guidance / projected</span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={block.series} margin={{ top: 18, right: 4, bottom: 0, left: 4 }}>
          <XAxis dataKey="label" tick={{ fill: axis, fontSize: 11 }} axisLine={false} tickLine={false} dy={4} />
          <YAxis hide domain={[0, 'auto']} />
          <Tooltip
            cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)' }}
            formatter={(v) => [fmt(Number(v)), ''] as [string, string]}
            labelStyle={{ color: 'var(--muted-foreground)' }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {block.series.map((s, i) => (
              <Cell key={i} fill="#3b82f6" fillOpacity={s.projected ? 0.4 : 1} />
            ))}
            <LabelList dataKey="value" position="top" formatter={(v) => fmt(Number(v))} style={{ fill: axis, fontSize: 10 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </section>
  );
}

// ─── segment_bars ───────────────────────────────────────────────────────────

function SegmentBars({ block }: { block: Extract<Block, { type: 'segment_bars' }> }) {
  const max = Math.max(...block.items.map((i) => i.pct), 1);
  return (
    <section>
      <SectionTitle>{block.title}</SectionTitle>
      <div className="space-y-2.5">
        {block.items.map((item, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="text-xs text-foreground w-28 shrink-0 truncate">{item.label}</span>
            <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${(item.pct / max) * 100}%`, background: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }}
              />
            </div>
            <span className="text-xs font-semibold tabular-nums text-foreground w-12 text-right shrink-0">
              {Math.round(item.pct)}%
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── kv_table ─────────────────────────────────────────────────────────────────

function KvTable({ block }: { block: Extract<Block, { type: 'kv_table' }> }) {
  const seen = new Set<string>();
  return (
    <section>
      <SectionTitle>{block.title}</SectionTitle>
      <div className="divide-y divide-border/40">
        {block.rows.map((row, i) => (
          <div key={i} className="flex items-center justify-between gap-3 py-2.5">
            <span className="text-sm text-muted-foreground">{glossaryText(row.label, seen)}</span>
            <span className="flex items-center gap-2 shrink-0">
              <span className="text-sm font-medium tabular-nums text-foreground text-right">{row.value}</span>
              {row.badge && (
                <span className={cn('text-[11px] font-bold px-1.5 py-0.5 rounded leading-none', toneBadge(row.badge.tone))}>
                  {row.badge.text}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── price_targets ────────────────────────────────────────────────────────────

function PriceTargets({ block }: { block: Extract<Block, { type: 'price_targets' }> }) {
  const hasRange = block.low != null && block.high != null && block.high > block.low;
  const anchor = block.currentPrice ?? block.mean ?? (hasRange ? (block.low! + block.high!) / 2 : undefined);
  // Wide analyst disagreement is a signal worth flagging on its own, not just
  // a table row — computed client-side (more reliable than trusting the
  // model to self-assess "is this a wide spread").
  const spreadPct = hasRange && anchor ? (block.high! - block.low!) / anchor : 0;
  const wideDisagreement = spreadPct > 0.4;

  return (
    <section>
      <SectionTitle>{block.title ?? 'Analyst price targets'}</SectionTitle>
      {block.current && (
        <p className="text-xs text-muted-foreground mb-2">Current: <span className="text-foreground font-medium tabular-nums">{block.current}</span></p>
      )}
      {hasRange && (
        <div className="mb-3">
          <RangeBar
            low={block.low!}
            high={block.high!}
            current={block.currentPrice}
            srLabel={`Analyst price target range: $${block.low} to $${block.high}${block.currentPrice ? `, current price $${block.currentPrice}` : ''}`}
          />
          {wideDisagreement && (
            <p className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
              Analysts sharply disagree on this one. That wide a range usually means real uncertainty about the growth story, not just noise.
            </p>
          )}
        </div>
      )}
      <div className="divide-y divide-border/40">
        {block.items.map((item, i) => (
          <div key={i} className="flex items-center justify-between gap-3 py-2">
            <span className="text-sm text-muted-foreground">{item.source}</span>
            <span className={cn('text-sm font-semibold tabular-nums', toneText(item.tone))}>{item.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── metric_table ─────────────────────────────────────────────────────────────

function MetricTable({ block }: { block: Extract<Block, { type: 'metric_table' }> }) {
  const seen = new Set<string>();
  return (
    <section>
      <SectionTitle>{block.title}</SectionTitle>
      <div className="divide-y divide-border/40">
        {block.rows.map((row, i) => (
          <div key={i} className="flex items-baseline justify-between gap-3 py-2.5">
            <span className="text-sm text-muted-foreground shrink-0">{glossaryText(row.label, seen)}</span>
            <span className="flex items-baseline gap-2 min-w-0 justify-end text-right">
              <span className="text-sm font-medium tabular-nums text-foreground">{row.value}</span>
              {row.note && (
                <span className="text-[11px] text-muted-foreground/80 truncate">
                  {glossaryText(row.note, seen)}
                  <Source source={row.source} />
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── bull_bear ──────────────────────────────────────────────────────────────

// Length heuristic rather than measured overflow — good enough to catch the
// full-paragraph bullets this is meant to fix; upgrade to ref-measured
// overflow if it under/over-triggers in practice.
const LONG_BULLET_THRESHOLD = 120;

function BulletItem({
  point, seen, icon: Icon, iconColor,
}: {
  point: BullBearPoint;
  seen: Set<string>;
  icon: ComponentType<{ className?: string }>;
  iconColor: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const text = typeof point === 'string' ? point : point.text;
  const source = typeof point === 'string' ? undefined : point.source;
  const long = text.length > LONG_BULLET_THRESHOLD;

  return (
    <li className="flex gap-2 text-sm text-foreground/90">
      <Icon className={cn('h-3.5 w-3.5 mt-0.5 shrink-0', iconColor)} />
      <span className="min-w-0">
        <span className={cn(!expanded && long && 'line-clamp-2')}>
          {glossaryText(text, seen)}
          <Source source={source} />
        </span>
        {long && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="block text-[11px] text-muted-foreground/70 hover:text-foreground mt-0.5"
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </span>
    </li>
  );
}

function BullBear({ block }: { block: Extract<Block, { type: 'bull_bear' }> }) {
  // One Set shared across both columns — a term explained once in the bull
  // case doesn't need a second tooltip if it recurs in the bear case.
  const seen = new Set<string>();
  return (
    <section>
      <SectionTitle>{block.title ?? 'Bull vs Bear'}</SectionTitle>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-emerald-500 mb-2">
            <TrendingUp className="h-3.5 w-3.5" /> Bull case
          </p>
          <ul className="space-y-1.5">
            {block.bull.map((point, i) => (
              <BulletItem key={i} point={point} seen={seen} icon={Check} iconColor="text-emerald-500" />
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.04] p-4">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-red-500 mb-2">
            <TrendingDown className="h-3.5 w-3.5" /> Bear case
          </p>
          <ul className="space-y-1.5">
            {block.bear.map((point, i) => (
              <BulletItem key={i} point={point} seen={seen} icon={X} iconColor="text-red-500" />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

// ─── catalysts ────────────────────────────────────────────────────────────────

function Catalysts({ block }: { block: Extract<Block, { type: 'catalysts' }> }) {
  const seen = new Set<string>();
  return (
    <section>
      <SectionTitle>{block.title ?? 'Catalysts to watch'}</SectionTitle>
      <div className="space-y-2.5">
        {block.items.map((item, i) => {
          const Icon = item.direction === 'down' ? ArrowDownRight : item.direction === 'up' ? ArrowUpRight : Minus;
          const color = item.direction === 'down' ? 'text-red-500' : item.direction === 'up' ? 'text-emerald-500' : 'text-muted-foreground';
          return (
            <div key={i} className="flex gap-3">
              <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', color)} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {glossaryText(item.title, seen)}
                  {item.timeframe && <span className="ml-2 text-[11px] text-muted-foreground/80 font-normal">{item.timeframe}</span>}
                </p>
                {item.detail && (
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {glossaryText(item.detail, seen)}
                    <Source source={item.source} />
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── risks ────────────────────────────────────────────────────────────────────

function Risks({ block }: { block: Extract<Block, { type: 'risks' }> }) {
  const seen = new Set<string>();
  return (
    <section>
      <SectionTitle>{block.title ?? 'Key risks'}</SectionTitle>
      <div className="space-y-2.5">
        {block.items.map((item, i) => (
          <div key={i} className="flex gap-3">
            <AlertTriangle className={cn('h-4 w-4 mt-0.5 shrink-0', item.severity ? tierTextClass(severityTier(item.severity)) : 'text-amber-500')} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                {glossaryText(item.title, seen)}
                {item.severity && (
                  <span className={cn('shrink-0 rounded-full border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide', tierBadgeClass(severityTier(item.severity)))}>
                    {item.severity}
                  </span>
                )}
              </p>
              {item.detail && (
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {glossaryText(item.detail, seen)}
                  <Source source={item.source} />
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── prose (minimal, safe markdown) ────────────────────────────────────────────

function renderInline(text: string, seen: Set<string>): React.ReactNode[] {
  // Split on **bold** — bold segments render as-is (unchanged), plain
  // segments get the jargon-tooltip sweep. No HTML injection either way.
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>
      : <span key={i}>{glossaryText(part, seen)}</span>
  );
}

function Prose({ block }: { block: Extract<Block, { type: 'prose' }> }) {
  const lines = block.markdown.split('\n').map((l) => l.trim()).filter(Boolean);
  const seen = new Set<string>();
  return (
    <section>
      <SectionTitle>{block.title ?? 'Bottom line'}</SectionTitle>
      <div className="space-y-2 text-sm text-foreground/90 leading-relaxed">
        {lines.map((line, i) =>
          line.startsWith('- ') || line.startsWith('• ') ? (
            <div key={i} className="flex gap-2">
              <span className="text-muted-foreground/85 mt-0.5">•</span>
              <span>{renderInline(line.replace(/^[-•]\s+/, ''), seen)}</span>
            </div>
          ) : (
            <p key={i}>{renderInline(line, seen)}</p>
          )
        )}
      </div>
    </section>
  );
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export function BlockRenderer({ block }: { block: Block }) {
  switch (block.type) {
    case 'kpi_grid':      return <KpiGrid block={block} />;
    case 'bar_chart':     return <BarChartBlock block={block} />;
    case 'segment_bars':  return <SegmentBars block={block} />;
    case 'kv_table':      return <KvTable block={block} />;
    case 'price_targets': return <PriceTargets block={block} />;
    case 'metric_table':  return <MetricTable block={block} />;
    case 'bull_bear':     return <BullBear block={block} />;
    case 'catalysts':     return <Catalysts block={block} />;
    case 'risks':         return <Risks block={block} />;
    case 'prose':         return <Prose block={block} />;
    default:              return null;
  }
}
