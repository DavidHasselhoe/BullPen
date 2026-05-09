'use client';

import { useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Brain } from 'lucide-react';

interface Props {
  text: string;
  composing: boolean;
}

export function StreamingThoughts({ text, composing }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom as new content streams in
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [text]);

  return (
    <Card className="border-border/60 overflow-hidden">
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center gap-2 mb-3">
          <Brain className="h-4 w-4 text-primary animate-pulse" />
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-semibold">
            {composing ? 'Composing portfolio…' : 'Reasoning'}
          </span>
        </div>

        <div
          ref={scrollRef}
          className="relative max-h-[420px] overflow-y-auto rounded-md bg-muted/30 p-4 text-sm leading-relaxed text-foreground/85 font-mono scroll-smooth"
        >
          <div className="whitespace-pre-wrap break-words">
            {text || (
              <span className="text-muted-foreground italic">
                Decomposing the thesis into investable subsectors…
              </span>
            )}
            {!composing && (
              <span className="inline-block h-3.5 w-0.5 bg-foreground/60 animate-pulse ml-0.5 align-middle" />
            )}
          </div>
        </div>

        <p className="mt-3 text-[10px] text-muted-foreground/40 select-none text-center">
          Powered by Claude Sonnet 4.6 with extended thinking
        </p>
      </CardContent>
    </Card>
  );
}
