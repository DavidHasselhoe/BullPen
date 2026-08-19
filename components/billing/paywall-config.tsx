import type { ReactNode } from 'react';
import {
  ShieldAlert, Zap, Sparkles, MessageCircle, Wand2, FileSearch,
} from 'lucide-react';
import type { PaywallBenefit } from './AiPaywallContent';
import { RiskAnalysisPaywallPreview } from './RiskAnalysisPaywallPreview';
import { WhyTodayPaywallPreview } from './WhyTodayPaywallPreview';
import { AskBullPaywallPreview } from './AskBullPaywallPreview';
import { PortfolioBuilderPaywallPreview } from './PortfolioBuilderPaywallPreview';
import { DeepDivePaywallPreview } from './DeepDivePaywallPreview';

export interface PaywallConfig {
  benefits: PaywallBenefit[];
  preview: ReactNode;
}

/**
 * Rich paywall content (fabricated preview + value stack) for every
 * AI-generation gate in the app, keyed by the `featureName` each caller
 * already passes to AiPaywallDialog. Unmapped feature names fall back to the
 * plain generic dialog — see AiPaywallDialog.tsx.
 *
 * Each list leads with the feature actually being unlocked, then two of the
 * other flagship Pro benefits — never claims "unlimited" for a feature that
 * still carries a Pro soft cap (Deep Dive).
 */
export const AI_PAYWALL_CONFIG: Record<string, PaywallConfig> = {
  'Portfolio Risk Analysis': {
    benefits: [
      { icon: ShieldAlert, text: 'Unlimited Portfolio Risk Analysis' },
      { icon: Zap, text: 'A daily market brief, in plain English' },
      { icon: Sparkles, text: 'See why your stocks moved with "Why Today?"' },
    ],
    preview: <RiskAnalysisPaywallPreview />,
  },
  'Why Today': {
    benefits: [
      { icon: Sparkles, text: 'Unlimited "Why Today?" explanations' },
      { icon: ShieldAlert, text: 'Unlimited Portfolio Risk Analysis' },
      { icon: Zap, text: 'A daily market brief, in plain English' },
    ],
    preview: <WhyTodayPaywallPreview />,
  },
  'Ask Bull': {
    benefits: [
      { icon: MessageCircle, text: 'Unlimited AI chat with Bull' },
      { icon: Sparkles, text: 'See why your stocks moved with "Why Today?"' },
      { icon: Zap, text: 'A daily market brief, in plain English' },
    ],
    preview: <AskBullPaywallPreview />,
  },
  'Portfolio Builder': {
    benefits: [
      { icon: Wand2, text: 'Unlimited AI Portfolio Builder runs' },
      { icon: ShieldAlert, text: 'Unlimited Portfolio Risk Analysis' },
      { icon: Zap, text: 'A daily market brief, in plain English' },
    ],
    preview: <PortfolioBuilderPaywallPreview />,
  },
  'Deep Dive': {
    benefits: [
      { icon: FileSearch, text: '25 AI Deep Dive reports a month' },
      { icon: ShieldAlert, text: 'Unlimited Portfolio Risk Analysis' },
      { icon: Zap, text: 'A daily market brief, in plain English' },
    ],
    preview: <DeepDivePaywallPreview />,
  },
};
