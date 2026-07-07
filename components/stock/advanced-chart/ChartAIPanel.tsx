'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useRef, useState, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion } from 'framer-motion';
import { Sparkles, Send, Square, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useInvalidateQuota } from '@/hooks/use-quota';
import { QuotaIndicator } from '@/components/billing/QuotaIndicator';
import { AiPaywallDialog } from '@/components/billing/AiPaywallDialog';
import { useAIPanel } from '@/components/ai/AIPanelProvider';
import { ToolResultCard } from '@/components/ai/ToolResultCard';
import { getActiveToolName, getToolStatusLabel, getCompletedToolCalls, getFollowups, extractTickers } from '@/lib/ai/tool-ux';
import type { QuotaState } from '@/lib/billing/quotas';
import type { ChartAction, ChartSnapshot } from './chart-context';

interface Props {
  symbol: string;
  /** Live snapshot of the chart — re-read on every message so the AI sees the current state. */
  snapshot: ChartSnapshot;
  onAction: (action: ChartAction) => void | Promise<void>;
  onClose: () => void;
}

const MARKDOWN_CLS = cn(
  'break-words text-sm leading-relaxed',
  '[&_h1]:text-base [&_h1]:font-bold [&_h1]:mt-2 [&_h1]:mb-1 [&_h1]:first:mt-0',
  '[&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-2 [&_h2]:mb-1 [&_h2]:first:mt-0',
  '[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-1.5 [&_h3]:mb-0.5 [&_h3]:first:mt-0',
  '[&_p]:my-1 [&_p]:first:mt-0 [&_p]:last:mb-0',
  '[&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:space-y-0.5',
  '[&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:space-y-0.5',
  '[&_strong]:font-semibold',
  '[&_code]:bg-muted-foreground/20 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs',
  '[&_a]:underline [&_a]:hover:opacity-80',
);

const STARTER_PROMPTS = [
  'Analyze this chart',
  'Is it in an uptrend?',
  'Add a 50 & 200-day SMA',
  'Explain the RSI',
];

/** Pull chart actions out of a finished assistant message's tool outputs. */
function extractChartActions(message: {
  parts?: Array<{ type?: string; output?: unknown; result?: unknown }>;
}): ChartAction[] {
  const actions: ChartAction[] = [];
  for (const part of message.parts ?? []) {
    if (!part.type?.startsWith('tool-')) continue;
    const raw = (part.output ?? part.result) as { __clientAction?: unknown } | undefined;
    if (!raw || typeof raw !== 'object') continue;
    const action = raw.__clientAction as ChartAction | undefined;
    if (action && typeof action.type === 'string' && action.type.startsWith('chart_')) {
      actions.push(action);
    }
  }
  return actions;
}

const AssistantContent = memo(function AssistantContent({ text, isStreaming }: { text: string; isStreaming: boolean }) {
  // While streaming, render plain text so partial markdown (e.g. an unclosed **) doesn't flicker.
  if (isStreaming) {
    return (
      <div className={MARKDOWN_CLS}>
        <span className="whitespace-pre-wrap">{text}</span>
        <motion.span
          className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] rounded-full bg-current"
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.6, repeat: Infinity, repeatType: 'reverse', ease: 'linear' }}
          aria-hidden
        />
      </div>
    );
  }
  return (
    <div className={MARKDOWN_CLS}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
});

