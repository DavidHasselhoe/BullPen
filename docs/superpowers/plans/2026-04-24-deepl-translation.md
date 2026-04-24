# DeepL Server-Side Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Translate the company profile `description` field server-side using DeepL before returning to the client, with Supabase caching so each translation is only paid for once; also inject the user's language into the AI chat system prompt so GPT-4o responds natively, and delete two dead API routes.

**Architecture:** A `lib/i18n/deepl.ts` client wraps the DeepL REST API. A `lib/i18n/translate.ts` utility handles Supabase cache lookup → DeepL call → cache write, with newline-safe segmentation. The company-profile API route calls `translateText()` after fetching from TwelveData and before returning JSON. The client passes `?lang=` as a query param using the existing i18next language value.

**Tech Stack:** DeepL REST API v2, Supabase (service role client), Node.js `crypto` (built-in SHA-256), react-i18next (`useTranslation`), TanStack Query, Next.js App Router API routes.

> **Note:** This project has no test framework — verification is done by running `npm run dev` and observing behavior in the browser. Each task includes a manual verification step.

---

## File Map

| File | Action |
|---|---|
| `supabase/migrations/044_translation_cache.sql` | Create |
| `lib/i18n/deepl.ts` | Create |
| `lib/i18n/translate.ts` | Create |
| `app/api/stock/[ticker]/company-profile/route.ts` | Modify |
| `components/stock/CompanyProfileCard.tsx` | Modify |
| `app/api/ai/chat/route.ts` | Modify |
| `lib/ai/agent.ts` | Modify |
| `components/ai/BullpenChat.tsx` | Modify |
| `.env.local` | Modify (add `DEEPL_API_KEY`) |
| `app/api/discover/companies-to-watch/route.ts` | Delete |
| `app/api/discover/fundamental-changes/route.ts` | Delete |
| `hooks/use-discover.ts` | Modify (remove dead hooks + types) |
| `components/navigation/Navigation.tsx` | Modify (remove dead prefetch calls) |

---

## Task 1: Add `DEEPL_API_KEY` to environment

**Files:**
- Modify: `.env.local`

- [ ] **Step 1: Add the env var**

Open `.env.local` and add after the existing keys:

```
DEEPL_API_KEY=your_deepl_api_key_here
```

Get a free API key from https://www.deepl.com/pro#developer (free tier = 500k chars/month). Free tier keys end with `:fx`.

- [ ] **Step 2: Commit**

```bash
git add .env.local
git commit -m "chore: add DEEPL_API_KEY env var"
```

> Note: `.env.local` is in `.gitignore` — this commit will only stage if git is tracking it. If not tracked, skip the commit and continue.

---

## Task 2: Create Supabase migration for `translation_cache`

**Files:**
- Create: `supabase/migrations/044_translation_cache.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/044_translation_cache.sql
create table if not exists translation_cache (
  id uuid primary key default gen_random_uuid(),
  text_hash text not null,
  target_lang text not null,
  translated_text text not null,
  created_at timestamptz not null default now(),
  constraint translation_cache_hash_lang_unique unique (text_hash, target_lang)
);

-- Service role only — no public access
alter table translation_cache enable row level security;
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Use the Supabase MCP tool `apply_migration` with the SQL above, or run it directly in the Supabase dashboard SQL editor.

- [ ] **Step 3: Verify the table exists**

Run this in the Supabase SQL editor:
```sql
select column_name, data_type from information_schema.columns
where table_name = 'translation_cache'
order by ordinal_position;
```

Expected output: columns `id`, `text_hash`, `target_lang`, `translated_text`, `created_at`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/044_translation_cache.sql
git commit -m "feat: add translation_cache migration"
```

---

## Task 3: Create DeepL API client

**Files:**
- Create: `lib/i18n/deepl.ts`

The DeepL free tier uses `https://api-free.deepl.com` (key ends with `:fx`). Paid uses `https://api.deepl.com`. This client auto-detects which endpoint to use.

- [ ] **Step 1: Create the file**

