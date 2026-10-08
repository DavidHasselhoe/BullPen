'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { UIMessage } from 'ai';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle, memo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowDown, Check, Copy, RotateCcw, Send, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AuthUser } from '@/lib/auth/auth';
import { useStickToBottom } from '@/hooks/use-stick-to-bottom';
import { useSmoothText } from '@/hooks/use-smooth-text';
import type { QuotaState } from '@/lib/billing/quotas';
import { useAddOrUpdateHolding, useUpdateHoldingBySymbol, useRemoveHoldingBySymbol } from '@/hooks/use-holdings';
import { useAlerts } from '@/hooks/use-alerts';
import { QuotaIndicator } from '@/components/billing/QuotaIndicator';
import { AiPaywallDialog } from '@/components/billing/AiPaywallDialog';
import { useInvalidateQuota } from '@/hooks/use-quota';
import { useAIPanel, type ScreenerAIContext } from '@/components/ai/AIPanelProvider';
import { ToolResultCard } from '@/components/ai/ToolResultCard';
import { BullAiIcon } from '@/components/ai/BullAiIcon';
import { getActiveToolName, getToolStatusLabel, getCompletedToolCalls, getFollowups, extractTickers, useNavigateConfirmations, type ClientAction, type ActionOutcome } from '@/lib/ai/tool-ux';

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
  screener?: ScreenerAIContext;
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
  // The server's onError sanitizer (toSafeErrorMessage) returns one of these
  // stable codes rather than English prose — it runs with no access to the
  // user's language, so the actual copy has to come from the client's own
  // i18n instead. Anything else reaching here is an unexpected raw error
  // (network failure, a future regression) and falls through to the same
  // "technical-looking → generic" heuristic as before.
  // `rate_limited:12` carries the wait OpenAI asked for. Telling someone how
  // long is the difference between "this is broken" and "this is busy", and
  // it is the single most common failure here.
  if (message?.startsWith('rate_limited:')) {
    const seconds = Number(message.slice('rate_limited:'.length));
    if (Number.isFinite(seconds) && seconds > 0) return t('chatRateLimitedWithWait', { seconds });
    return t('chatRateLimited');
  }
  if (message === 'rate_limited') return t('chatRateLimited');
  if (message === 'unavailable') return t('chatUnavailable');
  if (message === 'generic' || !message) return t('chatGenericError');
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
  '[&_p]:my-2 [&_p]:first:mt-0 [&_p]:last:mb-0',
  '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:space-y-0.5',
  '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:space-y-0.5',
  '[&_strong]:font-semibold',
  '[&_code]:bg-muted-foreground/20 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs',
  '[&_pre]:bg-muted-foreground/10 [&_pre]:p-2 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:my-2',
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
  '[&_a]:underline [&_a]:hover:opacity-80',
  '[&_table]:w-full [&_table]:text-xs [&_table]:tabular-nums',
  '[&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_th]:whitespace-nowrap [&_th]:border-b [&_th]:border-border',
  '[&_td]:px-2 [&_td]:py-1 [&_td]:align-top [&_td]:border-b [&_td]:border-border/50'
);

/** Tables scroll inside the bubble instead of pushing it past the panel edge. */
const MARKDOWN_COMPONENTS: Components = {
  table: ({ node: _node, ...props }) => (
    <div className="my-2 -mx-1 overflow-x-auto">
      <table {...props} />
    </div>
  ),
  // In-app links navigate client-side: a plain <a> reloaded the page and
  // wiped the open conversation. Outside links open in a new tab.
  a: ({ node: _node, href, ...props }) =>
    href?.startsWith('/') ? (
      <Link href={href} {...props} />
    ) : (
      <a href={href} target="_blank" rel="noopener noreferrer" {...props} />
    ),
};

