'use client';

import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useState } from 'react';

// cmdk and the palette's command registry only download on the first ⌘K /
// search click instead of shipping with every page.
const CommandPalette = lazy(() => import('./CommandPalette').then((m) => ({ default: m.CommandPalette })));

interface CommandPaletteContextValue {
  open: () => void;
  close: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export function useCommandPalette() {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) return { open: () => {}, close: () => {} };
  return ctx;
}

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  // Mount (and download) the palette on first open; keep it mounted after so
  // reopening is instant and its state persists.
  const [hasOpened, setHasOpened] = useState(false);

  const handleOpen = useCallback(() => {
    setHasOpened(true);
    setOpen(true);
  }, []);
  const handleClose = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setHasOpened(true);
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <CommandPaletteContext.Provider value={{ open: handleOpen, close: handleClose }}>
      {children}
      {hasOpened && (
        <Suspense fallback={null}>
          <CommandPalette open={open} onOpenChange={setOpen} />
        </Suspense>
      )}
    </CommandPaletteContext.Provider>
  );
}