```typescript
// lib/i18n/deepl.ts
export class DeepLError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'DeepLError';
  }
}

const DEEPL_LANG_MAP: Record<string, string> = {
  en: 'EN',
  es: 'ES',
  fr: 'FR',
  de: 'DE',
  ja: 'JA',
  zh: 'ZH',
};

export async function deeplTranslate(
  texts: string[],
  targetLang: string,
): Promise<string[]> {
  const apiKey = process.env.DEEPL_API_KEY;
  if (!apiKey) throw new DeepLError('DEEPL_API_KEY is not set', 500);

  const deeplLang = DEEPL_LANG_MAP[targetLang.toLowerCase()];
  if (!deeplLang) throw new DeepLError(`Unsupported language: ${targetLang}`, 400);

  // Free tier keys end with :fx and use a different subdomain
  const baseUrl = apiKey.endsWith(':fx')
    ? 'https://api-free.deepl.com'
    : 'https://api.deepl.com';

  const body = new URLSearchParams();
  body.append('target_lang', deeplLang);
  for (const t of texts) body.append('text', t);

  const res = await fetch(`${baseUrl}/v2/translate`, {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new DeepLError(`DeepL API error: ${res.status} ${res.statusText}`, res.status);
  }

  const data = (await res.json()) as { translations: Array<{ text: string }> };
  return data.translations.map((t) => t.text);
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/i18n/deepl.ts
git commit -m "feat: add DeepL API client"
```

---

## Task 4: Create translation utility with Supabase caching

**Files:**
- Create: `lib/i18n/translate.ts`

- [ ] **Step 1: Create the file**

```typescript
// lib/i18n/translate.ts
import { createHash } from 'crypto';
import { createServerClient } from '@/lib/supabase/server';
import { deeplTranslate, DeepLError } from './deepl';

const SUPPORTED_LANGS = new Set(['es', 'fr', 'de', 'ja', 'zh']);

function hashText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function segmentByNewlines(text: string): { textParts: string[]; delims: string[] } {
  // Split preserving the newline tokens: ['para1', '\n\n', 'para2', '\n', 'para3']
  const parts = text.split(/(\n+)/);
  const textParts = parts.filter((_, i) => i % 2 === 0).filter(Boolean);
  const delims = parts.filter((_, i) => i % 2 === 1);
  return { textParts, delims };
}

function rejoinSegments(translated: string[], delims: string[]): string {
  return translated.reduce((acc, t, i) => acc + t + (delims[i] ?? ''), '');
}

export async function translateText(text: string, targetLang: string): Promise<string> {
  const lang = targetLang.toLowerCase();

  // English is the source language — return unchanged
  if (!text || !SUPPORTED_LANGS.has(lang)) return text;

  const hash = hashText(text);
  const supabase = createServerClient();

  // Cache lookup
  try {
    const { data } = await supabase
      .from('translation_cache')
      .select('translated_text')
      .eq('text_hash', hash)
      .eq('target_lang', lang)
      .maybeSingle();

    if (data?.translated_text) return data.translated_text;
  } catch (err) {
    console.error('[translate] Cache lookup failed:', err);
    return text;
  }

  // Cache miss — translate via DeepL
  try {
    const { textParts, delims } = segmentByNewlines(text);
    const translated = await deeplTranslate(textParts, lang);
    const result = rejoinSegments(translated, delims);

    // Fire-and-forget cache write — don't block the response on a write error
    supabase
      .from('translation_cache')
      .insert({ text_hash: hash, target_lang: lang, translated_text: result })
      .then(({ error }) => {
        if (error && error.code !== '23505') {
          // 23505 = unique violation (race condition, safe to ignore)
          console.error('[translate] Cache write failed:', error.message);
        }
      });

    return result;
  } catch (err) {
    // Degrade gracefully — return English on any DeepL failure
    if (err instanceof DeepLError) {
      console.error(`[translate] DeepL error ${err.statusCode}:`, err.message);
    } else {
      console.error('[translate] Unexpected error:', err);
    }
    return text;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/i18n/translate.ts
git commit -m "feat: add translation utility with Supabase caching"
```

