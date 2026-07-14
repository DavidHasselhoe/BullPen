import type { CompleteQuizAnswers } from './pending-onboarding';

/**
 * Builds the personalized reveal-screen summary from the 4 quiz answers.
 * Deliberately pure string templating — no AI call — this runs at the exact
 * moment we're asking someone to sign up, so it must be instant.
 *
 * Each axis contributes its own independent sentence/clause rather than a
 * fully cross-multiplied 3x3x3x4 combinatorial template, which would read
 * like mad-libs. Experience + horizon carry the main two sentences (the most
 * narratively useful axes); risk gets a short clause; goal drives the
 * closing "first stop" line.
 */

const EXPERIENCE_CLAUSE: Record<CompleteQuizAnswers['experience_level'], string> = {
  beginner: "Since you're just getting started, we'll keep things in plain English and define terms as they come up.",
  intermediate: "You've got some experience, so we'll give you useful context without over-explaining the basics.",
  advanced: "You know your way around the market, so we'll show full data and terminology — no hand-holding.",
};

const HORIZON_CLAUSE: Record<CompleteQuizAnswers['investment_horizon'], string> = {
  short: "With a shorter timeframe in mind, we'll help you track what's moving today and why.",
  medium: "With a multi-year outlook, we'll help you separate real signal from short-term noise.",
  long: 'Playing the long game, we’ll spotlight durable fundamentals over daily headlines.',
};

const RISK_CLAUSE: Record<CompleteQuizAnswers['risk_profile'], string> = {
  conservative: "We'll flag risk clearly before we flag opportunity.",
  balanced: "We'll balance upside with a clear-eyed view of the risk.",
  aggressive: "We won't shy away from higher-conviction, higher-volatility ideas.",
};

const GOAL_CLOSING: Record<CompleteQuizAnswers['investing_goal'], string> = {
  growth: 'First stop: growth stocks worth watching.',
  dividends: 'First stop: dividend and income ideas.',
  learning: 'First stop: a few Academy lessons to build your footing.',
  tracking: 'First stop: adding what you already own.',
};

export interface RevealSummary {
  /** 2-3 sentence paragraph combining experience + horizon + risk clauses. */
  paragraph: string;
  /** Short goal-driven closing line, rendered as a separate, lighter line. */
  closing: string;
}

export function buildRevealSummary(answers: CompleteQuizAnswers): RevealSummary {
  const paragraph = [
    EXPERIENCE_CLAUSE[answers.experience_level],
    HORIZON_CLAUSE[answers.investment_horizon],
    RISK_CLAUSE[answers.risk_profile],
  ].join(' ');

  return {
    paragraph,
    closing: GOAL_CLOSING[answers.investing_goal],
  };
}