export function ChartAIPanel({ symbol, snapshot, onAction, onClose }: Props) {
  const { user } = useAuth();
  const { i18n } = useTranslation();
  const invalidateQuota = useInvalidateQuota();
  const { noteTicker } = useAIPanel();
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = useRef('');
  const [paywallQuota, setPaywallQuota] = useState<QuotaState | null>(null);

  const transport = useMemo(() => new DefaultChatTransport({ api: '/api/ai/chart' }), []);

  const { messages, sendMessage, status, stop, error, clearError } = useChat({
    transport,
    onError: (err) => {
      const msg = err?.message ?? '';
      if (msg.includes('quota_exceeded')) {
        try {
          const match = msg.match(/\{[\s\S]*\}/);
          const parsed = match ? JSON.parse(match[0]) : null;
          setPaywallQuota(parsed?.quota ?? null);
        } catch {
          setPaywallQuota(null);
        }
      }
    },
    onFinish: async ({ message }) => {
      invalidateQuota('chat');
      const tickers = extractTickers(message);
      if (tickers.length) noteTicker(tickers[tickers.length - 1]);
      for (const action of extractChartActions(message)) {
        try {
          await onAction(action);
        } catch {
          /* a single failed action shouldn't break the rest */
        }
      }
    },
  });

  const isStreaming = status === 'streaming' || status === 'submitted';
  const lastMessage = messages[messages.length - 1];
  const lastMessageHasText = lastMessage?.role === 'assistant' &&
    lastMessage.parts.some((p) => p.type === 'text' && p.text.trim().length > 0);
  // While a tool is running and the assistant hasn't started writing text yet, show what
  // it's doing ("Checking financial health…") instead of a generic "thinking" indicator.
  const toolStatusLabel = isStreaming && !lastMessageHasText
    ? getToolStatusLabel(getActiveToolName(lastMessage))
    : null;
  const followups = !isStreaming && lastMessage?.role === 'assistant' ? getFollowups(lastMessage) : [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const id = setTimeout(() => textareaRef.current?.focus(), 60);
    return () => clearTimeout(id);
  }, []);

  // Read the freshest chart snapshot + user prefs at send time (event handler, not render).
  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    sendMessage(
      { parts: [{ type: 'text', text: trimmed }] },
      {
        body: {
          chartContext: snapshot,
          ...(user?.experience_level ? { experienceLevel: user.experience_level } : {}),
          language: i18n.language,
        },
      },
    );
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    send(inputRef.current);
    inputRef.current = '';
    if (textareaRef.current) {
      textareaRef.current.value = '';
      textareaRef.current.style.height = 'auto';
    }
    requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    inputRef.current = e.target.value;
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  return (
    <motion.aside
      initial={{ x: '100%', opacity: 0.4 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0.4 }}
      transition={{ type: 'tween', duration: 0.22, ease: 'easeOut' }}
      className="absolute inset-y-0 right-0 z-20 flex h-full w-full flex-col border-l border-border/60 bg-background shadow-2xl sm:w-[400px]"
      role="dialog"
      aria-label={`AI assistant for ${symbol} chart`}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="rounded-full bg-primary/10 p-1.5">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-foreground">Chart AI</p>
            <p className="text-[11px] text-muted-foreground">Analyzing {symbol.toUpperCase()}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close AI assistant"
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="shrink-0 px-4 pt-2 flex justify-center">
        <QuotaIndicator feature="chat" unit={{ singular: 'message', plural: 'messages' }} />
      </div>

      <AiPaywallDialog
        open={paywallQuota !== null}
        onOpenChange={(o) => !o && setPaywallQuota(null)}
        featureName="Chart AI"
        quota={paywallQuota ?? undefined}
      />

      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-4 py-4 scrollbar-hide">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 py-6 text-center">
            <div className="rounded-full bg-primary/10 p-3">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Ask about this chart</p>
              <p className="mt-1 max-w-[240px] text-xs text-muted-foreground">
                I can read the price action, explain indicators, and change the chart or set alerts for you.
              </p>
            </div>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {STARTER_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => send(p)}
                  className="rounded-full border border-border bg-muted/40 px-3.5 py-2 text-xs text-muted-foreground transition-all hover:border-primary/30 hover:bg-muted/80 hover:text-foreground"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => {
          const isUser = message.role === 'user';
          const text = message.parts
            .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
            .map((p) => p.text)
            .join('');
          const toolCalls = isUser ? [] : getCompletedToolCalls(message);
          // Skip empty assistant shells (tool-only turns still render their confirmation text or a result card).
          if (!isUser && !text && toolCalls.length === 0) return null;
          return (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className={cn('flex', isUser ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cn(
                  'max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                  isUser
                    ? 'rounded-br-sm bg-primary text-primary-foreground'
                    : 'rounded-bl-sm bg-muted text-foreground',
                )}
              >
                {isUser ? (
                  <span className="whitespace-pre-wrap break-words">{text}</span>
                ) : (
                  <>
                    {toolCalls.map((call, i) => (
                      <ToolResultCard key={`${message.id}-tool-${i}`} toolName={call.toolName} output={call.output} />
                    ))}
                    {text && (
                      <AssistantContent text={text} isStreaming={isStreaming && message.id === messages[messages.length - 1]?.id} />
                    )}
                  </>
                )}
              </div>
            </motion.div>
          );
        })}

        {isStreaming && !lastMessageHasText && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2.5 flex items-center gap-2">
              {toolStatusLabel && <span className="text-xs text-muted-foreground">{toolStatusLabel}</span>}
              <span className="flex items-center gap-1.5">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60"
                    animate={{ scale: [1, 1.35, 1], opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 1, repeat: Infinity, delay: i * 0.2, ease: 'easeInOut' }}
                  />
                ))}
              </span>
            </div>
          </div>
        )}

        {followups.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="flex flex-wrap gap-2"
          >
            {followups.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground transition-all hover:border-primary/30 hover:bg-muted/80 hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="mx-3 mb-1 flex items-center justify-between gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <span className="truncate">Something went wrong. Try again.</span>
          <button onClick={clearError} className="shrink-0 underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="sticky bottom-0 flex shrink-0 items-end gap-2 border-t border-border/50 bg-background/95 p-3 backdrop-blur-sm"
      >
        <textarea
          ref={textareaRef}
          rows={1}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask about the chart…"
          aria-label="Message the chart assistant"
          className="max-h-[120px] flex-1 resize-none overflow-y-auto rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring [&::-webkit-scrollbar]:hidden"
          style={{ height: 'auto' }}
        />
        {isStreaming ? (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={stop}
            aria-label="Stop"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Square className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="submit"
            aria-label="Send"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Send className="h-4 w-4" />
          </button>
        )}
      </form>
    </motion.aside>
  );
}
