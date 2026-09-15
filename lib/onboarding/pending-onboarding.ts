// Client-side staging for the pre-signup onboarding. Choices are made before
// an account exists, so they can't be written to Supabase yet (RLS only lets a
// user touch their own row). This module stages them; lib/onboarding/flush.ts
// writes them once the account exists.

export type ExplainStyle = 'plain' | 'market';

export interface StockPick {
  ticker: string;
  name: string;
}

export interface AlertChoices {
  price_alerts: boolean;
  upcoming_earnings: boolean;
  dividend_reminder: boolean;
}

export const DEFAULT_ALERTS: AlertChoices = {
  price_alerts: true,
  upcoming_earnings: true,
  dividend_reminder: true,
};

/** Everything chosen before signup, ready to be written. */
export interface PendingOnboarding {
  style: ExplainStyle;
  picks: StockPick[];
  alerts: AlertChoices;
}

/** In-progress flow state (style is unset until screen 1 is answered). */
export interface OnboardingDraft {
  style?: ExplainStyle;
  picks: StockPick[];
  alerts: AlertChoices;
}

const PENDING_KEY = 'bp.pendingOnboarding.v2';
const DRAFT_KEY = 'bp.onboardingDraft.v2';
// Keys from the old 4-question quiz. Removed on read so they can't linger.
const LEGACY_KEYS = ['bp.pendingOnboarding.v1'];
const LEGACY_SESSION_KEYS = ['bp.quizProgress.v1'];
const PENDING_TTL_MS = 48 * 60 * 60 * 1000;
const MAX_PICKS = 20;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

export function experienceLevelFor(style: ExplainStyle): 'beginner' | 'intermediate' {
  return style === 'plain' ? 'beginner' : 'intermediate';
}

/** Only the switches turned OFF are written: an unset notification key already means enabled. */
export function notificationOverrides(alerts: AlertChoices): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [key, on] of Object.entries(alerts)) if (!on) out[key] = false;
  return out;
}

function sanitizePicks(value: unknown): StockPick[] {
  if (!Array.isArray(value)) return [];
  const picks: StockPick[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const ticker = (item as StockPick)?.ticker;
    const name = (item as StockPick)?.name;
    if (typeof ticker !== 'string' || typeof name !== 'string') continue;
    const upper = ticker.trim().toUpperCase();
    if (!upper || seen.has(upper)) continue;
    seen.add(upper);
    picks.push({ ticker: upper, name });
    if (picks.length === MAX_PICKS) break;
  }
  return picks;
}

function sanitizeAlerts(value: unknown): AlertChoices | null {
  const v = value as Partial<AlertChoices> | null;
  if (
    !v ||
    typeof v.price_alerts !== 'boolean' ||
    typeof v.upcoming_earnings !== 'boolean' ||
    typeof v.dividend_reminder !== 'boolean'
  ) {
    return null;
  }
  return { price_alerts: v.price_alerts, upcoming_earnings: v.upcoming_earnings, dividend_reminder: v.dividend_reminder };
}

/** Pure parser (no storage access) so it can be tested. */
export function parsePendingOnboarding(raw: string | null, now: number): PendingOnboarding | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.version !== 2 || typeof parsed.savedAt !== 'string') return null;
    const age = now - new Date(parsed.savedAt).getTime();
    if (Number.isNaN(age) || age > PENDING_TTL_MS) return null;
    if (parsed.style !== 'plain' && parsed.style !== 'market') return null;
    const alerts = sanitizeAlerts(parsed.alerts);
    if (!alerts) return null;
    return { style: parsed.style, picks: sanitizePicks(parsed.picks), alerts };
  } catch {
    return null;
  }
}

// ── Completed choices awaiting a Supabase write (localStorage) ───────────────

export function savePendingOnboarding(p: PendingOnboarding): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ version: 2, savedAt: new Date().toISOString(), ...p })
    );
  } catch {
    // Storage unavailable. Never block signup over this.
  }
}

export function readPendingOnboarding(): PendingOnboarding | null {
  if (!isBrowser()) return null;
  try {
    for (const key of LEGACY_KEYS) window.localStorage.removeItem(key);
    const raw = window.localStorage.getItem(PENDING_KEY);
    const parsed = parsePendingOnboarding(raw, Date.now());
    if (raw && !parsed) window.localStorage.removeItem(PENDING_KEY);
    return parsed;
  } catch {
    return null;
  }
}

export function hasPendingOnboarding(): boolean {
  return readPendingOnboarding() !== null;
}

export function clearPendingOnboarding(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(PENDING_KEY);
  } catch {
    // ignore
  }
}

// ── In-progress draft (sessionStorage: survives a refresh, not a closed tab) ─

export function saveDraft(step: number, draft: OnboardingDraft): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ version: 2, step, draft }));
  } catch {
    // ignore
  }
}

export function readDraft(): { step: number; draft: OnboardingDraft } | null {
  if (!isBrowser()) return null;
  try {
    for (const key of LEGACY_SESSION_KEYS) window.sessionStorage.removeItem(key);
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version?: number; step?: unknown; draft?: Record<string, unknown> };
    if (parsed.version !== 2 || typeof parsed.step !== 'number' || !parsed.draft) return null;
    const style = parsed.draft.style === 'plain' || parsed.draft.style === 'market' ? parsed.draft.style : undefined;
    return {
      step: parsed.step,
      draft: {
        style,
        picks: sanitizePicks(parsed.draft.picks),
        alerts: sanitizeAlerts(parsed.draft.alerts) ?? DEFAULT_ALERTS,
      },
    };
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}
