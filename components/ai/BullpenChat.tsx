'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { UIMessage } from 'ai';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle, memo } from 'react';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Send, Square, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AuthUser } from '@/lib/auth/auth';
import type { QuotaState } from '@/lib/billing/quotas';
import { useAddOrUpdateHolding, useUpdateHoldingBySymbol, useRemoveHoldingBySymbol } from '@/hooks/use-holdings';
import { useAlerts } from '@/hooks/use-alerts';
import { QuotaIndicator } from '@/components/billing/QuotaIndicator';
import { AiPaywallDialog } from '@/components/billing/AiPaywallDialog';
import { useInvalidateQuota } from '@/hooks/use-quota';
import { useAIPanel } from '@/components/ai/AIPanelProvider';
import { ToolResultCard } from '@/components/ai/ToolResultCard';
import { BullAiIcon } from '@/components/ai/BullAiIcon';
import { getActiveToolName, getToolStatusLabel, getCompletedToolCalls, getFollowups, extractTickers, type ClientAction, type ActionOutcome } from '@/lib/ai/tool-ux';

// Byte-identical to AISidePanel's starterPromptHealthCheck/InsiderBuying/GrowthStocks — reused rather than duplicated.
function getDefaultStarterPrompts(t: TFunction): string[] {
  return [
    t('starterPromptHealthCheck'),
    t('starterPromptInsiderBuying'),
    t('starterPromptGrowthStocks'),
  ];
}

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
  /**
   * Stable id for this conversation, used to save/resume chat history. When
   * omitted, one is generated on mount (still saved server-side, just not
   * resumable from a history UI that doesn't know the id). Callers that offer
   * a history dropdown (e.g. AISidePanel) own this and pass it in explicitly,
   * remounting BullpenChat (via `key`) when switching conversations.
   */
  conversationId?: string;
  /** Messages to seed the chat with when resuming a past conversation. */
  initialMessages?: UIMessage[];
}

// Defense-in-depth: the server sanitizes AI stream errors before they reach
// the client, but this catches anything that slips through a different path
// (a raw fetch/network failure, a future regression) so a provider's internal
// error payload — org IDs, rate-limit internals, stack-shaped text — never
// renders directly to a user.
function friendlyChatError(message: string | undefined, t: TFunction): string {
  if (!message) return t('chatGenericError');
  const looksTechnical =
    message.length > 160 ||
    /"(type|code|error)"\s*:/i.test(message) ||
    /\borg-[a-zA-Z0-9]+\b/.test(message) ||
    /rate[_ ]limit/i.test(message);
  return looksTechnical ? t('chatGenericError') : message;
}

const MARKDOWN_CLS = cn(
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
);

/**
 * Word-by-word fade-in reveal for streamed text.
 *
 * Splitting on whitespace (keeping the separators as their own tokens) gives
 * each word a stable index as long as new text is only appended — which is
 * always true for a token stream. React reuses the same span for words already
 * on screen (their animation never restarts, even as the trailing word grows
 * character-by-character), and only genuinely new words mount with a fresh
 * fade. That avoids the flash/jitter of re-fading an entire growing block of
 * text on every token.
 */
function StreamingText({ text }: { text: string }) {
  const words = text.split(/(\s+)/);
  return (
    <>
      {words.map((word, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 2 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          {word}
        </motion.span>
      ))}
    </>
  );
}

/**
 * During streaming: plain-text word-by-word fade for a smooth, natural reveal.
 * After streaming: full ReactMarkdown with formatting.
 * Memoized so completed messages skip re-renders on every incoming token.
 */
