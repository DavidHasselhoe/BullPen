'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Wrench } from 'lucide-react';
import { TOOLS } from '@/lib/tools/tools-config';
import { cn } from '@/lib/utils';
import { useBackground } from '@/hooks/use-background';

export default function ToolsPage() {
  const { hasAnimatedBackground } = useBackground();

  return (
    <div className={cn('min-h-screen', hasAnimatedBackground ? '' : 'bg-background')}>
      <main className="container mx-auto max-w-5xl py-10 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Wrench className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">Investment Tools</h1>
              <p className="text-muted-foreground mt-1">
                Calculators, analyzers, and market insights at your fingertips
              </p>
            </div>
          </div>
        </div>

        {/* Tool Cards Grid */}
        <div className="grid gap-6 sm:grid-cols-2">
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            const isComingSoon = tool.status === 'coming-soon';

            return (
              <Link key={tool.id} href={tool.href}>
                <Card
                  className={cn(
                    'group transition-all duration-200 hover:border-primary/50 hover:shadow-lg',
                    isComingSoon && 'opacity-90'
                  )}
                >
                  <CardHeader className="flex flex-row items-start gap-4 pb-2">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted font-semibold group-hover:bg-primary/10 transition-colors">
                      <Icon className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">{tool.name}</CardTitle>
                        {isComingSoon && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            Coming soon
                          </span>
                        )}
                      </div>
                      <CardDescription className="text-sm leading-relaxed">
                        {tool.description}
                      </CardDescription>
                    </div>
                    <span className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity text-sm">
                      →
                    </span>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <span className="text-sm font-medium text-primary group-hover:underline">
                      {isComingSoon ? 'Preview' : 'Open tool'}
                    </span>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
