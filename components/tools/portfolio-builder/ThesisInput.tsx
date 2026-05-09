'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const EXAMPLES = [
  'AI inference infrastructure over the next 3 years',
  'European defense rearmament and sovereign tech independence',
  'Aging population: pharma, robotics, and elder care',
  'Energy transition bottlenecks: copper, uranium, grid',
  'Cybersecurity in a post-quantum world',
];

interface Props {
  onSubmit: (thesis: string) => void;
  disabled?: boolean;
}

export function ThesisInput({ onSubmit, disabled }: Props) {
  const [thesis, setThesis] = useState('');
  const tooShort = thesis.trim().length > 0 && thesis.trim().length < 10;
  const valid = thesis.trim().length >= 10 && thesis.trim().length <= 500;

  return (
    <Card className="border-border/60">
      <CardContent className="pt-6 pb-5">
        <label
          htmlFor="thesis-input"
          className="flex items-center gap-2 text-sm font-semibold text-foreground/85 mb-3"
        >
          <Sparkles className="h-4 w-4 text-primary" />
          What&apos;s your investment thesis?
        </label>

        <Textarea
          id="thesis-input"
          value={thesis}
          onChange={(e) => setThesis(e.target.value.slice(0, 500))}
          placeholder="e.g. AI inference chip design over the next 5 years, with exposure to memory and packaging."
          rows={4}
          disabled={disabled}
          className="resize-none text-base leading-relaxed"
        />

        <div className="mt-2 flex items-center justify-between text-xs">
          <span className={cn('text-muted-foreground', tooShort && 'text-amber-500')}>
            {tooShort ? 'Add a bit more detail (min 10 characters)' : `${thesis.length}/500`}
          </span>
        </div>

        <div className="mt-4 space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-semibold">
            Or try one of these
          </p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setThesis(ex)}
                disabled={disabled}
                className="text-xs px-3 py-1.5 rounded-full border border-border/60 text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/40 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <Button
            onClick={() => onSubmit(thesis.trim())}
            disabled={!valid || disabled}
            className="gap-2"
          >
            Construct Portfolio
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