---

## Task 5: Integrate translation into the company-profile API route

**Files:**
- Modify: `app/api/stock/[ticker]/company-profile/route.ts`

The current route (line 9–61) fetches from TwelveData and returns JSON. We need to:
1. Read `?lang=` from the request URL
2. Translate `profile.description` before returning

- [ ] **Step 1: Update the route**

Replace the entire file content with:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getCompanyProfile, getKeyExecutives, TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { getCached, setCached } from '@/lib/cache/market-data-cache';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { translateText } from '@/lib/i18n/translate';

export const dynamic = 'force-dynamic';
const PROFILE_TTL_SECONDS = 7 * 24 * 60 * 60;

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await params;
  const sym = ticker.toUpperCase();
  const lang = (request.nextUrl.searchParams.get('lang') ?? 'en').toLowerCase();
  const cacheKey = `profile:${sym}`;

  try {
    const cached = await getCached<{
      profile: Awaited<ReturnType<typeof getCompanyProfile>>;
      executives: Awaited<ReturnType<typeof getKeyExecutives>>;
    }>(cacheKey);

    if (cached) {
      const profile = { ...cached.profile };
      if (profile.description) {
        profile.description = await translateText(profile.description, lang);
      }
      return addSecurityHeaders(
        NextResponse.json(
          { success: true, symbol: sym, profile, executives: cached.executives },
          { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600' } },
        ),
      );
    }

    const [profile, executives] = await Promise.all([
      getCompanyProfile(sym),
      getKeyExecutives(sym).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (/plan|enterprise|higher tier|not available|access/i.test(msg)) return [];
        return [];
      }),
    ]);

    await setCached(cacheKey, sym, 'company_profile', { profile, executives }, PROFILE_TTL_SECONDS);

    const translatedProfile = { ...profile };
    if (translatedProfile.description) {
      translatedProfile.description = await translateText(translatedProfile.description, lang);
    }

    return addSecurityHeaders(
      NextResponse.json(
        { success: true, symbol: sym, profile: translatedProfile, executives },
        { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600' } },
      ),
    );
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 }),
      );
    }
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: msg }, { status: 500 }),
    );
  }
}

export const GET = withRateLimit(handler, { windowMs: 60_000, maxRequests: 30 });
```

- [ ] **Step 2: Commit**

```bash
git add app/api/stock/[ticker]/company-profile/route.ts
git commit -m "feat: translate company profile description server-side"
```

---

## Task 6: Pass `?lang=` from `CompanyProfileCard`

**Files:**
- Modify: `components/stock/CompanyProfileCard.tsx`

The component currently fetches `/api/stock/${ticker}/company-profile` (line 64) with no lang param. We need to append `?lang=${i18n.language}`.

- [ ] **Step 1: Add `useTranslation` import**

At the top of the file, add the import after the existing imports:

```typescript
import { useTranslation } from 'react-i18next';
```

- [ ] **Step 2: Read the language inside the component**

Inside `CompanyProfileCard` (after `const { data, isLoading } = useQuery...`), add before the `useQuery` call:

```typescript
const { i18n } = useTranslation();
```

- [ ] **Step 3: Append `?lang=` to the fetch URL**

Change line 64 from:
```typescript
      const res = await fetch(`/api/stock/${ticker}/company-profile`);
```
to:
```typescript
      const res = await fetch(`/api/stock/${ticker}/company-profile?lang=${i18n.language}`);
```

- [ ] **Step 4: Update the `queryKey` to include language so cache is scoped per language**

Change line 62 from:
```typescript
    queryKey: ['company-profile', ticker],
```
to:
```typescript
    queryKey: ['company-profile', ticker, i18n.language],
