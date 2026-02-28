# BullPen AI Chatbot — Setup & Verification

## Step 1: Install Dependencies

```bash
npm install ai @ai-sdk/openai @ai-sdk/react
```

Already installed if you ran the scaffold.

---

## Step 2: Environment Setup

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Add your OpenAI API key in `.env.local`:
   ```
   OPENAI_API_KEY=sk-...
   ```

**Where the key is used:** The `@ai-sdk/openai` provider reads `OPENAI_API_KEY` when calling `openai('gpt-4o')` in `lib/ai/agent.ts`. The key is never sent to the client.

---

## Step 3: Folder Structure

| Path | Responsibility |
|------|----------------|
| `lib/ai/systemPrompt.ts` | BullPen AI system prompt and behavior |
| `lib/ai/agent.ts` | Agent logic: `streamText`, model, system prompt, tool-ready structure |
| `app/api/ai/chat/route.ts` | POST handler: reads messages, calls `runAgent()`, returns streamed response |
| `components/ai/BullpenChat.tsx` | Chat UI: `useChat`, message list, input, streaming |

---

## Step 4: System Prompt

`lib/ai/systemPrompt.ts` defines BullPen AI as:
- Investment research assistant
- Clear explainer of financial concepts
- Analytical and structured
- No financial advice or recommendations
- Concise but informative

---

## Step 5: Agent Layer

`lib/ai/agent.ts` uses:
- `streamText` from `ai`
- `openai('gpt-4o')` from `@ai-sdk/openai`
- `SYSTEM_PROMPT` injection
- `convertToModelMessages` for UI → model format
- Ready to add `tools` later

---

## Step 6: API Route

`app/api/ai/chat/route.ts`:
- POST handler
- Reads `messages` from request body
- Calls `runAgent(messages)`
- Returns `result.toUIMessageStreamResponse()` for streaming

---

## Step 7: Chat UI

`components/ai/BullpenChat.tsx`:
- Client component
- `useChat` with `DefaultChatTransport({ api: '/api/ai/chat' })`
- Message list with user/assistant styling
- Streaming responses enabled
- Input + submit; Enter to send

---

## Step 8: Example Usage

Import and render `<BullpenChat />` on any page:

```tsx
import { BullpenChat } from '@/components/ai/BullpenChat';

export default function ChatPage() {
  return <BullpenChat />;
}
```

**Built-in page:** `/tools/ai-chat` (Tools → BullPen AI in nav)

---

## Step 9: Verification Checklist

- [ ] `npm install ai @ai-sdk/openai @ai-sdk/react`
- [ ] Add `OPENAI_API_KEY` to `.env.local`
- [ ] `npm run dev`
- [ ] Open http://localhost:3000/tools/ai-chat (or Tools → BullPen AI)
- [ ] Send a message (e.g. "What is EBITDA?")
- [ ] Confirm streaming: text appears progressively, not all at once
