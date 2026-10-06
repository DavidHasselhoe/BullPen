'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useBackground } from '@/hooks/use-background';

/**
 * The shared frame for every /tools page. Two widths only, so moving between
 * tools never shifts the back link or the title sideways: `narrow` for form and
 * AI tools (one column of inputs, a report), `wide` for data tools that need
 * the room (tables, grids, the heatmap).
 */
export function ToolPage({
  width = 'narrow',
  className,
  children,
}: {
  width?: 'narrow' | 'wide';
  className?: string;
  children: ReactNode;
}) {
  const { hasAnimatedBackground } = useBackground();
  return (
    <div className={cn('min-h-screen', !hasAnimatedBackground && 'bg-background')}>
      <main
        className={cn(
          'container mx-auto px-4 pt-8 pb-16 sm:px-6 sm:pt-10 lg:px-8',
          width === 'wide' ? 'max-w-7xl' : 'max-w-4xl',
          className
        )}
      >
        {children}
      </main>
    </div>
  );
}

interface ToolHeaderProps {
  /** A rendered icon element (`<Bell />`), not the component, so server pages can pass it too. */
  icon: ReactNode;
  title: ReactNode;
  description: ReactNode;
  actions?: ReactNode;
  /** The "All tools" link. Off only on /tools itself. */
  back?: boolean;
  className?: string;
}

/** "All tools". Exported alone for the Screener, whose toolbar-style header is its own. */
export function ToolBackLink() {
  const { t } = useTranslation('tools');
  return (
    <Link
      href="/tools"
      className="group mb-5 inline-flex items-center gap-1.5 rounded text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowLeft className="h-3 w-3 transition-transform group-hover:-translate-x-0.5" aria-hidden />
      {t('allToolsLink', 'All tools')}
    </Link>
  );
}

export function ToolHeader({ icon, title, description, actions, back = true, className }: ToolHeaderProps) {
  return (
    <div className={cn('mb-8', className)}>
      {back && <ToolBackLink />}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary [&_svg]:h-5 [&_svg]:w-5" aria-hidden>
            {icon}
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">{title}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** Section heading inside a tool page. Sentence case, no tracked-uppercase eyebrow. */
export function ToolSectionTitle({
  children,
  meta,
  className,
  as: Tag = 'h2',
}: {
  children: ReactNode;
  meta?: ReactNode;
  className?: string;
  as?: 'h2' | 'h3' | 'p';
}) {
  return (
    <div className={cn('mb-3 flex items-baseline gap-2', className)}>
      <Tag className="text-sm font-semibold text-foreground">{children}</Tag>
      {meta != null && <span className="text-xs text-muted-foreground tabular-nums">{meta}</span>}
    </div>
  );
}
