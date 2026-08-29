import type { ReactNode } from 'react';
import type { TFunction } from 'i18next';
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
 * plain generic dialog — see AiPaywallDialog.tsx. Keys are literal English
 * feature-name identifiers used for lookup, not UI copy — never translate them.
 *
 * Each list leads with the feature actually being unlocked, then two of the
 * other flagship Pro benefits — never claims "unlimited" for a feature that
 * still carries a Pro soft cap (Deep Dive).
 */
export function getAiPaywallConfig(t: TFunction): Record<string, PaywallConfig> {
  return {
    'Portfolio Risk Analysis': {
      benefits: [
        { icon: ShieldAlert, text: t('paywallBenefitUnlimitedRiskAnalysis') },
        { icon: Zap, text: t('paywallBenefitDailyBrief') },
        { icon: Sparkles, text: t('paywallBenefitWhyToday') },
      ],
      preview: <RiskAnalysisPaywallPreview />,
    },
    'Why Today': {
      benefits: [
        { icon: Sparkles, text: t('paywallBenefitUnlimitedWhyToday') },
        { icon: ShieldAlert, text: t('paywallBenefitUnlimitedRiskAnalysis') },
        { icon: Zap, text: t('paywallBenefitDailyBrief') },
      ],
      preview: <WhyTodayPaywallPreview />,
    },
    'Ask Bull': {
      benefits: [
        { icon: MessageCircle, text: t('paywallBenefitAskBullChat') },
        { icon: Sparkles, text: t('paywallBenefitWhyToday') },
        { icon: Zap, text: t('paywallBenefitDailyBrief') },
      ],
      preview: <AskBullPaywallPreview />,
    },
    'Portfolio Builder': {
      benefits: [
        { icon: Wand2, text: t('paywallBenefitPortfolioBuilderRuns') },
        { icon: ShieldAlert, text: t('paywallBenefitUnlimitedRiskAnalysis') },
        { icon: Zap, text: t('paywallBenefitDailyBrief') },
      ],
      preview: <PortfolioBuilderPaywallPreview />,
    },
    'Deep Dive': {
      benefits: [
        { icon: FileSearch, text: t('paywallBenefitDeepDiveReports') },
        { icon: ShieldAlert, text: t('paywallBenefitUnlimitedRiskAnalysis') },
        { icon: Zap, text: t('paywallBenefitDailyBrief') },
      ],
      preview: <DeepDivePaywallPreview />,
    },
  };
}