```

- [ ] **Step 5: Commit**

```bash
git add components/stock/CompanyProfileCard.tsx
git commit -m "feat: pass lang param to company-profile endpoint"
```

---

## Task 7: Inject user language into AI chat system prompt

**Files:**
- Modify: `lib/ai/agent.ts`
- Modify: `app/api/ai/chat/route.ts`
- Modify: `components/ai/BullpenChat.tsx`

### 7a — Update `runAgent` signature

- [ ] **Step 1: Add `language` parameter to `runAgent`**

In `lib/ai/agent.ts`, update the function signature (line 20–24) and add the language prefix:

```typescript
export async function runAgent(
  messages: UIMessage[],
  context?: AIContext | null,
  experienceLevel?: 'beginner' | 'intermediate' | 'advanced' | null,
  language?: string | null,
) {
  const modelMessages = await convertToModelMessages(messages);

  const languagePrefix = language && language !== 'en'
    ? `[Language: You MUST respond entirely in ${language}. Do not switch to English under any circumstance.]\n\n`
    : '';

  const experiencePrefix = experienceLevel === 'beginner'
    ? `[User level: BEGINNER. Use plain everyday language. Avoid jargon — if you must use a financial term, define it immediately in parentheses. Short sentences. Explain like teaching a curious 16-year-old, not a Wall Street analyst.]\n\n`
    : experienceLevel === 'advanced'
    ? `[User level: ADVANCED. Use precise financial terminology freely. Skip basic definitions. Assume the user understands GAAP, DCF, multiple expansion, etc. Prioritise density and insight.]\n\n`
    : '';

  const contextLabel = context?.label ?? context?.tickers?.join(', ') ?? '';
  const contextPrefix = context?.tickers?.length
    ? `[Current page context: The user is viewing "${contextLabel}" (${context.tickers.join(', ')}). Unless the user specifies a different company, answer questions about ${context.tickers.join(' and ')} first.]\n\n`
    : '';

  const result = streamText({
    model: openai('gpt-4o'),
    system: languagePrefix + experiencePrefix + contextPrefix + SYSTEM_PROMPT,
    messages: modelMessages,
    tools: BULLPEN_TOOLS,
    maxSteps: 5,
    maxTokens: 2048,
    stopWhen: stepCountIs(5),
  });

  return result;
}
```

### 7b — Pass `language` through the chat route

- [ ] **Step 2: Update `app/api/ai/chat/route.ts`**

```typescript
import { NextRequest } from 'next/server';
import { runAgent } from '@/lib/ai/agent';
import { withRateLimit } from '@/lib/security/api-security';

async function handler(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const messages = body?.messages ?? [];
  const context = body?.context ?? null;
  const experienceLevel = (body?.experienceLevel as 'beginner' | 'intermediate' | 'advanced') ?? null;
  const language = (body?.language as string) ?? null;

  const result = await runAgent(messages, context, experienceLevel, language);
  return result.toUIMessageStreamResponse();
}

export const POST = withRateLimit(handler, { windowMs: 60 * 1000, maxRequests: 20 });
```

### 7c — Send language from `BullpenChat`

- [ ] **Step 3: Add `useTranslation` import to `BullpenChat.tsx`**

The file already imports from `react-i18next` via other components — check the top of the file. If `useTranslation` is not imported, add:

```typescript
import { useTranslation } from 'react-i18next';
```

- [ ] **Step 4: Read the language and add to transport body**

Inside the `BullpenChat` component function body, add:

```typescript
const { i18n } = useTranslation();
```

Then update the `DefaultChatTransport` body (around line 138–141) from:

```typescript
      body: {
        ...(aiContext ? { context: aiContext } : {}),
        ...(user?.experience_level ? { experienceLevel: user.experience_level } : {}),
      },
```

to:

```typescript
      body: {
        ...(aiContext ? { context: aiContext } : {}),
        ...(user?.experience_level ? { experienceLevel: user.experience_level } : {}),
        language: i18n.language,
      },
