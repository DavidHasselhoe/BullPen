'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Send, Square, Bot, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AuthUser } from '@/lib/auth/auth';
import { useAddOrUpdateHolding, useUpdateHoldingBySymbol, useRemoveHoldingBySymbol } from '@/hooks/use-holdings';
import { useTypingEffect } from '@/hooks/use-typing-effect';

const DEFAULT_STARTER_PROMPTS = [
  'What is EBITDA?',
  'Explain P/E ratio',
  'What are 10-K filings?',
];

export interface AIContextProp {
  tickers: string[];
  label?: string;
}

interface BullpenChatProps {
  /** Compact mode trims padding/header for use inside the floating widget */
  compact?: boolean;
  /** Authenticated user — used to show profile avatar on user messages */
  user?: AuthUser | null;
  /** Custom starter prompts when there are no messages */
  starterPrompts?: string[];
  /** When true, auto-focus the input (e.g. when panel opens). Omit for full-page chat (focus on mount). */
  open?: boolean;
  /** Initial query to send when opening (e.g. from command palette) */
  initialQuery?: string;
  /** Page context for context-aware prompts (e.g. NVDA vs AMD) */
  aiContext?: AIContextProp;
  /** Called after initial query has been sent */
  onConsumedQuery?: () => void;
}

type ClientAction =
  | { type: 'navigate'; path: string }
  | { type: 'addHolding'; ticker: string; company_name: string; quantity?: number | null; avg_price?: number | null }
  | { type: 'updateHolding'; ticker: string; quantity?: number | null; avg_price?: number | null }
  | { type: 'removeHolding'; ticker: string };

function extractClientActions(message: { parts?: Array<{ type?: string; state?: string; output?: unknown; result?: unknown }> }): ClientAction[] {
  const actions: ClientAction[] = [];
  for (const part of message.parts ?? []) {
    if (!part.type?.startsWith('tool-')) continue;
    const p = part as { state?: string; output?: unknown; result?: unknown };
    const raw = p.output ?? p.result;
    if (!raw || typeof raw !== 'object') continue;
    const out = raw as { __clientAction?: Record<string, unknown> };
    if (out.__clientAction && typeof (out.__clientAction as Record<string, unknown>).type === 'string') {
      actions.push(out.__clientAction as ClientAction);
    }
  }
  return actions;
}