const AssistantMessageContent = memo(function AssistantMessageContent({
  text,
  isStreaming,
}: {
  text: string;
  isStreaming: boolean;
}) {
  if (isStreaming) {
    return (
      <div className={MARKDOWN_CLS}>
        <span className="whitespace-pre-wrap text-sm leading-relaxed">
          <StreamingText text={text} />
        </span>
        <motion.span
          className="inline-block w-[2px] h-[1em] bg-current ml-0.5 align-middle rounded-full"
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

export interface BullpenChatHandle {
  focusInput: () => void;
}

export const BullpenChat = forwardRef<BullpenChatHandle, BullpenChatProps>(function BullpenChat(
  { compact = false, user, starterPrompts, open, initialQuery, aiContext, onConsumedQuery, conversationId, initialMessages },
  ref
) {
  const router = useRouter();
  const { t, i18n } = useTranslation('ai');
  const resolvedStarterPrompts = starterPrompts ?? getDefaultStarterPrompts(t);
  const addHoldingMutation = useAddOrUpdateHolding();
  const updateHoldingMutation = useUpdateHoldingBySymbol();
  const removeHoldingMutation = useRemoveHoldingBySymbol();
  const { create: createAlert } = useAlerts();
  const invalidateQuota = useInvalidateQuota();
  const { lastTicker, noteTicker } = useAIPanel();
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = useRef('');
  const lastSentInitialQueryRef = useRef<string | null>(null);
  const [paywallQuota, setPaywallQuota] = useState<QuotaState | null>(null);
  // Stable for the lifetime of this mount — callers that want a switchable
  // history (AISidePanel) pass conversationId explicitly and remount via `key`.
  const [ownConversationId] = useState(() => conversationId ?? crypto.randomUUID());
  const activeConversationId = conversationId ?? ownConversationId;
  const [actionOutcomes, setActionOutcomes] = useState<Record<string, ActionOutcome>>({});
  // Message ids present when this chat mounted (i.e. loaded from a saved conversation) —
  // anything appended afterward is "live" and gets real pending/success/error tracking.
  const [historicalMessageIds] = useState(() => new Set((initialMessages ?? []).map((m) => m.id)));

  useImperativeHandle(ref, () => ({
    focusInput: () => textareaRef.current?.focus(),
  }));

  // Fall back to the last company discussed in ANY AI surface (main chat or the
  // in-chart assistant) when the page itself doesn't supply explicit context —
  // e.g. opening the widget from Discover or Holdings right after asking the
  // chart assistant about a company.
  const effectiveContext = aiContext ?? (lastTicker ? { tickers: [lastTicker], label: `${lastTicker} (previously discussed)` } : undefined);

  // useChat only reconstructs its underlying Chat instance (and the transport
  // below) when activeConversationId changes — see @ai-sdk/react's useChat,
  // which keys a chatRef off `id` and reuses it across renders otherwise. A
  // plain `body: {...}` object would therefore freeze at whatever
  // effectiveContext/user were when THIS conversation started: a user who
  // enables "let Bull see my holdings" or navigates to a different stock
  // mid-conversation would keep sending the stale values for the rest of it
  // (reported bug: Bull kept answering about a stock from earlier in the
  // conversation and kept saying holdings access wasn't enabled after the
  // user had already turned it on). prepareSendMessagesRequest below runs
  // fresh on every send, so reading through this ref — always updated on
  // render, unlike the closure captured at construction — keeps every field
  // live for the conversation's whole lifetime.
  const requestParamsRef = useRef({
    effectiveContext,
    experienceLevel: user?.experience_level ?? null,
    language: i18n.language,
    riskProfile: user?.risk_profile ?? null,
    investmentHorizon: (user?.settings as Record<string, unknown> | null)?.investment_horizon ?? null,
    responseStyle: (user?.settings as Record<string, unknown> | null)?.response_style ?? null,
    allowHoldingsContext: (user?.settings as Record<string, unknown> | null)?.allow_holdings_context === true,
  });
  requestParamsRef.current = {
    effectiveContext,
    experienceLevel: user?.experience_level ?? null,
    language: i18n.language,
    riskProfile: user?.risk_profile ?? null,
    investmentHorizon: (user?.settings as Record<string, unknown> | null)?.investment_horizon ?? null,
    responseStyle: (user?.settings as Record<string, unknown> | null)?.response_style ?? null,
    allowHoldingsContext: (user?.settings as Record<string, unknown> | null)?.allow_holdings_context === true,
  };

  const runClientAction = useCallback(
    async (action: ClientAction, key: string) => {
      if (action.type === 'navigate') {
        if (action.path) router.push(action.path);
        return;
      }

      setActionOutcomes((prev) => ({ ...prev, [key]: { status: 'pending' } }));

      try {
        if (action.type === 'addHolding') {
          await addHoldingMutation.mutateAsync({
            symbol: action.ticker,
            company_name: action.company_name,
            quantity: action.quantity ?? null,
            avg_price: action.avg_price ?? null,
            date_purchased: action.date_purchased ?? null,
          });
          setActionOutcomes((prev) => ({ ...prev, [key]: { status: 'success' } }));
        } else if (action.type === 'updateHolding') {
          await updateHoldingMutation.mutateAsync({
            symbol: action.ticker,
            quantity: action.quantity ?? undefined,
            avg_price: action.avg_price ?? undefined,
          });
          setActionOutcomes((prev) => ({ ...prev, [key]: { status: 'success' } }));
        } else if (action.type === 'removeHolding') {
          await removeHoldingMutation.mutateAsync(action.ticker);
          setActionOutcomes((prev) => ({ ...prev, [key]: { status: 'success' } }));
        } else if (action.type === 'createAlert') {
          const result = await createAlert({
            symbol: action.ticker,
            companyName: action.companyName,
            alertType: action.alertType,
            threshold: action.threshold,
          });
          if (result.ok) {
            setActionOutcomes((prev) => ({ ...prev, [key]: { status: 'success' } }));
          } else {
            setActionOutcomes((prev) => ({ ...prev, [key]: { status: 'error', message: result.error } }));
          }
        }
      } catch (err) {
        setActionOutcomes((prev) => ({
          ...prev,
          [key]: { status: 'error', message: err instanceof Error ? err.message : t('receiptGenericError') },
        }));
      }
    },
    [router, addHoldingMutation, updateHoldingMutation, removeHoldingMutation, createAlert, t]
  );

  const {
    messages,
    sendMessage,
    status,
    stop,
    error,
    clearError,
  } = useChat({
    id: activeConversationId,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: '/api/ai/chat',
      // Build the body fresh on every send instead of a static `body` object —
      // see the comment on requestParamsRef above for why a static object here
      // would go stale for the rest of the conversation.
      prepareSendMessagesRequest: ({ id, messages: reqMessages, trigger, messageId }) => {
        const p = requestParamsRef.current;
        return {
          body: {
            id,
            messages: reqMessages,
            trigger,
            messageId,
            conversationId: id,
            // Current page context (ticker + label) so the server-side agent
            // knows which stock/comparison the user is viewing without requiring them to type it.
            ...(p.effectiveContext ? { context: p.effectiveContext } : {}),
            ...(p.experienceLevel ? { experienceLevel: p.experienceLevel } : {}),
            language: p.language,
            ...(p.riskProfile ? { riskProfile: p.riskProfile } : {}),
            ...(p.investmentHorizon ? { investmentHorizon: p.investmentHorizon } : {}),
            ...(p.responseStyle ? { responseStyle: p.responseStyle } : {}),
            ...(p.allowHoldingsContext ? { allowHoldingsContext: true } : {}),
          },
        };
      },
    }),
    onError: (err) => {
      // Server returns 402 with body { error: 'quota_exceeded', quota: QuotaState }.
      // The transport surfaces the body as part of the error message; pick out the JSON.
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
      getCompletedToolCalls(message).forEach((call, i) => {
        if (call.clientAction) {
          void runClientAction(call.clientAction, `${message.id}::${i}`);
        }
      });
    },
  });

  const isStreaming = status === 'streaming' || status === 'submitted';
  const lastMessage = messages[messages.length - 1];
  const lastMessageHasText = lastMessage?.role === 'assistant' &&
    lastMessage.parts.some((p) => p.type === 'text' && p.text.trim().length > 0);
  // While a tool is running and the assistant hasn't started writing text yet, show what
  // it's doing ("Checking financial health…") instead of a generic "thinking" indicator.
  // Before the first tool call fires, or between tool calls while the model plans the next
  // step, fall back to a state label so there's always a real word on screen, not just dots.
  const toolStatusLabel = isStreaming && !lastMessageHasText
    ? getToolStatusLabel(getActiveToolName(lastMessage))
    : null;
  const thinkingLabel = isStreaming && !lastMessageHasText
    ? toolStatusLabel ?? (status === 'submitted' ? t('chatThinking') : t('chatReasoning'))
    : null;
  const followups = !isStreaming && lastMessage?.role === 'assistant' ? getFollowups(lastMessage) : [];

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

  // Send initial query when opened with one (e.g. from command palette), exactly
  // once per distinct query value. Comparing against the last-sent *value*
  // (rather than a boolean flag reset by a separate effect) keeps this safe
  // under React StrictMode's dev-only double-invocation of mount effects —
  // a flag-plus-reset-effect pair re-arms the guard on the synthetic second
  // pass and fires sendMessage() twice, which races the AI SDK's Chat instance
  // (two concurrent sendMessage calls on one Chat corrupt its internal
  // activeResponse state) and throws deep inside the SDK.
  useEffect(() => {
    if (!initialQuery || !open || lastSentInitialQueryRef.current === initialQuery) return;
    lastSentInitialQueryRef.current = initialQuery;
    sendMessage({ parts: [{ type: 'text', text: initialQuery }] });
    onConsumedQuery?.();
  }, [initialQuery, open, sendMessage, onConsumedQuery]);

  // Context-aware prompts when viewing a company or comparison
  const contextPrompts = aiContext
    ? aiContext.tickers.length >= 2
      ? [
          t('chatContextPromptProfitability'),
          t('chatContextPromptMargins'),
          t('chatContextPromptRevenueGrowth'),
        ]
      : [
          t('chatContextPromptSummarize', { ticker: aiContext.tickers[0] }),
          t('chatContextPromptRisks', { ticker: aiContext.tickers[0] }),
          t('chatContextPromptFilings', { ticker: aiContext.tickers[0] }),
        ]
    : [];
  const displayPrompts = contextPrompts.length > 0 ? contextPrompts : resolvedStarterPrompts;

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
      {/* Quota indicator (free users only — invisible for Pro) */}
      <div className="shrink-0 px-4 pt-3 flex justify-center">
        <QuotaIndicator feature="chat" unit={{ singular: t('chatUnitMessage'), plural: t('chatUnitMessages') }} />
      </div>

      {/* Quota wall (free user hit 15/day → upgrade prompt) */}
      <AiPaywallDialog
        open={paywallQuota !== null}
        onOpenChange={(o) => !o && setPaywallQuota(null)}
        featureName={t('askBull')}
        quota={paywallQuota ?? undefined}
      />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 space-y-4 scrollbar-hide">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4 py-8 text-center">
            <BullAiIcon pose="wave" size={132} />
            <div className="space-y-1">
              <p className="text-base font-semibold text-foreground">{t('chatImBull')}</p>
              <p className="text-xs text-muted-foreground max-w-[260px] leading-relaxed">
                {aiContext?.label
                  ? t('chatIntroWithContext', { label: aiContext.label })
                  : t('chatIntroDefault')}
              </p>
            </div>
            <motion.div
              className="flex flex-wrap gap-2 justify-center mt-2 max-w-[340px]"
              initial="hidden"
              animate="visible"
              variants={{ visible: { transition: { staggerChildren: 0.06 } }, hidden: {} }}
            >
              {displayPrompts.map((suggestion) => (
                <motion.button
                  key={suggestion}
                  variants={{
                    hidden: { opacity: 0, y: 8 },
                    visible: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' } },
                  }}
                  onClick={() => {
                    sendMessage({ parts: [{ type: 'text', text: suggestion }] });
                    refocusInput();
                  }}
                  className="inline-flex items-center text-xs px-4 min-h-[44px] rounded-full border border-border bg-muted/40 hover:bg-muted/80 hover:border-primary/30 text-muted-foreground hover:text-foreground transition-all duration-200 hover:shadow-sm active:scale-[0.97]"
                >
                  {suggestion}
                </motion.button>
              ))}
            </motion.div>
          </div>
        )}

        {messages.map((message) => {
          const isUser = message.role === 'user';
          return (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className={cn('flex items-end gap-2', isUser ? 'justify-end' : 'justify-start')}
            >
              {!isUser && <BullAiIcon pose="idle" size={32} className="mb-0.5" />}
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
                  <>
                    {(() => {
                      const toolCalls = getCompletedToolCalls(message);
                      return toolCalls.map((call, i) => {
                        const actionKey = `${message.id}::${i}`;
                        return (
                          <ToolResultCard
                            key={`${message.id}-tool-${i}`}
                            toolName={call.toolName}
                            output={call.output}
                            siblingCalls={toolCalls}
                            clientAction={call.clientAction}
                            actionOutcome={call.clientAction ? actionOutcomes[actionKey] : undefined}
                            isHistorical={historicalMessageIds.has(message.id)}
                            onRetryAction={call.clientAction ? () => runClientAction(call.clientAction!, actionKey) : undefined}
                          />
                        );
                      });
                    })()}
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
                  </>
                )}
              </div>
              {isUser && (
                <div className="shrink-0 rounded-full overflow-hidden mb-0.5 h-8 w-8 ring-2 ring-primary/30">
                  {user?.avatar_url ? (
                    <Image
                      src={user.avatar_url}
                      alt={user.full_name ?? user.email}
                      width={32}
                      height={32}
                      className="object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center bg-primary text-primary-foreground text-sm font-semibold">
                      {user
                        ? (user.full_name ?? user.email).charAt(0).toUpperCase()
                        : <User className="h-4 w-4" />}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          );
        })}

        {/* Thinking / tool-status indicator — shows the actual state (tool label,
            "Thinking…", "Reasoning…") instead of a generic loading affordance. */}
        {isStreaming && !lastMessageHasText && thinkingLabel && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="flex items-end gap-2 justify-start"
          >
            <BullAiIcon pose="think" size={32} className="mb-0.5" />
            <div className="bg-muted rounded-2xl rounded-bl-sm px-3.5 py-2.5">
              <motion.span
                key={thinkingLabel}
                className="text-xs text-muted-foreground"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0.55, 1, 0.55] }}
                transition={{ opacity: { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } }}
              >
                {thinkingLabel}
              </motion.span>
            </div>
          </motion.div>
        )}

        {/* Follow-up suggestions after the assistant's latest answer */}
        {followups.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="flex flex-wrap gap-2 pl-10"
          >
            {followups.map((s) => (
              <button
                key={s}
                onClick={() => {
                  sendMessage({ parts: [{ type: 'text', text: s }] });
                  refocusInput();
                }}
                className="inline-flex items-center text-xs px-3.5 min-h-[44px] rounded-full border border-border bg-muted/40 hover:bg-muted/80 hover:border-primary/30 text-muted-foreground hover:text-foreground transition-all duration-200 active:scale-[0.97]"
              >
                {s}
              </button>
            ))}
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Error bar */}
      {error && (
        <div className="mx-3 mb-1 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-xs flex items-center justify-between gap-2">
          <span className="truncate">{friendlyChatError(error.message, t)}</span>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => {
                const lastUser = [...messages].reverse().find((m) => m.role === 'user');
                const lastText =
                  (lastUser?.parts as Array<{ type: string; text?: string }>)
                    ?.find((p) => p.type === 'text')?.text ?? '';
                if (!lastText) return;
                clearError();
                sendMessage({ parts: [{ type: 'text', text: lastText }] });
                refocusInput();
              }}
              className="shrink-0 underline"
            >
              {t('receiptRetry')}
            </button>
            <button onClick={clearError} className="shrink-0 underline">
              {t('chatDismiss')}
            </button>
          </div>
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
          placeholder={t('chatInputPlaceholder')}
          tabIndex={0}
          aria-label={t('chatInputAriaLabel')}
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
            className="shrink-0 h-11 w-11 rounded-xl"
            title={t('chatStopGenerating')}
          >
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            onMouseDown={(e) => e.preventDefault()}
            className="shrink-0 h-11 w-11 rounded-xl"
            title={t('chatSendMessage')}
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </form>
    </div>
  );
});
