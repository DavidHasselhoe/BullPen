'use client';

import { useMemo } from 'react';
import { TickerPreview } from '@/components/company/TickerPreview';
import { useSymbolIndex } from '@/hooks/use-symbol-index';

/** A null catalogue means "not loaded yet", not "nothing is a ticker". */
export function isKnownTicker(ticker: string, known: Set<string> | null): boolean {
  return known === null || known.has(ticker);
}

/**
 * The catalogue as a lookup set, built once per reader rather than per section.
 * This is the same shared query every search surface uses (the global command
 * palette already fetches it during idle time), so it costs no extra request.
 */
export function useKnownTickers(): Set<string> | null {
  const index = useSymbolIndex();
  return useMemo(
    () => (index.length > 0 ? new Set(index.map((e) => e.ticker)) : null),
    [index],
  );
}

// Tokenize a line into <strong>, ticker link, and plain text in a single pass.
// Patterns: **bold text**, $TICKER
//
// `known` is the symbol catalogue every search surface already uses. The model
// writes $VIX, $SPX and $DJI the same way it writes $AAPL, but those are
// indices with no company, no page and no quote — linking them produced a dead
// link and an empty hover card. Anything the catalogue does not list renders as
// plain text. A null set means the catalogue has not loaded (or failed), where
// linking everything is better than stripping every link off the brief.
export function renderTickerText(text: string, known: Set<string> | null): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  const combined = /\*\*([^*]+)\*\*|\$([A-Z]{1,5})\b/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = combined.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    if (match[1] != null) {
      const boldContent = match[1];
      // Bold content that starts with a ticker, e.g. **$ANF** or **$ANF (Abercrombie & Fitch)**
      const tickerInBold = boldContent.match(/^(\$[A-Z]{1,5})\b([\s\S]*)?$/);
      if (tickerInBold) {
        const ticker = tickerInBold[1].slice(1);
        const rest = tickerInBold[2] ?? '';
        const linkEl = isKnownTicker(ticker, known) ? (
          <TickerPreview
            key={key++}
            ticker={ticker}
            className="font-mono font-semibold text-primary/85 hover:text-primary border-b border-primary/20 hover:border-primary/60 transition-colors"
          />
        ) : (
          <span key={key++} className="font-mono font-semibold text-foreground">
            ${ticker}
          </span>
        );
        if (rest) {
          nodes.push(
            <strong key={key++} className="font-semibold text-foreground">
              {linkEl}{rest}
            </strong>
          );
        } else {
          nodes.push(linkEl);
        }
      } else {
        nodes.push(
          <strong key={key++} className="font-semibold text-foreground">
            {boldContent}
          </strong>
        );
      }
    } else if (match[2]) {
      const ticker = match[2];
      nodes.push(
        isKnownTicker(ticker, known) ? (
          <TickerPreview
            key={key++}
            ticker={ticker}
            className="font-mono font-medium text-primary/85 hover:text-primary border-b border-primary/20 hover:border-primary/60 transition-colors"
          />
        ) : (
          <span key={key++} className="font-mono font-medium text-foreground/90">
            ${ticker}
          </span>
        )
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

/**
 * Model-written prose with every `$TICKER` it mentions turned into a hover
 * card, and **bold** honoured. For any surface that shows generated text
 * naming companies: the reader finds out what a company is without leaving
 * the paragraph they are reading.
 */
export function TickerText({ text }: { text: string }) {
  const known = useKnownTickers();
  return <>{renderTickerText(text, known)}</>;
}