```

- [ ] **Step 5: Commit**

```bash
git add lib/ai/agent.ts app/api/ai/chat/route.ts components/ai/BullpenChat.tsx
git commit -m "feat: inject user language into AI chat system prompt"
```

---

## Task 8: Delete dead API routes and clean up references

**Files:**
- Delete: `app/api/discover/companies-to-watch/route.ts`
- Delete: `app/api/discover/fundamental-changes/route.ts`
- Modify: `hooks/use-discover.ts`
- Modify: `components/navigation/Navigation.tsx`

- [ ] **Step 1: Delete the two dead route files**

```bash
rm app/api/discover/companies-to-watch/route.ts
rm app/api/discover/fundamental-changes/route.ts
```

- [ ] **Step 2: Remove dead hooks and types from `hooks/use-discover.ts`**

Remove the following from `hooks/use-discover.ts`:
- The `FundamentalChange` interface (lines 7–16)
- The `CompanyToWatch` interface (lines 29–39)
- The `FundamentalChangesResponse` interface (lines 41–45)
- The `CompaniesToWatchResponse` interface (lines 53–57)
- The `useFundamentalChanges` function (lines 62–86)
- The `useCompaniesToWatch` function (lines 117–138)

The file should keep only `RecentFiling`, `RecentFilingsResponse`, and `useRecentFilings`. Final file:

```typescript
import { useQuery } from '@tanstack/react-query';
import { fetchWithTimeout } from '@/lib/utils';
import type { Company } from '@/lib/types/database';

const FETCH_TIMEOUT_MS = 10000;

export interface RecentFiling {
  filing: {
    id: string;
    filing_type: string;
    filing_date: string;
    period_end_date: string | null;
  };
  company: Company;
  insightsCount: number;
}

interface RecentFilingsResponse {
  success: boolean;
  filings?: RecentFiling[];
  error?: string;
}

export function useRecentFilings(limit: number = 10) {
  return useQuery({
    queryKey: ['discover', 'recent-filings', limit],
    queryFn: async (): Promise<RecentFiling[]> => {
      try {
        const response = await fetchWithTimeout(
          `/api/discover/recent-filings?limit=${limit}`,
          {},
          FETCH_TIMEOUT_MS
        );
        if (!response.ok) return [];
        const data: RecentFilingsResponse = await response.json();
        if (data.success && data.filings) return data.filings;
        return [];
      } catch {
        return [];
      }
    },
    staleTime: 60 * 1000,
    retry: false,
  });
}
```

- [ ] **Step 3: Remove dead prefetch calls from `components/navigation/Navigation.tsx`**

Find lines ~85–87:
```typescript
    queryClient.prefetchQuery({ queryKey: ['discover', 'fundamental-changes', 6] });
    // and/or
    queryClient.prefetchQuery({ queryKey: ['discover', 'companies-to-watch', 10] });
```

Delete those two lines. Do not remove any other prefetch calls.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove dead companies-to-watch and fundamental-changes routes and hooks"
```

---

## Task 9: Verify end-to-end

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify company profile translation**

1. Open http://localhost:3000
2. Go to Settings → change language to Spanish (es)
3. Navigate to any stock page (e.g. `/stock/AAPL`)
4. Scroll to the Company Profile card
5. The description should render in Spanish
6. Open browser DevTools → Network tab → find the `company-profile?lang=es` request — confirm `?lang=es` is present in the URL

- [ ] **Step 3: Verify AI chat language**

1. Open the AI chat (bottom-right button)
2. With language set to Spanish, type: "What is P/E ratio?"
3. The response should come back in Spanish

- [ ] **Step 4: Verify English is unchanged**

1. Switch language back to English in Settings
2. Navigate to the same stock page
3. Description should be in English (no translation call made)

- [ ] **Step 5: Verify Supabase cache**

In the Supabase SQL editor, run:
```sql
select target_lang, left(translated_text, 80) as preview, created_at
from translation_cache
order by created_at desc
limit 10;
```

Expected: rows with `target_lang = 'es'` and Spanish text in the preview.

- [ ] **Step 6: Run lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 7: Final commit if any lint fixes were needed**

```bash
git add -A
git commit -m "fix: lint cleanup after DeepL translation implementation"
```
