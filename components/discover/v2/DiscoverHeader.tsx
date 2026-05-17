'use client';

import { Compass } from 'lucide-react';

export function DiscoverHeader() {
  return (
    <header className="mb-8">
      <div className="flex items-center gap-3 mb-2">
        <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-primary/10 border border-primary/20">
          <Compass className="h-4 w-4 text-primary" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
          Discover
        </h1>
      </div>
      <p className="text-sm text-muted-foreground/80 leading-relaxed max-w-2xl">
        Browse the market by sector, theme, and asset class. Live prices stream in
        as the rails scroll — hover to pause, click any ticker to dig in.
      </p>
    </header>
  );
}
