export type CookieConsentValue = 'accepted' | 'rejected';

interface StoredConsent {
  value: CookieConsentValue;
  ts: number;
}

const STORAGE_KEY = 'bullpen_cookie_consent';

export function getStoredConsent(): CookieConsentValue | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredConsent>;
    if (parsed.value === 'accepted' || parsed.value === 'rejected') return parsed.value;
    return null;
  } catch {
    return null;
  }
}

export function setStoredConsent(value: CookieConsentValue): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: StoredConsent = { value, ts: Date.now() };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage unavailable (private browsing, quota, disabled) — fail
    // silently; the banner will simply reappear next visit.
  }
}
