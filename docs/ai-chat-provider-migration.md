# Moving Bull's chat off gpt-4o — research, 2026-09-22

Status: **shipped 2026-09-22.** Ask Bull and the in-chart assistant both run on
`claude-sonnet-5` with prompt caching on. What follows is the original research
plus, at the end, what the live numbers turned out to be. They differ from the
projection in a way that matters.

## Why this came up

Users were getting "Something went wrong. Please try again." on ordinary chat
messages, and a manual retry always worked. Root cause, from Vercel runtime
errors on `/api/ai/chat` (7 occurrences, 2026-09-18 to 2026-09-21, all one
user):

```
Rate limit reached for gpt-4o in organization org-... on tokens per min (TPM):
Limit 30000, Used 23301, Requested 12307. Please try again in 11.216s.
```

The message sanitizer was fixed separately (commit `a35c56d3`) so these now
read as "try again in about 12 seconds" instead of a generic failure. That made
the error honest. It did not make it rarer, which is what this document is for.

## The measurements

**OpenAI org limit: 30,000 TPM for gpt-4o.** Every failure carried
`sequence_number: 2`, i.e. the step *after* a tool call, where the whole system
prompt and every tool schema is re-sent to interpret the tool result.

From `ai_usage`, last 30 days:

| feature | model | calls | avg in | avg out | max in | cost |
|---|---|---|---|---|---|---|
| chat | gpt-4o | 114 | 9,616 | 111 | 12,883 | $2.49 |

**9,616 tokens in, 111 out. An 87:1 ratio.** The request is almost entirely
fixed overhead.

Worst minutes, same table: 36,456 / 32,980 / 32,815 tokens — all three-message
minutes, all over the 30,000 ceiling. **Three chat messages in one minute from
a single user exceeds the limit.** Rows with null token counts are the failed
calls; usage never backfills when the stream errors.

Where the overhead comes from, measured with Anthropic's `count_tokens`
endpoint (not a chars/4 estimate):

- **`SYSTEM_PROMPT`: 9,022 tokens.** That is 73% of an average request on its own.
- **23 tools** in `BULLPEN_TOOLS`, plus up to 3 conditional ones
  (`createAlert`, `getPortfolioContext`, `getInsiderActivity`).
  Their descriptions alone are 9,429 characters (~2,357 tokens); JSON schemas
  are extra.

> CLAUDE.md says the prompt "documents all 16 tools". That is stale — there are
> 23 in the static map. Worth correcting whenever this is touched.

**Anthropic limits on this same account**, read from live response headers
(`anthropic-ratelimit-*`), identical across `claude-sonnet-5`, `claude-opus-5`
and `claude-haiku-4-5`:

| limit | Anthropic (this account) | OpenAI (this account, gpt-4o) |
|---|---|---|
| input tokens / min | **10,000,000** | 30,000 (combined) |
| output tokens / min | 2,000,000 | — |
| combined tokens / min | 12,000,000 | 30,000 |
| requests / min | 10,000 | — |

**333x more input headroom.** At 12,307 tokens a step that is ~812 steps per
minute instead of ~2.4. Corroborated by real traffic: the Instagram pipeline
already pushes single Anthropic requests of 294,855 input tokens — one request
roughly ten times OpenAI's entire per-minute budget here.

## The stack is already Anthropic

From the same `ai_usage` rollup: `daily_brief`, `deep_dive`, `risk_analysis`,
`portfolio_builder`, `weekly_pick_scout`, `weekly_pick_commit`, `csv_import`,
`why_today` and `instagram_content` all run on Claude (`claude-sonnet-4-6`,
`claude-sonnet-5`, `claude-haiku-4-5-20251001`).

Only three features are still OpenAI: `chat` and `compare_explain` (gpt-4o) and
`competitors` (gpt-4o). The last two cost **$0.08/month combined**.

So gpt-4o is the last holdout, for the flagship feature, and it is the oldest
model in the stack.

## Recommendation

**Move chat to Claude. Do not pay to raise the OpenAI tier** — that buys
headroom for a provider the app is otherwise finished with.

Order of work, highest value per unit of risk:

1. **Fix the system-prompt prefix order** (prerequisite for caching, see below).
2. **Migrate chat to Claude with prompt caching on.**
3. **Slim the 9,022-token system prompt.** Provider-independent; helps cost,
   latency and limits whatever the model is. Do it as its own measured change
   so any quality regression is attributable.

## Migration notes

### Package version — this is the trap

`@ai-sdk/anthropic@latest` is **4.x**, which depends on `@ai-sdk/provider@4.x`.
The installed `ai@6.0.100` and `@ai-sdk/openai@3.0.33` both use
`@ai-sdk/provider@3.0.8`. Mixing provider majors will not work.

The npm dist-tags carry the answer:

```
latest  -> 4.0.59      (for ai v7)
ai-v6   -> 3.0.119     (for ai v6)  <- this one
```

