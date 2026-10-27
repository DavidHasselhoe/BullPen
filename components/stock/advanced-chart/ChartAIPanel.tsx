'use client';

import { lazy, Suspense, useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/use-auth';
import { useAiTerms } from '@/hooks/use-ai-terms';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { AuthGate } from '@/components/ai/AuthGate';
import { AiTermsGate } from '@/components/ai/AiTermsGate';
import type { ChartAction, ChartSnapshot } from './chart-context';

// Same chunk the side panel loads; fetched the first time this panel opens.
const BullpenChat = lazy(() => import('@/components/ai/BullpenChat').then((m) => ({ default: m.BullpenChat })));

interface Props {
  open: boolean;
  symbol: string;
  snapshot: ChartSnapshot;
  onAction: (action: ChartAction) => void | Promise<void>;
  onClose: () => void;
}

const PANEL_WIDTH = 400;

const spinner = (
  <div className="flex flex-1 items-center justify-center">
    <span className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
  </div>
);

/**
 * Ask Bull beside the fullscreen chart: the main BullpenChat with the chart's
 * view as context, which registers the chart tools server-side.
 */
export function ChartAIPanel({ open, symbol, snapshot, onAction, onClose }: Props) {
  const isMobile = useIsMobile();
  const { t } = useTranslation('stock');
  const { user, isLoading, isAuthenticated } = useAuth();
  const { hasAccepted: hasAcceptedAiTerms } = useAiTerms();
  const [hasOpened, setHasOpened] = useState(open);
  if (open && !hasOpened) setHasOpened(true);

  const ticker = symbol.toUpperCase();
  const starterPrompts = [
    t('chartAiStarterAnalyze'),
    t('chartAiStarterUptrend'),
    t('chartAiStarterAddSma'),
    t('chartAiStarterExplainRsi'),
  ];

  return (
    // Real flex sibling (not an overlay): width animates so the chart beside it
    // reflows via its autoSize ResizeObserver and keeps its price axis visible.
    // Always mounted, so the conversation survives closing and reopening the
    // panel while the chart stays open.
    <motion.aside
      initial={false}
      animate={{ width: open ? (isMobile ? '100%' : PANEL_WIDTH) : 0, opacity: open ? 1 : 0.4 }}
      transition={{ type: 'tween', duration: 0.22, ease: 'easeOut' }}
      inert={!open}
      className="relative z-20 h-full shrink-0 overflow-hidden border-l border-border/60 bg-background shadow-2xl"
      aria-hidden={!open}
      aria-label={t('chartAiPanelAriaLabel', { symbol: ticker })}
    >
      <div className="absolute inset-y-0 right-0 flex h-full flex-col" style={{ width: isMobile ? '100vw' : PANEL_WIDTH }}>
        <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-border/50 bg-muted/30 px-4">
          <div className="min-w-0 leading-tight">
            <p className="text-sm font-semibold text-foreground">{t('chartToolbarAskBull')}</p>
            <p className="text-xs text-muted-foreground">{t('chartAiAnalyzing', { symbol: ticker })}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('chartAiCloseAriaLabel')}
            className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:h-9 sm:w-9"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {isLoading ? spinner : !isAuthenticated ? <AuthGate /> : !hasAcceptedAiTerms ? <AiTermsGate /> : hasOpened && (
            <Suspense fallback={spinner}>
              <BullpenChat
                compact
                user={user}
                open={open}
                starterPrompts={starterPrompts}
                aiContext={{ tickers: [ticker], label: ticker, chart: snapshot }}
                onChartAction={onAction}
              />
            </Suspense>
          )}
        </div>
      </div>
    </motion.aside>
  );
}
