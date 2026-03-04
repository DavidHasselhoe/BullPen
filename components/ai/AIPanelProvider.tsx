'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import { AISidePanel } from './AISidePanel';

interface AIPanelContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
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
    };
  return ctx;
}

export function AIPanelProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  return (
    <AIPanelContext.Provider value={{ isOpen, open, close, toggle }}>
      {children}
      <AISidePanel open={isOpen} onClose={close} />
    </AIPanelContext.Provider>
  );
}
