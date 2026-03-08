'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import { AISidePanel } from './AISidePanel';

export interface AIContext {
  tickers: string[];
  label?: string;
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
    };
  return ctx;
}

export function AIPanelProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [initialQuery, setInitialQuery] = useState<string | null>(null);
  const [aiContext, setAIContextState] = useState<AIContext | null>(null);

  const open = useCallback((opt?: OpenOptions) => {
    if (opt?.query) setInitialQuery(opt.query);
    if (opt?.context) setAIContextState(opt.context);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  const clearInitialQuery = useCallback(() => setInitialQuery(null), []);

  const setAIContext = useCallback((ctx: AIContext | null) => {
    setAIContextState(ctx);
  }, []);

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
        />
      </div>
    </AIPanelContext.Provider>
  );
}
