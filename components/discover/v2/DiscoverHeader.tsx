'use client';

import { Compass } from 'lucide-react';

export function DiscoverHeader() {
  return (
    <header className="mb-8">
      <div className="flex items-center gap-3 mb-2">
        <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10 shrink-0">
          <Compass className="h-5 w-5 text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Discover</h1>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
        Browse the market by sector, theme, and asset class. Live prices stream in
        as the rails scroll — hover to pause, click any ticker to dig in.
      </p>
    </header>
  );
}
