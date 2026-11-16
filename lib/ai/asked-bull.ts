/**
 * Whether this browser has ever sent Bull a message. Home's Ask Bull chips
 * introduce Bull until then. Device-local on purpose: it only decides whether
 * one line of intro copy shows.
 */
const KEY = 'bp.askedBull';
const EVENT = 'bp:asked-bull';

export function markAskedBull(): void {
  try {
    if (localStorage.getItem(KEY)) return;
    localStorage.setItem(KEY, '1');
    window.dispatchEvent(new Event(EVENT));
  } catch { /* storage unavailable: the intro just stays */ }
}

export function hasAskedBull(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** For useSyncExternalStore: same-tab writes fire EVENT, other tabs fire 'storage'. */
export function subscribeAskedBull(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}