/** Renders AI message text with a typewriter animation while streaming. */
function AssistantMessageContent({
  text,
  isStreaming,
}: {
  text: string;
  isStreaming: boolean;
}) {
  const displayed = useTypingEffect(text, isStreaming);
  const showCursor = isStreaming && displayed.length < text.length;

  return (
    <div
      className={cn(
        'break-words',
        '[&_h1]:text-base [&_h1]:font-bold [&_h1]:mt-2 [&_h1]:mb-1 [&_h1]:first:mt-0',
        '[&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-2 [&_h2]:mb-1 [&_h2]:first:mt-0',
        '[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-1.5 [&_h3]:mb-0.5 [&_h3]:first:mt-0',
        '[&_p]:my-1 [&_p]:first:mt-0 [&_p]:last:mb-0',
        '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:space-y-0.5',
        '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:space-y-0.5',
        '[&_strong]:font-semibold',
        '[&_code]:bg-muted-foreground/20 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs',
        '[&_pre]:bg-muted-foreground/10 [&_pre]:p-2 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:my-2',
        '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
        '[&_a]:underline [&_a]:hover:opacity-80'
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayed}</ReactMarkdown>
      {showCursor && (
        <span
          className="inline-block w-[2px] h-[1em] bg-current opacity-80 ml-0.5 align-middle animate-[blink_1s_step-end_infinite]"
          aria-hidden
        />
      )}
    </div>
  );
}

export interface BullpenChatHandle {
  focusInput: () => void;
}

export const BullpenChat = forwardRef<BullpenChatHandle, BullpenChatProps>(function BullpenChat(
  { compact = false, user, starterPrompts = DEFAULT_STARTER_PROMPTS, open, initialQuery, aiContext, onConsumedQuery },
  ref
) {
  const router = useRouter();
  const addHoldingMutation = useAddOrUpdateHolding();
  const updateHoldingMutation = useUpdateHoldingBySymbol();
  const removeHoldingMutation = useRemoveHoldingBySymbol();
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = useRef('');
  const initialQuerySentRef = useRef(false);

  useImperativeHandle(ref, () => ({
    focusInput: () => textareaRef.current?.focus(),
  }));

  const {
    messages,
    sendMessage,
    status,
    stop,
    error,
    clearError,
  } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/ai/chat',
      // Include the current page context (ticker + label) so the server-side agent
      // knows which stock/comparison the user is viewing without requiring them to type it.
      body: {
        ...(aiContext ? { context: aiContext } : {}),
        ...(user?.experience_level ? { experienceLevel: user.experience_level } : {}),
        ...((user as any)?.risk_profile ? { riskProfile: (user as any).risk_profile } : {}),
        ...((user?.settings as any)?.investment_horizon ? { investmentHorizon: (user?.settings as any).investment_horizon } : {}),
        ...((user?.settings as any)?.response_style ? { responseStyle: (user?.settings as any).response_style } : {}),
      },
    }),
    onFinish: async ({ message }) => {
      for (const action of extractClientActions(message)) {
        if (action.type === 'navigate' && action.path) {
          router.push(action.path);
        } else if (action.type === 'addHolding') {
          try {
            await addHoldingMutation.mutateAsync({
              symbol: action.ticker,
              company_name: action.company_name,
              quantity: action.quantity ?? null,
              avg_price: action.avg_price ?? null,
            });
          } catch {
            // Silently skip — user may not be logged in or holding already exists
          }
        } else if (action.type === 'updateHolding') {
          try {
            await updateHoldingMutation.mutateAsync({
              symbol: action.ticker,
              quantity: action.quantity ?? undefined,
              avg_price: action.avg_price ?? undefined,
            });
          } catch {
            // Silently skip — holding may not exist
          }
        } else if (action.type === 'removeHolding') {
          try {
            await removeHoldingMutation.mutateAsync(action.ticker);
          } catch {
            // Silently skip — holding may not exist
          }
        }
      }
    },
  });

  const isStreaming = status === 'streaming' || status === 'submitted';

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-focus on mount for full-page chat (open === undefined).
  // Side-panel focus is driven externally via the focusInput ref handle.
  useEffect(() => {
    if (open !== undefined) return;
    const id = setTimeout(() => textareaRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset the sent-guard whenever a new initialQuery arrives so each distinct
  // query (e.g. "Explain NVDA score" then "Explain AAPL score") is fired.
  useEffect(() => {
    initialQuerySentRef.current = false;
  }, [initialQuery]);

  // Send initial query when opened with one (e.g. from command palette)
  useEffect(() => {
    if (!initialQuery || initialQuerySentRef.current || !open) return;
    initialQuerySentRef.current = true;
    sendMessage({ parts: [{ type: 'text', text: initialQuery }] });
    onConsumedQuery?.();
  }, [initialQuery, open, sendMessage, onConsumedQuery]);

  // Context-aware prompts when viewing a company or comparison
  const contextPrompts = aiContext
    ? aiContext.tickers.length >= 2
      ? [
          'Explain profitability differences',
          'Which company has stronger margins?',
          'Compare revenue growth',
        ]
      : [
          `Summarize ${aiContext.tickers[0]} key metrics`,
          `What are the main risks for ${aiContext.tickers[0]}?`,
          `Recent filings for ${aiContext.tickers[0]}`,
        ]
    : [];
  const displayPrompts = contextPrompts.length > 0 ? contextPrompts : starterPrompts;

  const refocusInput = () => {
    // After submit, React may re-render; run after paint so focus isn’t stolen by disabled state (we avoid disabling while streaming).
    requestAnimationFrame(() => {
      textareaRef.current?.focus({ preventScroll: true });
    });
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = inputRef.current.trim();
    if (!text || isStreaming) return;

    sendMessage({ parts: [{ type: 'text', text }] });

    inputRef.current = '';
    if (textareaRef.current) {
      textareaRef.current.value = '';
      textareaRef.current.style.height = 'auto';
    }
    refocusInput();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    inputRef.current = e.target.value;
    // Auto-grow textarea (max ~5 lines)
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  const handleFormClick = (e: React.MouseEvent<HTMLFormElement>) => {
    // Focus textarea when clicking form area (except the send button)
    const target = e.target as HTMLElement;
    if (!target.closest('button')) {
      textareaRef.current?.focus();
    }
  };

  return (
    <div className={cn('flex flex-col h-full', compact ? '' : 'min-h-[460px]')}>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 space-y-4 scrollbar-hide">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-8 text-center">
            <div className="rounded-full bg-primary/10 p-3">
              <Bot className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">BullPen AI</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">
                {aiContext?.label
                  ? `Context: ${aiContext.label}`
                  : 'Ask about SEC filings, financial metrics, or investment concepts.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5 justify-center mt-3">
              {displayPrompts.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => {
                    sendMessage({ parts: [{ type: 'text', text: suggestion }] });
                    refocusInput();
                  }}
                  className="text-xs px-4 py-2 rounded-full border border-border bg-muted/40 hover:bg-muted/80 hover:border-primary/30 text-muted-foreground hover:text-foreground transition-all duration-200 hover:shadow-sm"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => {
          const isUser = message.role === 'user';
          return (
            <div
              key={message.id}
              className={cn('flex items-end gap-2', isUser ? 'justify-end' : 'justify-start')}
            >
              {!isUser && (
                <div className="shrink-0 rounded-full bg-primary/10 p-1.5 mb-0.5">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
              )}
              <div
                className={cn(
                  'max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                  isUser
                    ? 'rounded-br-sm bg-primary text-primary-foreground'
                    : 'rounded-bl-sm bg-muted text-foreground'
                )}
              >
                {isUser ? (
                  <div className="whitespace-pre-wrap break-words">
                    {message.parts.map((part, i) => {
                      if (part.type === 'text') {
                        // Strip hidden [display:...] prefix — used to show a clean label
                        // while the full prompt goes to the AI unchanged.
                        const displayMatch = part.text.match(/^\[display:([^\]]+)\]/);
                        const displayText = displayMatch ? displayMatch[1] : part.text;
                        return <span key={`${message.id}-${i}`}>{displayText}</span>;
                      }
                      return null;
                    })}
                  </div>
                ) : (
                  <AssistantMessageContent
                    text={message.parts
                      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
                      .map((p) => p.text)
                      .join('')}
                    isStreaming={
                      isStreaming &&
                      message.id === messages[messages.length - 1]?.id
                    }
                  />
                )}
              </div>
              {isUser && (
                <div className="shrink-0 rounded-full overflow-hidden mb-0.5 h-7 w-7 ring-2 ring-primary/30">
                  {user?.avatar_url ? (
                    <Image
                      src={user.avatar_url}
                      alt={user.full_name ?? user.email}
                      width={28}
                      height={28}
                      className="object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center bg-primary text-primary-foreground text-xs font-semibold">
                      {user
                        ? (user.full_name ?? user.email).charAt(0).toUpperCase()
                        : <User className="h-3.5 w-3.5" />}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Thinking indicator */}
        {isStreaming && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex items-end gap-2 justify-start">
            <div className="shrink-0 rounded-full bg-primary/10 p-1.5 mb-0.5">
              <Bot className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="bg-muted rounded-2xl rounded-bl-sm px-3.5 py-2.5">
              <span className="flex gap-1 items-center">
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Error bar */}
      {error && (
        <div className="mx-3 mb-1 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-xs flex items-center justify-between gap-2">
          <span className="truncate">{error.message}</span>
          <button onClick={clearError} className="shrink-0 underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Input - click-to-focus on form padding ensures input is focusable */}
      <form
        onSubmit={handleSubmit}
        onClick={handleFormClick}
        className="shrink-0 sticky bottom-0 border-t border-border/50 bg-background/95 backdrop-blur-sm p-3 flex items-end gap-2 pointer-events-auto relative z-10"
      >
        <textarea
          ref={textareaRef}
          rows={1}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything…"
          tabIndex={0}
          aria-label="Message input"
          className="flex-1 resize-none rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 max-h-[120px] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] pointer-events-auto"
          style={{ height: 'auto' }}
        />
        {isStreaming ? (
          <Button
            type="button"
            size="icon"
            variant="outline"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              stop();
              refocusInput();
            }}
            className="shrink-0 h-10 w-10 rounded-xl"
            title="Stop generating"
          >
            <Square className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            onMouseDown={(e) => e.preventDefault()}
            className="shrink-0 h-10 w-10 rounded-xl"
            title="Send message"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        )}
      </form>
    </div>
  );
});
