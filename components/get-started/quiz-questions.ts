import type { ExperienceLevel, InvestingGoal, InvestmentHorizon, RiskProfile } from '@/lib/onboarding/pending-onboarding';

export interface QuizOption<V extends string> {
  value: V;
  label: string;
  description?: string;
}

export interface QuizQuestion<K extends string, V extends string> {
  key: K;
  headline: string;
  /** The single word rendered in the Instrument Serif accent, per DESIGN.md's One Serif Word Rule. */
  accentWord: string;
  options: QuizOption<V>[];
}

export const EXPERIENCE_QUESTION: QuizQuestion<'experience_level', ExperienceLevel> = {
  key: 'experience_level',
  headline: 'How would you describe your investing',
  accentWord: 'experience?',
  options: [
    { value: 'beginner', label: 'New to investing', description: 'Plain-English explanations for everything' },
    { value: 'intermediate', label: 'Some experience', description: 'Balanced view with helpful context' },
    { value: 'advanced', label: 'Experienced investor', description: 'Full data and financial terminology' },
  ],
};

export const RISK_QUESTION: QuizQuestion<'risk_profile', RiskProfile> = {
  key: 'risk_profile',
  headline: 'If your portfolio dropped 20% in a month, what',
  accentWord: 'would you do?',
  options: [
    { value: 'conservative', label: 'Sell to limit losses', description: 'Protecting what you have comes first' },
    { value: 'balanced', label: 'Hold and wait it out', description: 'Ride out the swings, stay the course' },
    { value: 'aggressive', label: 'Buy more at the lower price', description: 'A dip is an opportunity' },
  ],
};

export const HORIZON_QUESTION: QuizQuestion<'investment_horizon', InvestmentHorizon> = {
  key: 'investment_horizon',
  headline: "What's your investing",
  accentWord: 'timeframe?',
  options: [
    { value: 'short', label: 'Less than 1 year' },
    { value: 'medium', label: '1–5 years' },
    { value: 'long', label: '5+ years' },
  ],
};

export const GOAL_QUESTION: QuizQuestion<'investing_goal', InvestingGoal> = {
  key: 'investing_goal',
  headline: "What are you most",
  accentWord: 'interested in?',
  options: [
    { value: 'growth', label: 'Growth stocks' },
    { value: 'dividends', label: 'Dividends & income' },
    { value: 'learning', label: 'Learning the basics' },
    { value: 'tracking', label: 'Tracking what I own' },
  ],
};

export const QUIZ_QUESTIONS = [
  EXPERIENCE_QUESTION,
  RISK_QUESTION,
  HORIZON_QUESTION,
  GOAL_QUESTION,
] as const;

/** Look up the human-readable label for a given question key + selected value — used by the reveal screen's recap chips. */
export function describeAnswer(key: (typeof QUIZ_QUESTIONS)[number]['key'], value: string): string {
  const question = QUIZ_QUESTIONS.find((q) => q.key === key);
  const option = question?.options.find((o) => o.value === value);
  return option?.label ?? value;
}
