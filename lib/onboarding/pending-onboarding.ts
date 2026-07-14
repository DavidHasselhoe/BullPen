// Client-side staging for the pre-signup onboarding quiz. Answers are
// collected before an account exists, so they can't be written to
// public.users yet (RLS only allows a user to touch their own row, which
// doesn't exist pre-auth) — this module stages them until an account is
// created, then lib/onboarding/flush.ts writes them.

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type RiskProfile = 'conservative' | 'balanced' | 'aggressive';
export type InvestmentHorizon = 'short' | 'medium' | 'long';
export type InvestingGoal = 'growth' | 'dividends' | 'learning' | 'tracking';

export interface QuizAnswers {
  experience_level?: ExperienceLevel;
  risk_profile?: RiskProfile;
  investment_horizon?: InvestmentHorizon;
  investing_goal?: InvestingGoal;
}

export interface CompleteQuizAnswers {
  experience_level: ExperienceLevel;
  risk_profile: RiskProfile;
  investment_horizon: InvestmentHorizon;
  investing_goal: InvestingGoal;
}

const PENDING_KEY = 'bp.pendingOnboarding.v1';
const PROGRESS_KEY = 'bp.quizProgress.v1';
const PENDING_TTL_MS = 48 * 60 * 60 * 1000;

interface PendingOnboardingPayload extends CompleteQuizAnswers {
  version: 1;
  savedAt: string;
}

interface QuizProgressPayload {
  version: 1;
  step: number;
  answers: QuizAnswers;
}

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

// ── Completed answers awaiting a Supabase write ──────────────────────────────
// localStorage (not sessionStorage): must survive a same-device
// email-confirmation link that commonly opens in a new browser tab.

export function savePendingQuizAnswers(answers: CompleteQuizAnswers): void {
  if (!isBrowser()) return;
  const payload: PendingOnboardingPayload = { version: 1, savedAt: new Date().toISOString(), ...answers };
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(payload));
  } catch {
    // Storage unavailable (private browsing, quota) — the personalization
    // write just won't happen. Never block signup over this.
  }
}

export function readPendingQuizAnswers(): CompleteQuizAnswers | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingOnboardingPayload>;
    if (
      parsed.version !== 1 ||
      !parsed.savedAt ||
      !parsed.experience_level ||
      !parsed.risk_profile ||
      !parsed.investment_horizon ||
      !parsed.investing_goal
    ) {
      window.localStorage.removeItem(PENDING_KEY);
      return null;
    }
    const age = Date.now() - new Date(parsed.savedAt).getTime();
    if (Number.isNaN(age) || age > PENDING_TTL_MS) {
      window.localStorage.removeItem(PENDING_KEY);
      return null;
    }
    return {
      experience_level: parsed.experience_level,
      risk_profile: parsed.risk_profile,
      investment_horizon: parsed.investment_horizon,
      investing_goal: parsed.investing_goal,
    };
  } catch {
    return null;
  }
}

export function clearPendingQuizAnswers(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(PENDING_KEY);
  } catch {
    // ignore
  }
}

// ── In-progress quiz draft ───────────────────────────────────────────────────
// sessionStorage: only needs to survive a same-tab refresh, and should auto-
// clear on tab close rather than linger like localStorage would.

export function saveQuizProgress(step: number, answers: QuizAnswers): void {
  if (!isBrowser()) return;
  const payload: QuizProgressPayload = { version: 1, step, answers };
  try {
    window.sessionStorage.setItem(PROGRESS_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function readQuizProgress(): { step: number; answers: QuizAnswers } | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.sessionStorage.getItem(PROGRESS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<QuizProgressPayload>;
    if (parsed.version !== 1 || typeof parsed.step !== 'number' || !parsed.answers) return null;
    return { step: parsed.step, answers: parsed.answers };
  } catch {
    return null;
  }
}

export function clearQuizProgress(): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.removeItem(PROGRESS_KEY);
  } catch {
    // ignore
  }
}
