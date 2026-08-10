'use client';

import { Compass } from 'lucide-react';

export function DiscoverHeader() {
  return (
    <header className="mb-8">
      <div className="mb-2 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Compass className="h-5 w-5 text-primary" aria-hidden />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Discover</h1>
      </div>
      <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
        A read on the market in ten seconds: where money moved today, how the mood
        is sitting, and a handful of companies worth a closer look.
      </p>
    </header>
  );
}
