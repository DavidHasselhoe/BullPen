'use client';

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Custom fallback; defaults to a subtle "section failed to load" card */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Class-based error boundary for individual stock-page sections.
 *
 * Wrapping each dynamic-imported card (HealthScoreCard, FinancialsSection, etc.)
 * in this boundary ensures a crash in one section doesn't whitesceen the entire page.
 */
export class StockSectionBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // Non-fatal — log so it's visible in Vercel logs / browser console
    console.error('[StockSection crash]', error.message, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="mb-8 rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            This section couldn&apos;t load — try refreshing the page.
          </div>
        )
      );
    }
    return this.props.children;
  }
}