```bash
npm install @ai-sdk/anthropic@ai-v6     # 3.0.119 -> @ai-sdk/provider 3.0.16
```

No core upgrade needed. "Add a package and change one line" is only true with
that pin.

### Code surface

Small. `streamText`, the tool definitions, `stopWhen`, `maxOutputTokens` and
`abortSignal` are all provider-agnostic, and the tools are already SDK-native
so they port unchanged.

- `lib/ai/agent.ts` — `openai('gpt-4o')` -> `anthropic('claude-sonnet-5')`
- `lib/ai/chart-agent.ts` — same
- `lib/billing/pricing.ts` — `calcCost()` needs Claude rates or chat cost
  logging silently goes wrong
- `lib/billing/log-ai-call.ts` callers pass `model: 'gpt-4o'` as a literal in
  `app/api/ai/chat/route.ts` — update or the `ai_usage` rows lie

### Prompt caching, and the bug blocking it

Caching is a **prefix match**, rendered `tools` -> `system` -> `messages`.
Anything volatile before the breakpoint invalidates everything after it.

`lib/ai/agent.ts` currently builds:

```ts
system: languagePrefix + experiencePrefix + riskPrefix + horizonPrefix
      + stylePrefix + contextPrefix + SYSTEM_PROMPT
```

Every one of those prefixes varies by user and by page, and they are all
**prepended** to the 9,022-token constant. As written this would produce a 0%
cache hit rate. The order has to invert: `SYSTEM_PROMPT` first, cache
breakpoint, then the per-request prefixes.

Verify with `usage.cache_read_input_tokens` — if it is zero across repeated
requests, something is still invalidating the prefix.

### Economics, as projected and as measured

The projection below was wrong in one important way, kept because the error is
instructive: it assumed ~9,600 input tokens, taken from gpt-4o's logged average.

| | per call |
|---|---|
| gpt-4o (measured, 9,616 in) | $0.0218 |
| Sonnet 5, projected uncached | ~$0.0203 |
| Sonnet 5, projected cached | ~$0.004 |

**Measured live** (`npm run test-chat-provider`, 2026-09-22): the same request is
**18,819 input tokens** on Claude, not 9,616. The prompt is 9,022 of those and the
23 tool schemas are the other ~9,700. Claude counts the same payload roughly 1.5x
heavier than gpt-4o did.

| | per call |
|---|---|
| Sonnet 5, cold turn (writes the cache at 1.25x) | **$0.0475** |
| Sonnet 5, warm turn (reads it at 0.1x) | **$0.0045** |
| Sonnet 5, uncached | $0.038 |
| gpt-4o, for comparison | $0.0218 |

So **uncached Sonnet is more expensive than gpt-4o was**, and a cold cached turn
is more expensive still. Caching pays from the second turn of a conversation
onwards, which is the normal case for a chat but not for a one-shot question. A
three-turn session averages about $0.019 a turn against $0.038 uncached.

Free tier at 15 turns a day, as five three-turn sessions: about **$8 a month**
worst case, against a $12 Pro subscription. Not comfortable. The lever is the
tool schemas: half the payload, and ten of the 23 tools are navigation ones that
could plausibly collapse into a single tool with an enum. Haiku 4.5 is exactly
half Sonnet across every row above if that is ever needed instead.

## Open questions before shipping

- **Quality.** The 9,022-token prompt and 23 tool descriptions are tuned
  against gpt-4o's instruction-following. Claude's differs. Needs a real
  side-by-side on actual questions, weighted toward tool-using turns since
  those are what fail today. Do not flip on a one-line swap and hope.
- **Which model.** Sonnet 5 is the like-for-like candidate on cost. Opus 5 is
  the quality option at $5/$25. Haiku 4.5 ($1/$5, 200K context) is plausible
  for a chat assistant that averages 111 output tokens, and worth including in
  the comparison rather than assuming it is too weak.
- **`maxRetries: 3` in `agent.ts`** exists for OpenAI's transient TPM 429s.
  Revisit once the ceiling is 333x higher.
- **Model-specific params.** Claude models take `thinking` / `output_config`
  effort settings that gpt-4o does not. Defaults are fine to start; do not port
  OpenAI-shaped assumptions blindly.
- `compare_explain` and `competitors` can stay on OpenAI or move at the same
  time; at $0.08/month it is tidiness, not economics.

## How to verify the claims here

- OpenAI errors: `mcp__claude_ai_Vercel__get_runtime_errors`, project
  `prj_vEwnmFwacDFUk31DlDe43uB9AWky`, `since: 7d`.
- Token/cost profile: `ai_usage` table, grouped by `feature, model`.
- Anthropic limits: any `POST /v1/messages` with the account key, read the
  `anthropic-ratelimit-*` response headers.
- Prompt size: Anthropic `POST /v1/messages/count_tokens` with `system` set,
  minus an 8-token baseline.
