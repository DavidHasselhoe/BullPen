'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import { AISidePanel } from './AISidePanel';

export interface AIContext {
  tickers: string[];
  label?: string;
}

export interface WhyTodayPayload {
  ticker: string;
  price: number;
  change: number;
  changePct: number;
  /** Set by openWhyToday() at click time — used to key/remount the view on repeat clicks. */
  requestedAt: number;
}

interface OpenOptions {
  query?: string;
  context?: AIContext;
}

interface AIPanelContextValue {
  isOpen: boolean;
  open: (opt?: OpenOptions) => void;
  close: () => void;
  toggle: () => void;
  /** Initial query to send when opening (e.g. from command palette) */
  initialQuery: string | null;
  /** Page context for context-aware prompts (e.g. NVDA vs AMD) */
  aiContext: AIContext | null;
  /** Clear initial query after it has been consumed */
  clearInitialQuery: () => void;
  /** Set AI context from page (e.g. stock page, compare page) */
  setAIContext: (ctx: AIContext | null) => void;
  /**
   * Last ticker either AI surface (main chat or the in-chart assistant) discussed —
   * lets the other surface pick up the same company as a fallback when the page
   * itself doesn't supply an explicit context (e.g. Discover, Holdings, Screener).
   */
  lastTicker: string | null;
  /** Record that a ticker was just discussed, for the other AI surface to fall back to. */
  noteTicker: (ticker: string) => void;
  /** Currently displayed Why Today explanation, or null when the panel shows chat. */
  whyToday: WhyTodayPayload | null;
  /** Open the panel straight into a Why Today explanation for a snapshot quote. */
  openWhyToday: (payload: Omit<WhyTodayPayload, 'requestedAt'>) => void;
  /** Return the panel to the normal chat view (panel stays open). */
  closeWhyToday: () => void;
}

const AIPanelContext = createContext<AIPanelContextValue | null>(null);

export function useAIPanel() {
  const ctx = useContext(AIPanelContext);
  if (!ctx)
    return {
      isOpen: false,
      open: () => {},
      close: () => {},
      toggle: () => {},
      initialQuery: null,
      aiContext: null,
      clearInitialQuery: () => {},
      setAIContext: () => {},
      lastTicker: null,
      noteTicker: () => {},
      whyToday: null,
      openWhyToday: () => {},
      closeWhyToday: () => {},
    };
  return ctx;
}

export function AIPanelProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [initialQuery, setInitialQuery] = useState<string | null>(null);
  const [aiContext, setAIContextState] = useState<AIContext | null>(null);
  const [lastTicker, setLastTicker] = useState<string | null>(null);
  const [whyToday, setWhyToday] = useState<WhyTodayPayload | null>(null);

  const open = useCallback((opt?: OpenOptions) => {
    if (opt?.query) setInitialQuery(opt.query);
    if (opt?.context) setAIContextState(opt.context);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    // Closing the whole panel always drops back to chat — reopening later
    // (e.g. via a Sparkles "Ask AI" button elsewhere) shouldn't land the
    // user back in a stale Why Today view.
    setWhyToday(null);
  }, []);

  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  const clearInitialQuery = useCallback(() => setInitialQuery(null), []);

  const setAIContext = useCallback((ctx: AIContext | null) => {
    setAIContextState(ctx);
  }, []);

  const noteTicker = useCallback((ticker: string) => {
    setLastTicker(ticker.toUpperCase());
  }, []);

  const openWhyToday = useCallback((payload: Omit<WhyTodayPayload, 'requestedAt'>) => {
    setWhyToday({ ...payload, requestedAt: Date.now() });
    setIsOpen(true);
  }, []);

  const closeWhyToday = useCallback(() => setWhyToday(null), []);

  return (
    <AIPanelContext.Provider
      value={{
        isOpen,
        open,
        close,
        toggle,
        initialQuery,
        aiContext,
        clearInitialQuery,
        setAIContext,
        lastTicker,
        noteTicker,
        whyToday,
        openWhyToday,
        closeWhyToday,
      }}
    >
      <div className="flex h-screen min-h-full w-full overflow-x-hidden">
        <div className="flex-1 min-w-0 flex flex-col min-h-0 overflow-auto overflow-x-hidden scrollbar-hide">
          {children}
        </div>
        <AISidePanel
          open={isOpen}
          onClose={close}
          initialQuery={initialQuery}
          aiContext={aiContext}
          onConsumedQuery={clearInitialQuery}
          whyToday={whyToday}
          onCloseWhyToday={closeWhyToday}
        />
      </div>
    </AIPanelContext.Provider>
  );
}
