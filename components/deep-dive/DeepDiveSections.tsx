'use client';

/**
 * Layer 3 of the Deep Dive report: everything that isn't the verdict or the
 * three things, grouped into named sections and collapsed by default.
 *
 * The model chooses which blocks to emit and in what order, so this groups a
 * flat, model-ordered array into fixed sections rather than rendering it in
 * sequence. Model order is preserved *within* each section.
 *
 * Collapsing is deliberately not tied to experience level. Not scrolling past
 * four screens of tables to reach the part you came for is an information
 * architecture win for everyone, not a beginner accommodation. Experience
 * level controls how dense the prose is (it's a generation-time input to the
 * prompt), never whether the page has structure.
 *
 * Sections carry their identity in a tinted icon chip rather than a tinted
 * body or a colored left rail. The body stays neutral because the bull/bear
 * cards and risk severity badges bring their own emerald/red and a tinted
 * container behind them muddies both. The rail was the first thing tried and
 * was dropped on review: a thick colored edge on a rounded card is one of the
 * most recognizable tells of generated UI, which is the opposite of what this
 * product wants to read as. The chip matches the icon wells already used on
 * the tools and compare page headers.
 */

import { AlertTriangle, BarChart3, CalendarClock, FileText, Scale, Target } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import { BlockRenderer } from './blocks';
import type { Block, DeepDiveReport as Report } from '@/lib/ai/deep-dive/schema';

type SectionKey = 'financials' | 'bullBear' | 'risks' | 'catalysts' | 'analysts' | 'more';

/**
 * Keyed on Block['type'] rather than a lookup with a default, so adding a
 * block type to the schema without deciding where it belongs is a compile
 * error instead of a block silently vanishing into "More".
 */
const BLOCK_SECTION: Record<Block['type'], SectionKey> = {
  kpi_grid: 'financials',
  bar_chart: 'financials',
  segment_bars: 'financials',
  kv_table: 'financials',
  metric_table: 'financials',
  bull_bear: 'bullBear',
  risks: 'risks',
  catalysts: 'catalysts',
  price_targets: 'analysts',
  prose: 'more',
};

interface SectionSpec {
  label: string;
  icon: typeof BarChart3;
  iconColor: string;
  /** Fill behind the icon. Carries the section's identity on its own. */
  chip: string;
}

/** Render order. Deliberately fixed, not model order. */
const SECTION_ORDER: SectionKey[] = ['financials', 'bullBear', 'risks', 'catalysts', 'analysts', 'more'];

const SECTIONS: Record<SectionKey, SectionSpec> = {
  financials: {
    label: 'Financials',
    icon: BarChart3,
    iconColor: 'text-blue-500',
    chip: 'bg-blue-500/10',
  },
  bullBear: {
    label: 'Bull vs bear',
    icon: Scale,
    iconColor: 'text-foreground/70',
    chip: 'bg-foreground/[0.07]',
  },
  risks: {
    label: 'Risks',
    icon: AlertTriangle,
    iconColor: 'text-red-500',
    chip: 'bg-red-500/10',
  },
  catalysts: {
    label: 'Catalysts',
    icon: CalendarClock,
    iconColor: 'text-amber-500',
    chip: 'bg-amber-500/10',
  },
  analysts: {
    label: 'Analyst views',
    icon: Target,
    iconColor: 'text-muted-foreground',
    chip: 'bg-muted',
  },
  more: {
    label: 'More detail',
    icon: FileText,
    iconColor: 'text-muted-foreground',
    chip: 'bg-muted',
  },
};

/**
 * A short hint of what's inside, so the reader can decide whether a section is
 * worth opening without opening it. Plain words over analyst register: a bull
 * and bear count reads as "for" and "against".
 */
function summarize(key: SectionKey, blocks: Block[]): string | null {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  switch (key) {
    case 'risks': {
      const n = blocks.reduce((acc, b) => acc + (b.type === 'risks' ? b.items.length : 0), 0);
      return n > 0 ? plural(n, 'risk', 'risks') : null;
    }
    case 'catalysts': {
      const n = blocks.reduce((acc, b) => acc + (b.type === 'catalysts' ? b.items.length : 0), 0);
      return n > 0 ? plural(n, 'catalyst', 'catalysts') : null;
    }
    case 'bullBear': {
      let bull = 0;
      let bear = 0;
      for (const b of blocks) {
        if (b.type === 'bull_bear') {
          bull += b.bull.length;
          bear += b.bear.length;
        }
      }
      return bull + bear > 0 ? `${bull} for, ${bear} against` : null;
    }
    case 'analysts': {
      const n = blocks.reduce((acc, b) => acc + (b.type === 'price_targets' ? b.items.length : 0), 0);
      return n > 0 ? plural(n, 'target', 'targets') : null;
    }
    case 'financials':
      return blocks.length > 0 ? plural(blocks.length, 'chart', 'charts and tables') : null;
    default:
      return null;
  }
}

export function DeepDiveSections({ report, currentPrice }: { report: Report; currentPrice?: number | null }) {
  const grouped = new Map<SectionKey, Block[]>();
  for (const block of report.blocks) {
    const key = BLOCK_SECTION[block.type];
    const bucket = grouped.get(key);
    if (bucket) bucket.push(block);
    else grouped.set(key, [block]);
  }

  const present = SECTION_ORDER.filter((k) => (grouped.get(k)?.length ?? 0) > 0);
  if (present.length === 0) return null;

  return (
    // Multiple, not single: someone comparing the bull case against the risks
    // shouldn't have one snap shut to read the other.
    <Accordion type="multiple" className="space-y-2.5">
      {present.map((key) => {
        const spec = SECTIONS[key];
        const blocks = grouped.get(key)!;
        const Icon = spec.icon;
        const hint = summarize(key, blocks);

        return (
          <AccordionItem
            key={key}
            value={key}
            className="rounded-xl border border-border/50 last:border-b"
          >
            <AccordionTrigger className="px-4 py-3 hover:no-underline">
              <span className="flex items-center gap-2.5">
                <span
                  className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', spec.chip)}
                  aria-hidden
                >
                  <Icon className={cn('h-4 w-4', spec.iconColor)} />
                </span>
                <span className="text-sm font-semibold text-foreground">{spec.label}</span>
                {hint && (
                  <span className="text-[11px] font-normal text-muted-foreground/80">{hint}</span>
                )}
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="space-y-7 border-t border-border/30 pt-4">
                {blocks.map((block, i) => (
                  <BlockRenderer key={i} block={block} currentPrice={currentPrice} />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
