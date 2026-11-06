import { isPro, tierFromUser } from '@/lib/billing/tier';

/** Saved screens a Free account keeps. Migration 196's INSERT policy holds the same number. */
export const FREE_SAVED_SCREENS = 1;

/** The universes a saved screen's daily alert can check. */
export const SAVED_SCREEN_SCOPES = ['sp500', 'nasdaq100', 'dow30', 'all'] as const;
export type SavedScreenScope = (typeof SAVED_SCREEN_SCOPES)[number];

export function isSavedScreenScope(v: unknown): v is SavedScreenScope {
  return typeof v === 'string' && (SAVED_SCREEN_SCOPES as readonly string[]).includes(v);
}

/** Same inputs as tierFromUser, so POST /api/screener/filter-presets and the Save button agree (admins included). */
export function canCreateSavedScreen(
  currentCount: number,
  accountTier: number | null,
  role: string | null,
  proBonusUntil?: string | null,
): boolean {
  if (isPro(tierFromUser(accountTier, role, proBonusUntil))) return true;
  return currentCount < FREE_SAVED_SCREENS;
}

/** Daily new-match alerts are Pro. The API, the toggle and the cron all ask this. */
export function canUseScreenAlerts(accountTier: number | null, role: string | null, proBonusUntil?: string | null): boolean {
  return isPro(tierFromUser(accountTier, role, proBonusUntil));
}

/** What the saved-screen API returns per row (never last_matches: it can be hundreds of tickers). */
export const PRESET_COLUMNS = 'id, name, filters, position, scope, alert_enabled, checked_at, created_at, updated_at';
