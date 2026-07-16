/**
 * Persistence for "Ask Bull" chat history (`ai_conversations` table).
 * The full UIMessage[] array — including tool-call parts — is stored as JSONB
 * so it round-trips directly with the AI SDK's `useChat` on load.
 */

import type { UIMessage } from 'ai';
import { createServerClient } from '@/lib/supabase/client';

const TITLE_MAX_LENGTH = 48;

/** Derives a conversation title from the first user message, stripping the hidden
 *  [display:...] prefix used by starter-prompt buttons (see BullpenChat.tsx). */
export function deriveConversationTitle(messages: UIMessage[]): string {
  const firstUserMessage = messages.find((m) => m.role === 'user');
  const firstUserText = firstUserMessage?.parts.find(
    (p): p is { type: 'text'; text: string } => p.type === 'text'
  )?.text ?? '';
  const displayMatch = firstUserText.match(/^\[display:([^\]]+)\]/);
  const clean = (displayMatch ? displayMatch[1] : firstUserText).trim();
  if (!clean) return 'New chat';
  return clean.length > TITLE_MAX_LENGTH ? `${clean.slice(0, TITLE_MAX_LENGTH).trimEnd()}…` : clean;
}

/**
 * Upserts the full message list for a conversation once a turn finishes streaming.
 * `conversationId` is client-generated, so before writing we confirm the row (if it
 * already exists) actually belongs to this user — otherwise a guessed/reused UUID
 * could let one user overwrite another's conversation. Best-effort: persistence
 * failures never throw, since they shouldn't break the chat response itself.
 */
export async function saveConversation(
  conversationId: string,
  userId: string,
  messages: UIMessage[]
): Promise<void> {
  try {
    // `ai_conversations` predates the last generated Database type — cast, same as
    // other tables added ahead of a type regen (see screener-stats.ts's stampUniverse).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createServerClient() as any;

    const { data: existing } = await supabase
      .from('ai_conversations')
      .select('user_id')
      .eq('id', conversationId)
      .maybeSingle();

    if (existing && existing.user_id !== userId) return;

    await supabase.from('ai_conversations').upsert(
      {
        id: conversationId,
        user_id: userId,
        title: deriveConversationTitle(messages),
        messages,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
  } catch {
    // Persistence is best-effort — never let a save failure surface to the chat UI.
  }
}
