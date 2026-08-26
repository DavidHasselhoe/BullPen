'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  onSubmit: (thesis: string) => void;
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
  const tooShort = thesis.trim().length > 0 && thesis.trim().length < 10;
  const valid = thesis.trim().length >= 10 && thesis.trim().length <= 500;

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="text-center space-y-3 pt-4">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 mb-1">
          <Sparkles className="h-6 w-6 text-primary" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{t('portfolioBuilderTitle')}</h1>
        <p className="text-muted-foreground max-w-md mx-auto text-sm leading-relaxed">
          {t('portfolioBuilderHeroDescription')}
        </p>
      </div>

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
            <span className={cn('text-xs text-muted-foreground/85', tooShort && 'text-amber-500')}>
              {tooShort ? t('portfolioBuilderTooShort') : t('portfolioBuilderCharCount', { count: thesis.length })}
            </span>
            <Button
              onClick={() => onSubmit(thesis.trim())}
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

      {/* Examples */}
      <div>
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground/80 font-semibold mb-3 text-center">
          {t('portfolioBuilderExampleThesesHeading')}
        </p>
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
        <p className="text-[11px] text-muted-foreground/80 text-center mt-6 select-none">
          {t('portfolioBuilderNotAdvice')}
        </p>
      </div>
    </div>
  );
}
