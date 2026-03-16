'use client';

import { useState, useEffect } from 'react';

/**
 * Returns the search shortcut key to display based on the user's OS.
 * - macOS: ⌘K
 * - Windows/Linux: Ctrl+K
 */
export function useSearchShortcut(): string {
  const [shortcut, setShortcut] = useState<string>(() => {
    if (typeof navigator === 'undefined') return 'Ctrl+K';
    return /Mac|iPod|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl+K';
  });

  useEffect(() => {
    setShortcut(/Mac|iPod|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl+K');
  }, []);

  return shortcut;
}
