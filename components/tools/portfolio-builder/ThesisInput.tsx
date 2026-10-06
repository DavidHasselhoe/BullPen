'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ArrowRight } from 'lucide-react';
import { ToolSectionTitle } from '@/components/tools/ToolHeader';
import { cn } from '@/lib/utils';
import { HoldingsContextToggle } from '@/components/holdings/HoldingsContextToggle';

interface Props {
  onSubmit: (thesis: string, useHoldings: boolean, excludeTickers: string[]) => void;
  disabled?: boolean;
}

export function ThesisInput({ onSubmit, disabled }: Props) {
  const { t } = useTranslation('tools');
  const EXAMPLES = [
    t('portfolioBuilderExample1'),
    t('portfolioBuilderExample2'),
    t('portfolioBuilderExample3'),
    t('portfolioBuilderExample4'),
    t('portfolioBuilderExample5'),
  ];
  const [thesis, setThesis] = useState('');
  const [useHoldings, setUseHoldings] = useState(false);
  const [excluded, setExcluded] = useState<string[]>([]);
  const tooShort = thesis.trim().length > 0 && thesis.trim().length < 10;
  const valid = thesis.trim().length >= 10 && thesis.trim().length <= 500;

  return (
    <div className="space-y-8">
      {/* The page header names the tool; this says how it works. */}
      <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
        {t('portfolioBuilderHeroDescription')}
      </p>

      {/* Input area */}
      <div className="rounded-2xl border border-border/70 bg-card shadow-sm overflow-hidden">
        <div className="p-5">
          <Textarea
            id="thesis-input"
            value={thesis}
            onChange={(e) => setThesis(e.target.value.slice(0, 500))}
            placeholder={t('portfolioBuilderPlaceholder')}
            rows={5}
            disabled={disabled}
            className="resize-none text-base leading-relaxed border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/80"
          />

          <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-3">
            <span className={cn('text-xs text-muted-foreground', tooShort && 'text-amber-500')}>
              {tooShort ? t('portfolioBuilderTooShort') : t('portfolioBuilderCharCount', { count: thesis.length })}
            </span>
            <Button
              onClick={() => onSubmit(thesis.trim(), useHoldings, useHoldings ? excluded : [])}
              disabled={!valid || disabled}
              size="sm"
              className="gap-2 px-4 rounded-full animate-ai-pill-shine"
            >
              {t('portfolioBuilderConstructButton')}
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <HoldingsContextToggle
        enabled={useHoldings}
        onChange={setUseHoldings}
        disabled={disabled}
        title={t('portfolioBuilderUseHoldingsTitle')}
        description={t('portfolioBuilderUseHoldingsDescription')}
        excluded={excluded}
        onExcludedChange={setExcluded}
      />

      {/* Examples */}
      <div>
        <ToolSectionTitle as="h3">{t('portfolioBuilderExampleThesesHeading')}</ToolSectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setThesis(ex)}
              disabled={disabled}
              className="text-left text-xs px-4 py-3 rounded-xl border border-border/50 text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed leading-relaxed"
            >
              {ex}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground text-center mt-6 select-none">
          {t('portfolioBuilderNotAdvice')}
        </p>
      </div>
    </div>
  );
}
