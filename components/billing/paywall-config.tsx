import type { ReactNode } from 'react';
import type { TFunction } from 'i18next';
import {
  ShieldAlert, Zap, Sparkles, MessageCircle, Wand2, FileSearch, Landmark, BellRing,
} from 'lucide-react';
import type { PaywallBenefit } from './AiPaywallContent';
import { QUOTAS } from '@/lib/billing/quotas';
import { RiskAnalysisPaywallPreview } from './RiskAnalysisPaywallPreview';
import { WhyTodayPaywallPreview } from './WhyTodayPaywallPreview';
import { AskBullPaywallPreview } from './AskBullPaywallPreview';
import { PortfolioBuilderPaywallPreview } from './PortfolioBuilderPaywallPreview';
import { DeepDivePaywallPreview } from './DeepDivePaywallPreview';
import { InstitutionalHoldingsPaywallPreview } from './InstitutionalHoldingsPaywallPreview';
import { AlertsPaywallPreview } from './AlertsPaywallPreview';

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
  fundName?: string;
  /** The fund's real top holdings (the public teaser), when the trigger has them. */
  fundTop?: { symbol: string | null; name: string; pct: number }[];
  /** Described alert condition, e.g. "New all-time high". */
  alertCondition?: string;
}

/**
 * Rich paywall content (preview + value stack) for every AI-generation gate
 * in the app, keyed by the `preview` each caller passes to AiPaywallDialog.
 * Keys are fixed identifiers, not UI copy. They used to be matched against the
 * translated `featureName`, so every non-English reader (and the builder's
 * "Risk analysis") got the plain generic dialog (fixed 2026-11-17).
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
export type PaywallPreviewKey =
  | 'Portfolio Risk Analysis' | 'Why Today' | 'Ask Bull' | 'Portfolio Builder'
  | 'Deep Dive' | 'Institutional Holdings' | 'Price Alerts';

export function getAiPaywallConfig(t: TFunction, context?: PaywallPreviewContext): Record<PaywallPreviewKey, PaywallConfig> {
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
        { icon: MessageCircle, text: t('paywallBenefitAskBullChat', { limit: QUOTAS.chat.proCap }) },
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
    'Institutional Holdings': {
      benefits: [
        // The latest quarter's holdings are free since 2026-11-17; Pro is the changes and the history.
        { icon: Landmark, text: t('paywallBenefitFundChanges') },
        { icon: ShieldAlert, text: t('paywallBenefitUnlimitedRiskAnalysis') },
        { icon: Zap, text: t('paywallBenefitDailyBrief') },
      ],
      preview: <InstitutionalHoldingsPaywallPreview fundName={context?.fundName} rows={context?.fundTop} />,
    },
    'Price Alerts': {
      benefits: [
        { icon: BellRing, text: t('paywallBenefitUnlimitedAlerts') },
        { icon: Sparkles, text: t('paywallBenefitWhyToday') },
        { icon: Zap, text: t('paywallBenefitDailyBrief') },
      ],
      preview: <AlertsPaywallPreview ticker={context?.ticker} companyName={context?.companyName} condition={context?.alertCondition} />,
    },
  };
}
