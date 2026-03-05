'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import { Bot, X } from 'lucide-react';
import Link from 'next/link';
import { BullpenChat } from './BullpenChat';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

interface AISidePanelProps {
  open: boolean;
  onClose: () => void;
}

const STARTER_PROMPTS = [
  'What is EBITDA?',
  'Explain the P/E ratio',
  'What are 10-K filings?',
  'Compare NVIDIA and AMD',
  'Open NVIDIA filings',
  'Companies with accelerating revenue',
];

function AuthGate() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-8 text-center">
      <div className="rounded-full bg-primary/10 p-4">
        <Bot className="h-8 w-8 text-primary" />
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-semibold text-foreground">Sign in to use BullPen AI</p>
        <p className="text-xs text-muted-foreground max-w-[220px] leading-relaxed">
          Get instant answers about SEC filings, financial metrics, and investment research.
        </p>
      </div>
      <div className="flex flex-col gap-2 w-full max-w-[200px]">
        <Link
          href="/login"
          className="flex items-center justify-center gap-2 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Sign in
        </Link>
        <Link
          href="/register"
          className="flex items-center justify-center gap-2 w-full rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          Create account
        </Link>
      </div>
    </div>
  );
}

export function AISidePanel({ open, onClose }: AISidePanelProps) {
  const { user, isLoading, isAuthenticated } = useAuth();

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <aside
      aria-hidden={!open}
      className={cn(
        'flex h-full flex-col shrink-0 overflow-hidden transition-[width] duration-300 ease-out',
        'bg-background border-l border-border/60',
        open ? 'w-[480px] sm:w-[520px]' : 'w-0 min-w-0 border-0'
      )}
    >
        {/* Header - h-16 to align with main nav */}
        <div className="flex h-16 shrink-0 items-center justify-between px-4 border-b border-border/50 bg-muted/30">
          <div className="flex items-center gap-2.5">
            <div className="rounded-full bg-primary/15 p-1.5">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-none">AI Assistant</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">BullPen AI</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAuthenticated && user && (
              <div className="h-7 w-7 rounded-full overflow-hidden ring-2 ring-border">
                {user.avatar_url ? (
                  <Image
                    src={user.avatar_url}
                    alt={user.full_name ?? user.email}
                    width={28}
                    height={28}
                    className="object-cover"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center bg-primary text-primary-foreground text-xs font-semibold">
                    {(user.full_name ?? user.email).charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            )}
            <button
              onClick={onClose}
              aria-label="Close AI panel"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0 flex flex-col overflow-hidden scrollbar-hide">
          {isLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <span className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          ) : !isAuthenticated ? (
            <AuthGate />
          ) : (
            <BullpenChat compact user={user} starterPrompts={STARTER_PROMPTS} />
          )}
        </div>
    </aside>
  );
}
