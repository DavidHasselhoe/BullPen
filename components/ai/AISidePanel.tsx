'use client';

import { lazy, Suspense, useEffect, useRef, useState, useCallback } from 'react';
import Image from 'next/image';
import { X, PanelRightClose, Settings, History, SquarePen, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import type { UIMessage } from 'ai';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { BullAiIcon } from './BullAiIcon';
import { AiTermsGate } from './AiTermsGate';
import { useAiTerms } from '@/hooks/use-ai-terms';
import type { BullpenChatHandle } from './BullpenChat';

// The chat stack (AI SDK transport, react-markdown, tool result cards) is heavy
// and mounted on every page via the root layout — load its chunk only when the
// panel is first opened.
const BullpenChat = lazy(() => import('./BullpenChat').then((m) => ({ default: m.BullpenChat })));
import { useAuth } from '@/hooks/use-auth';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { cn } from '@/lib/utils';
import { WhyTodayView } from './WhyTodayView';
import type { AIContext, WhyTodayPayload } from './AIPanelProvider';

interface AISidePanelProps {
  open: boolean;
  onClose: () => void;
  initialQuery?: string | null;
  aiContext?: AIContext | null;
  onConsumedQuery?: () => void;
  whyToday?: WhyTodayPayload | null;
  onCloseWhyToday?: () => void;
}

const STARTER_PROMPTS = [
  'Add 10 shares of AAPL to my holdings',
  'Alert me if TSLA drops below $200',
  'Any insider buying in NVDA lately?',
  'How healthy is AAPL financially?',
  'Find me some growth stocks',
  "Show me AAPL's recent earnings",
];

const PANEL_WIDTH = 480;

// Spring: well-damped, natural drawer feel
const spring = { type: 'spring' as const, stiffness: 280, damping: 28, restDelta: 0.5 };

interface ConversationSummary {
  id: string;
  title: string;
  updated_at: string;
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function AuthGate() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-8 text-center">
      <BullAiIcon pose="wave" size={112} />
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

export function AISidePanel({ open, onClose, initialQuery, aiContext, onConsumedQuery, whyToday, onCloseWhyToday }: AISidePanelProps) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const { hasAccepted: hasAcceptedAiTerms } = useAiTerms();
  const isMobile = useIsMobile();
  // Full-screen chat on phones (480px would collapse the page content beside it).
  const panelWidth = isMobile ? '100vw' : PANEL_WIDTH;
  const chatRef = useRef<BullpenChatHandle>(null);
  // Defer mounting (and downloading) the chat until the first open; stay
  // mounted afterwards so the conversation survives close/reopen.
  const [hasOpened, setHasOpened] = useState(open);
  if (open && !hasOpened) setHasOpened(true);

  // Chat history: each turn is auto-saved server-side under `conversationId` (see
  // /api/ai/chat's onFinish). Changing it remounts BullpenChat (via `key` below)
  // with fresh initialMessages, the same "swap the whole reader" approach BriefReader
  // uses for past daily briefs.
  const [conversationId, setConversationId] = useState<string>(() => crypto.randomUUID());
  const [initialMessages, setInitialMessages] = useState<UIMessage[] | undefined>(undefined);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loadingConversationId, setLoadingConversationId] = useState<string | null>(null);

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ['ai-conversations-list'],
    queryFn: async () => {
      const res = await fetch('/api/ai/conversations');
      if (!res.ok) throw new Error('Failed to load chat history');
      const json = await res.json();
      return (json.conversations ?? []) as ConversationSummary[];
    },
    enabled: historyOpen,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const selectConversation = useCallback(async (id: string) => {
    if (id === conversationId) {
      setHistoryOpen(false);
      return;
    }
    setLoadingConversationId(id);
    try {
      const res = await fetch(`/api/ai/conversations/${id}`);
      if (!res.ok) return;
      const json = await res.json();
      setInitialMessages(json.conversation?.messages ?? []);
      setConversationId(id);
      setHistoryOpen(false);
    } finally {
      setLoadingConversationId(null);
    }
  }, [conversationId]);

  const startNewChat = useCallback(() => {
    setConversationId(crypto.randomUUID());
    setInitialMessages(undefined);
    setHistoryOpen(false);
  }, []);

  // Collapse the dropdown when the panel itself closes, so reopening later
  // doesn't flash it back open.
  useEffect(() => {
    if (!open) setHistoryOpen(false);
  }, [open]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // Focus input after spring settles (~380ms for stiffness:280 damping:28).
  // Skip when opening into Why Today mode — the chat input is hidden then,
  // and focusing an invisible field is an accessibility trap.
  useEffect(() => {
    if (!open || whyToday) return;
    const t = setTimeout(() => chatRef.current?.focusInput?.(), 380);
    return () => clearTimeout(t);
  }, [open, whyToday]);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleClose]);

  return (
    <motion.aside
      aria-hidden={!open}
      // inert removes the collapsed panel's buttons from tab order and the
      // accessibility tree — aria-hidden alone leaves focusable descendants.
      inert={!open}
      initial={false}
      animate={{ width: open ? panelWidth : 0 }}
      // On close: content fades first (0.13s), then width collapses (delay 0.13s)
      // On open: width springs first (no delay), then content fades in (delay 0.22s)
      transition={open ? spring : { ...spring, delay: 0.13 }}
      className="relative flex h-full flex-col shrink-0 overflow-visible"
    >
      {/* Collapse tab — sibling to inner content so overflow-visible lets it escape */}
      <motion.div
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={open ? { duration: 0.18, delay: 0.22 } : { duration: 0.13 }}
        style={{ pointerEvents: open ? 'auto' : 'none' }}
        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full z-10"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleClose}
              aria-label="Close AI panel"
              className={cn(
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
      </motion.div>

      {/* Main content — absolute fill avoids squishing during width spring animation */}
      <motion.div
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={open ? { duration: 0.18, delay: 0.22 } : { duration: 0.13 }}
        style={{ pointerEvents: open ? 'auto' : 'none' }}
        className="absolute inset-0 flex flex-col bg-background border-l border-border/60 overflow-hidden"
      >
        {/* Header */}
        <div className="flex h-16 shrink-0 items-center justify-between px-4 border-b border-border/50 bg-muted/30">
          <div className="flex items-center flex-1 min-w-0 gap-1">
            {whyToday ? (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={onCloseWhyToday}
                      aria-label="Back to chat"
                      className="rounded-md p-1.5 -ml-1.5 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Back to chat</TooltipContent>
                </Tooltip>
                <p className="text-sm font-semibold leading-none truncate">Why ${whyToday.ticker} moved</p>
              </>
            ) : (
              <p className="text-sm font-semibold leading-none truncate">Ask Bull</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!whyToday && isAuthenticated && user && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={startNewChat}
                      aria-label="New chat"
                      title="New chat"
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <SquarePen className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">New chat</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setHistoryOpen((v) => !v)}
                      aria-expanded={historyOpen}
                      aria-label="Chat history"
                      title="Chat history"
                      className={cn(
                        'rounded-md p-1.5 transition-colors',
                        historyOpen
                          ? 'text-primary bg-primary/10'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      <History className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Chat history</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent('settings:open', { detail: { tab: 'ai' } }))}
                      aria-label="AI settings"
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <Settings className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">AI settings</TooltipContent>
                </Tooltip>
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
              </>
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

        {/* Chat history dropdown */}
        {historyOpen && (
          <div className="absolute top-16 right-4 z-30 w-72 max-h-80 overflow-y-auto rounded-lg border border-border/40 bg-background shadow-lg py-1.5">
            {historyLoading ? (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">Loading…</div>
            ) : !history || history.length === 0 ? (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">No past conversations yet</div>
            ) : (
              history.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectConversation(c.id)}
                  disabled={loadingConversationId === c.id}
                  className={cn(
                    'w-full text-left px-3 py-2 text-xs transition-colors hover:bg-muted/40 disabled:opacity-50',
                    c.id === conversationId && 'bg-muted/30'
                  )}
                >
                  <span className="block font-mono text-[10px] text-muted-foreground/80">
                    {formatShortDate(c.updated_at)}
                  </span>
                  <span className="block text-foreground/90 truncate">{c.title}</span>
                </button>
              ))
            )}
          </div>
        )}

        {/* Body */}
        <div className="flex flex-1 min-h-0 flex-col overflow-hidden scrollbar-hide">
          {isLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <span className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          ) : !isAuthenticated ? (
            <AuthGate />
          ) : !hasAcceptedAiTerms ? (
            <AiTermsGate />
          ) : (
            <>
              {whyToday && (
                <WhyTodayView
                  key={whyToday.requestedAt}
                  ticker={whyToday.ticker}
                  price={whyToday.price}
                  change={whyToday.change}
                  changePct={whyToday.changePct}
                />
              )}
              {hasOpened && (
                <div className={cn('flex flex-1 min-h-0 flex-col', whyToday && 'hidden')}>
                  <Suspense
                    fallback={
                      <div className="flex flex-1 items-center justify-center">
                        <span className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                      </div>
                    }
                  >
                    <BullpenChat
                      key={conversationId}
                      ref={chatRef}
                      compact
                      user={user}
                      starterPrompts={STARTER_PROMPTS}
                      open={open}
                      initialQuery={initialQuery ?? undefined}
                      aiContext={aiContext ?? undefined}
                      onConsumedQuery={onConsumedQuery}
                      conversationId={conversationId}
                      initialMessages={initialMessages}
                    />
                  </Suspense>
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>
    </motion.aside>
  );
}
