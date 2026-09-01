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
 * Whatever real data the trigger site already had on screen at the moment
 * the paywall fired — e.g. the ticker/day-change on a stock page, or the
 * real symbols in a portfolio about to be risk-analyzed. Every field is
 * optional and only the fields a given feature's preview knows how to use
 * get threaded through (see getAiPaywallConfig below) — passing more than a
 * feature needs is harmless, it's just ignored.
 */
export interface PaywallPreviewContext {
  ticker?: string;
  companyName?: string;
  changePercent?: number;
  tickers?: string[];
}

/**
 * Rich paywall content (preview + value stack) for every AI-generation gate
 * in the app, keyed by the `featureName` each caller already passes to
 * AiPaywallDialog. Unmapped feature names fall back to the plain generic
 * dialog — see AiPaywallDialog.tsx. Keys are literal English feature-name
 * identifiers used for lookup, not UI copy — never translate them.
 *
 * Each list leads with the feature actually being unlocked, then two of the
 * other flagship Pro benefits — never claims "unlimited" for a feature that
 * still carries a Pro soft cap (Deep Dive).
 *
 * `context` lets each preview open with something real instead of a fully
 * fabricated example — the actual ticker/% a free user was just looking at,
 * not a fictional NVDA. What stays fabricated (a risk score, a verdict, the
 * actual reasoning text) stays fabricated on purpose: those are exactly the
 * paid answer, and showing a real-looking number there would misrepresent
 * a result the user hasn't actually paid to generate.
 */
export function getAiPaywallConfig(t: TFunction, context?: PaywallPreviewContext): Record<string, PaywallConfig> {
  return {
    'Portfolio Risk Analysis': {
      benefits: [
        { icon: ShieldAlert, text: t('paywallBenefitUnlimitedRiskAnalysis') },
        { icon: Zap, text: t('paywallBenefitDailyBrief') },
        { icon: Sparkles, text: t('paywallBenefitWhyToday') },
      ],
      preview: <RiskAnalysisPaywallPreview tickers={context?.tickers} />,
    },
    'Why Today': {
      benefits: [
        { icon: Sparkles, text: t('paywallBenefitUnlimitedWhyToday') },
        { icon: ShieldAlert, text: t('paywallBenefitUnlimitedRiskAnalysis') },
        { icon: Zap, text: t('paywallBenefitDailyBrief') },
      ],
      preview: <WhyTodayPaywallPreview ticker={context?.ticker} changePercent={context?.changePercent} />,
    },
    'Ask Bull': {
      benefits: [
        { icon: MessageCircle, text: t('paywallBenefitAskBullChat') },
        { icon: Sparkles, text: t('paywallBenefitWhyToday') },
        { icon: Zap, text: t('paywallBenefitDailyBrief') },
      ],
      preview: <AskBullPaywallPreview ticker={context?.ticker} />,
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
      preview: <DeepDivePaywallPreview ticker={context?.ticker} companyName={context?.companyName} />,
    },
  };
}