/** The reply's text as written (markdown), for copying and screen-reader announcements. */
function messageText(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

/**
 * Markdown renders while streaming too, so bold, lists and headings format as
 * they arrive instead of showing raw syntax until the stream ends. Partial
 * syntax (an unclosed `**`) stays literal until its closer arrives.
 * Memoized so completed messages skip re-renders on every incoming token.
 */
const AssistantMessageContent = memo(function AssistantMessageContent({
  text,
  isStreaming,
}: {
  text: string;
  isStreaming: boolean;
}) {
  // Released at a steady writing pace rather than in the bursts the model
  // streams in; keeps going briefly after the stream ends to finish the backlog.
  const { visible, catchingUp } = useSmoothText(text, isStreaming);
  if (isStreaming || catchingUp) {
    return (
      // `[&>p:last-child]:inline` keeps the caret on the same line as the last
      // paragraph instead of dropping it onto a line of its own.
      <div className={cn(MARKDOWN_CLS, '[&>p:last-child]:inline')}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>{visible}</ReactMarkdown>
        {/* CSS, not framer: the global reduced-motion rule stops it. */}
        <span
          className="ml-0.5 inline-block h-[1em] w-[2px] rounded-full bg-current align-middle [animation:blink_1.1s_steps(1)_infinite]"
          aria-hidden
        />
      </div>
    );
  }

  return (
    <div className={MARKDOWN_CLS}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>{text}</ReactMarkdown>
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
  const { scrollRef, contentRef, isAtBottom, scrollToBottom } = useStickToBottom();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [hasInput, setHasInput] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // The reply the reader stopped, so it is marked as cut short rather than
  // looking like a finished answer.
  const [stoppedId, setStoppedId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const translateUx = useCallback((key: string, english: string) => t(key, { defaultValue: english }), [t]);
  const inputRef = useRef('');
  const lastSentInitialQueryRef = useRef<string | null>(null);
  const [paywallQuota, setPaywallQuota] = useState<QuotaState | null>(null);
  // Stable for the lifetime of this mount — callers that want a switchable
  // history (AISidePanel) pass conversationId explicitly and remount via `key`.
  const [ownConversationId] = useState(() => conversationId ?? crypto.randomUUID());
  const activeConversationId = conversationId ?? ownConversationId;
  const [actionOutcomes, setActionOutcomes] = useState<Record<string, ActionOutcome>>({});
  const { getDecision: getNavigateDecision, confirm: confirmNavigate, decline: declineNavigate } = useNavigateConfirmations(router.push);
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
    regenerate,
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
      // One announcement per finished reply; announcing per token would talk over itself.
      const plain = messageText(message).replace(/[*_#`>|]+/g, '').trim();
      if (plain) setAnnouncement(t('chatReplyAnnouncement', { text: plain }));
      const tickers = extractTickers(message);
      if (tickers.length) noteTicker(tickers[tickers.length - 1]);
      getCompletedToolCalls(message).forEach((call, i) => {
        // Only a navigation the user explicitly asked for runs on its own.
        // Everything that changes their account (holdings, alerts) waits for
        // Confirm on its card, and a suggested navigation for Yes/No.
        if (call.clientAction?.type === 'navigate' && !call.clientAction.requiresConfirmation) {
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
    ? getToolStatusLabel(getActiveToolName(lastMessage), translateUx)
    : null;
  const thinkingLabel = isStreaming && !lastMessageHasText
    ? toolStatusLabel ?? (status === 'submitted' ? t('chatThinking') : t('chatReasoning'))
    : null;
  const followups = !isStreaming && lastMessage?.role === 'assistant' ? getFollowups(lastMessage, 3, translateUx) : [];

  // Focus the input on mount: for the full-page chat, and for the side panel's
  // first open, where the chunk loads after the panel's own focus timer fired
  // (so the first open used to leave focus nowhere).
  useEffect(() => {
    if (open === false) return;
    const id = setTimeout(() => textareaRef.current?.focus({ preventScroll: true }), 0);
    return () => clearTimeout(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Sending always brings the reader back to the conversation's end. */
  const send = (text: string) => {
    setStoppedId(null);
    sendMessage({ parts: [{ type: 'text', text }] });
    requestAnimationFrame(() => scrollToBottom('smooth'));
    refocusInput();
  };

  const copyReply = async (message: UIMessage) => {
    try {
      await navigator.clipboard.writeText(messageText(message));
      setCopiedId(message.id);
      setTimeout(() => setCopiedId((id) => (id === message.id ? null : id)), 1500);
    } catch {
      // Clipboard blocked (permissions, insecure context): nothing useful to say.
    }
  };

  const regenerateReply = () => {
    setStoppedId(null);
    clearError();
    void regenerate();
    requestAnimationFrame(() => scrollToBottom('smooth'));
  };

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

  // Context-aware prompts when viewing the screener, a company or a comparison
  const contextPrompts = aiContext?.screener
    ? Object.keys(aiContext.screener.filters).length === 0
      ? [
          t('chatScreenerPromptWhatToLookFor'),
          t('chatScreenerPromptCandidates'),
          t('chatScreenerPromptHealthiest'),
        ]
      : [
          t('chatScreenerPromptReviewFilters'),
          t('chatScreenerPromptHealthiest'),
          t('chatScreenerPromptCheapest'),
        ]
    : aiContext?.tickers.length
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

    send(text);

    inputRef.current = '';
    setHasInput(false);
    if (textareaRef.current) {
      textareaRef.current.value = '';
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // isComposing: Enter that confirms a Japanese/Chinese IME candidate must
    // not send the half-typed message.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    inputRef.current = e.target.value;
    setHasInput(e.target.value.trim().length > 0);
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

  const chipClass =
    'inline-flex items-center rounded-full border border-border bg-muted/40 px-3.5 min-h-11 text-left text-xs text-muted-foreground transition-colors duration-150 hover:border-foreground/20 hover:bg-muted/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]';
  const actionClass =
    'inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    // reducedMotion="user": framer's own animations (message entrance, chip
    // stagger) honour prefers-reduced-motion like the CSS ones already do.
    <MotionConfig reducedMotion="user">
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

      {/* One announcement per finished reply, for screen readers. */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>

      {/* Messages. The reader owns the scroll: it follows a reply only while
          they're at the bottom, and stays put the moment they scroll up. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
          <div ref={contentRef} className="flex min-h-full flex-col gap-5 px-4 py-4">
        {messages.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 py-8 text-center">
            <BullAiIcon pose="wave" size={120} />
            <div className="space-y-1">
              <p className="text-base font-semibold text-foreground">{t('chatImBull')}</p>
              <p className="text-xs text-muted-foreground max-w-[280px] leading-relaxed">
                {aiContext?.label
                  ? t('chatIntroWithContext', { label: aiContext.label })
                  : t('chatIntroDefault')}
              </p>
            </div>
            <motion.div
              className="mt-2 flex w-full max-w-[340px] flex-col items-stretch gap-2"
              initial="hidden"
              animate="visible"
              variants={{ visible: { transition: { staggerChildren: 0.05 } }, hidden: {} }}
            >
              {displayPrompts.map((suggestion) => (
                <motion.button
                  key={suggestion}
                  type="button"
                  variants={{
                    hidden: { opacity: 0, y: 6 },
                    visible: { opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.25, 1, 0.5, 1] } },
                  }}
                  onClick={() => send(suggestion)}
                  className={cn(chipClass, 'justify-center rounded-xl')}
                >
                  {suggestion}
                </motion.button>
              ))}
            </motion.div>
          </div>
        )}

        {messages.map((message) => {
          const isUser = message.role === 'user';
          const toolCalls = isUser ? [] : getCompletedToolCalls(message);
          const hasText = message.parts.some((p) => p.type === 'text' && p.text.trim().length > 0);
          const isLatest = message.id === lastMessage?.id;
          // True while this is the newest assistant message and no text has
          // streamed in for its CURRENT step yet — including right after a
          // tool call (e.g. a navigate action) completes and the model moves
          // into another step before producing text. The dedicated
          // thinking/tool-status bubble below covers that state on its own;
          // rendering AssistantMessageContent's empty-text cursor here too
          // would show a second, bare bubble right next to "Reasoning…",
          // reading as two separate replies instead of one in-progress one.
          const isAwaitingNextStep = !isUser && isStreaming && isLatest && !hasText;
          if (isAwaitingNextStep && toolCalls.length === 0) return null;
          // Navigation prompts go after the text: the reply ends on the
          // question the Yes/No buttons answer. Data cards stay on top.
          const renderToolCall = (call: (typeof toolCalls)[number], i: number) => {
            const actionKey = `${message.id}::${i}`;
            const navigateAction = call.clientAction?.type === 'navigate' ? call.clientAction : undefined;
            return (
              <ToolResultCard
                key={`${message.id}-tool-${i}`}
                toolName={call.toolName}
                output={call.output}
                siblingCalls={toolCalls}
                clientAction={call.clientAction}
                actionOutcome={call.clientAction ? actionOutcomes[actionKey] : undefined}
                navigateDecision={navigateAction ? getNavigateDecision(actionKey) : undefined}
                onConfirmNavigate={navigateAction ? () => confirmNavigate(actionKey, navigateAction.path) : undefined}
                onDeclineNavigate={navigateAction ? () => declineNavigate(actionKey) : undefined}
                isHistorical={historicalMessageIds.has(message.id)}
                onRetryAction={call.clientAction ? () => runClientAction(call.clientAction!, actionKey) : undefined}
                onConfirmAction={call.clientAction ? () => runClientAction(call.clientAction!, actionKey) : undefined}
                onCancelAction={() => setActionOutcomes((prev) => ({ ...prev, [actionKey]: { status: 'cancelled' } }))}
              />
            );
          };
          // Anything that asks the user something (navigate Yes/No, confirm a
          // change to their account) goes after the text, which ends on that question.
          const isNavigate = (call: (typeof toolCalls)[number]) => !!call.clientAction;

          if (isUser) {
            return (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
                className="flex justify-end"
              >
                <div className="min-w-0 max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-sm leading-relaxed text-primary-foreground">
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
              </motion.div>
            );
          }

          // Bull's replies read as a document, full width and unbubbled: a
          // 400-word answer squeezed into an 82% bubble was a ~45-character
          // column more than two panels tall.
          const replyDone = !(isStreaming && isLatest) && hasText;
          return (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
              className="group/reply min-w-0 space-y-2 text-sm leading-relaxed text-foreground"
            >
              {toolCalls.map((call, i) => (isNavigate(call) ? null : renderToolCall(call, i)))}
              {!isAwaitingNextStep && (
                <AssistantMessageContent
                  text={messageText(message)}
                  isStreaming={isStreaming && isLatest}
                />
              )}
              {toolCalls.map((call, i) => (isNavigate(call) ? renderToolCall(call, i) : null))}

              {stoppedId === message.id && (
                <p className="text-xs text-muted-foreground">{t('chatStopped')}</p>
              )}

              {/* Actions: always on the latest reply, on hover or focus for older ones. */}
              {replyDone && (
                <div
                  className={cn(
                    '-ml-1.5 flex items-center gap-0.5 transition-opacity duration-150',
                    !isLatest && 'opacity-0 group-hover/reply:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100'
                  )}
                >
                  <button type="button" onClick={() => copyReply(message)} className={actionClass} aria-label={t('chatCopyReply')} title={t('chatCopyReply')}>
                    {copiedId === message.id ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                  </button>
                  {isLatest && (
                    <button type="button" onClick={regenerateReply} className={actionClass} aria-label={t('chatRegenerate')} title={t('chatRegenerate')}>
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  )}
                  {copiedId === message.id && (
                    <span className="ml-1 text-xs text-muted-foreground" role="status">{t('chatCopied')}</span>
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
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
            className="flex items-center gap-2"
            role="status"
          >
            <BullAiIcon pose="think" size={28} />
            <motion.span
              key={thinkingLabel}
              className="text-xs text-muted-foreground"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.55, 1, 0.55] }}
              transition={{ opacity: { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } }}
            >
              {thinkingLabel}
            </motion.span>
          </motion.div>
        )}

        {/* Follow-up suggestions after the assistant's latest answer */}
        {followups.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
            className="flex flex-wrap gap-2"
          >
            {followups.map((s) => (
              <button key={s} type="button" onClick={() => send(s)} className={chipClass}>
                {s}
              </button>
            ))}
          </motion.div>
        )}
          </div>
        </div>

        {/* Back to the conversation's end, shown only once the reader has
            scrolled away from it. */}
        <AnimatePresence>
          {!isAtBottom && messages.length > 0 && (
            <motion.button
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
              onClick={() => scrollToBottom('smooth')}
              className="absolute bottom-3 left-1/2 z-10 inline-flex h-9 -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-background/95 px-3.5 text-xs font-medium text-foreground shadow-md backdrop-blur-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowDown className="h-3.5 w-3.5" aria-hidden />
              {t('chatJumpToLatest')}
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Error bar */}
      {error && (
        <div role="alert" className="mx-3 mb-1 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-xs flex items-center justify-between gap-2">
          <span>{friendlyChatError(error.message, t)}</span>
          <div className="flex items-center gap-3 shrink-0">
            {/* regenerate(), not a resend: resending appended a second,
                identical question to the conversation. */}
            <button type="button" onClick={regenerateReply} className="shrink-0 underline">
              {t('receiptRetry')}
            </button>
            <button type="button" onClick={clearError} className="shrink-0 underline">
              {t('chatDismiss')}
            </button>
          </div>
        </div>
      )}

      {/* Input - click-to-focus on form padding ensures input is focusable */}
      <form
        onSubmit={handleSubmit}
        onClick={handleFormClick}
        className="shrink-0 border-t border-border/50 bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-end gap-2"
      >
        <textarea
          ref={textareaRef}
          rows={1}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={t('chatInputPlaceholder')}
          aria-label={t('chatInputAriaLabel')}
          className="flex-1 resize-none rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring max-h-[120px] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          style={{ height: 'auto' }}
        />
        {isStreaming ? (
          <Button
            type="button"
            size="icon"
            variant="outline"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (lastMessage?.role === 'assistant') setStoppedId(lastMessage.id);
              stop();
              refocusInput();
            }}
            className="shrink-0 h-11 w-11 rounded-xl"
            aria-label={t('chatStopGenerating')}
            title={t('chatStopGenerating')}
          >
            <Square className="h-4 w-4" aria-hidden />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            disabled={!hasInput}
            onMouseDown={(e) => e.preventDefault()}
            className="shrink-0 h-11 w-11 rounded-xl"
            aria-label={t('chatSendMessage')}
            title={t('chatSendMessage')}
          >
            <Send className="h-4 w-4" aria-hidden />
          </Button>
        )}
      </form>
    </div>
    </MotionConfig>
  );
});
