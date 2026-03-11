'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Image from 'next/image';
import { Bot, X, PanelRightClose } from 'lucide-react';
import Link from 'next/link';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { BullpenChat, type BullpenChatHandle } from './BullpenChat';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import type { AIContext } from './AIPanelProvider';

interface AISidePanelProps {
  open: boolean;
  onClose: () => void;
  initialQuery?: string | null;
  aiContext?: AIContext | null;
  onConsumedQuery?: () => void;
}

const STARTER_PROMPTS = [
  'What is EBITDA?',
  'Explain the P/E ratio',
  'What are 10-K filings?',
  'Compare NVIDIA and AMD',
  'Open NVIDIA filings',
  'Companies with accelerating revenue',
];

// Animation timings (ms)
const FADE_MS = 120;   // content fade in/out
const SLIDE_MS = 160;  // panel width expand/collapse

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

export function AISidePanel({ open, onClose, initialQuery, aiContext, onConsumedQuery }: AISidePanelProps) {
  const { user, isLoading, isAuthenticated } = useAuth();
  // panelExpanded controls the aside width (may lag behind `open` during close fade)
  const [panelExpanded, setPanelExpanded] = useState(false);
  // contentVisible controls the opacity fade
  const [contentVisible, setContentVisible] = useState(false);
  const chatRef = useRef<BullpenChatHandle>(null);
  const closingRef = useRef(false);

  const handleClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    // Step 1: fade content out
    setContentVisible(false);
    // Step 2: after fade completes, collapse the panel width then notify parent
    const t = setTimeout(() => {
      setPanelExpanded(false);
      onClose();
      closingRef.current = false;
    }, FADE_MS);
    return () => clearTimeout(t);
  }, [onClose]);

  // React to external open changes
  useEffect(() => {
    if (open) {
      // Cancel any in-progress close
      closingRef.current = false;
      // Step 1: expand panel width
      setPanelExpanded(true);
      setContentVisible(false);
      // Step 2: after width settles, fade content in and focus
      const t = setTimeout(() => {
        setContentVisible(true);
        chatRef.current?.focusInput?.();
      }, SLIDE_MS);
      return () => clearTimeout(t);
    } else if (!closingRef.current) {
      // External close (not via handleClose) — instant
      setContentVisible(false);
      setPanelExpanded(false);
    }
  }, [open]);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleClose]);

  return (
    <aside
      aria-hidden={!panelExpanded}
      style={{ transitionDuration: `${SLIDE_MS}ms` }}
      className={cn(
        'flex h-full flex-col shrink-0 overflow-visible relative',
        'bg-background border-l border-border/60',
        'transition-[width] ease-out',
        panelExpanded ? 'w-[480px] sm:w-[520px]' : 'w-0 min-w-0 border-0'
      )}
    >
      {/* Content — opacity-controlled, no overflow-hidden so it never "compresses" */}
      <div
        style={{ transitionDuration: `${FADE_MS}ms` }}
        className={cn(
          'flex flex-1 flex-col min-h-0 transition-opacity ease-in-out',
          contentVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
      >
        {/* Collapse tab on inner edge */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleClose}
              aria-label="Close AI panel"
              className={cn(
                'absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full z-10',
                'flex items-center justify-center',
                'w-8 h-16 -ml-px',
                'rounded-l-md border border-r-0 border-border/60 bg-muted/80 hover:bg-muted',
                'text-muted-foreground hover:text-foreground',
                'transition-colors shadow-sm'
              )}
            >
              <PanelRightClose className="h-5 w-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">Close AI panel</TooltipContent>
        </Tooltip>

        {/* Header */}
        <div className="flex h-16 shrink-0 items-center justify-between px-4 border-b border-border/50 bg-muted/30">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="rounded-full bg-primary/15 p-1.5 shrink-0">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-none">AI Assistant</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                {aiContext?.label ?? 'BullPen AI'}
              </p>
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
              onClick={handleClose}
              aria-label="Close AI panel"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0 flex-col overflow-hidden scrollbar-hide">
          {isLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <span className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          ) : !isAuthenticated ? (
            <AuthGate />
          ) : (
            <BullpenChat
              ref={chatRef}
              compact
              user={user}
              starterPrompts={STARTER_PROMPTS}
              open={open}
              initialQuery={initialQuery ?? undefined}
              aiContext={aiContext ?? undefined}
              onConsumedQuery={onConsumedQuery}
            />
          )}
        </div>
      </div>
    </aside>
  );
}
