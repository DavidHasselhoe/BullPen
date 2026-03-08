'use client';

import { useState } from 'react';
import { Bot, X, MessageSquare, LogIn, UserPlus } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { BullpenChat } from './BullpenChat';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const { user, isLoading, isAuthenticated } = useAuth();

  return (
    <>
      {/* Floating panel */}
      <div
        aria-hidden={!isOpen}
        className={cn(
          'fixed bottom-20 right-4 z-50',
          'w-[360px] max-w-[calc(100vw-2rem)] h-[520px]',
          'rounded-2xl border border-border/60 bg-background shadow-2xl shadow-black/20',
          'flex flex-col overflow-hidden',
          'transition-all duration-300 ease-out origin-bottom-right',
          isOpen
            ? 'opacity-100 scale-100 pointer-events-auto'
            : 'opacity-0 scale-95 pointer-events-none'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 shrink-0 bg-muted/30">
          <div className="flex items-center gap-2.5">
            <div className="rounded-full bg-primary/15 p-1.5">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-none">BullPen AI</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Investment research assistant</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Signed-in user avatar in header */}
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
              onClick={() => setIsOpen(false)}
              aria-label="Close chat"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body — auth gate or chat */}
        <div className="flex-1 min-h-0 flex flex-col">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <span className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          ) : !isAuthenticated ? (
            <AuthGate />
          ) : (
            <BullpenChat compact user={user} open={isOpen} />
          )}
        </div>
      </div>

      {/* FAB trigger button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={isOpen ? 'Close BullPen AI' : 'Open BullPen AI'}
        className={cn(
          'fixed bottom-4 right-4 z-50',
          'h-14 w-14 rounded-full shadow-lg shadow-black/25',
          'flex items-center justify-center',
          'bg-primary text-primary-foreground',
          'hover:bg-primary/90 active:scale-95',
          'transition-all duration-200'
        )}
      >
        {isOpen ? (
          <X className="h-5 w-5" />
        ) : (
          <MessageSquare className="h-5 w-5" />
        )}
      </button>
    </>
  );
}

function AuthGate() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6 py-8 text-center">
      <div className="rounded-full bg-primary/10 p-4">
        <Bot className="h-8 w-8 text-primary" />
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-semibold text-foreground">Sign in to use BullPen AI</p>
        <p className="text-xs text-muted-foreground max-w-[220px] leading-relaxed">
          Get instant answers about SEC filings, financial metrics, and investment research — powered by AI.
        </p>
      </div>
      <div className="flex flex-col gap-2 w-full max-w-[200px]">
        <Link
          href="/login"
          className="flex items-center justify-center gap-2 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <LogIn className="h-4 w-4" />
          Sign in
        </Link>
        <Link
          href="/register"
          className="flex items-center justify-center gap-2 w-full rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          <UserPlus className="h-4 w-4" />
          Create account
        </Link>
      </div>
      <p className="text-[10px] text-muted-foreground">
        BullPen AI is available to all registered users.
      </p>
    </div>
  );
}
