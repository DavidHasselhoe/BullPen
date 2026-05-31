'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface ToolHeaderProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actions?: ReactNode;
}

export function ToolHeader({ icon: Icon, title, description, actions }: ToolHeaderProps) {
  return (
    <div className="mb-8">
      <Link
        href="/tools"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-5 group"
      >
        <ArrowLeft className="h-3 w-3 transition-transform group-hover:-translate-x-0.5" />
        All tools
      </Link>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
          </div>
        </div>
        {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
