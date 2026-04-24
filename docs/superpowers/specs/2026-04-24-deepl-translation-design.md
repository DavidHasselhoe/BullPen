# DeepL Server-Side Translation — Design Spec

**Date:** 2026-04-24  
**Status:** Approved

## Overview

Add server-side dynamic content translation using the DeepL REST API. Translations occur in API routes before responses are returned, so the client always receives already-translated data — no UI flicker or client-side translation loading states.

Static UI strings continue to use the existing react-i18next / JSON locale file system. This spec covers dynamic content only.

## Scope

### In scope (v1)
- Company profile `description` field (`/api/stock/[ticker]/company-profile`)
- AI chat language: inject user language into system prompt so GPT-4o responds natively (no DeepL)
- Cleanup of two dead API routes and their associated components

### Out of scope (v1)
- News (no redistribution rights for Finnhub data at launch)
- Press releases (follow-on using same pattern)
- Any client-side translation

## Supported Languages

Matches the existing i18next locale set: `en`, `es`, `fr`, `de`, `ja`, `zh`. English is the identity case — no DeepL call is made.

---

## 1. Supabase Cache Table

New table: `translation_cache`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` default |
| `text_hash` | `text` | SHA-256 hex of source text |
| `target_lang` | `text` | e.g. `"es"`, `"fr"` |
| `translated_text` | `text` | DeepL output |
| `created_at` | `timestamptz` | `now()` default |

**Unique constraint:** `(text_hash, target_lang)` — translations are shared across all users of the same language. No user association.

Migration file: `supabase/migrations/YYYYMMDDHHMMSS_add_translation_cache.sql`

---

## 2. DeepL Client — `lib/i18n/deepl.ts`

Thin wrapper around the DeepL REST API (`POST /v2/translate`).

**Exports:**
```ts
deeplTranslate(texts: string[], targetLang: string): Promise<string[]>
```

- Uses `DEEPL_API_KEY` from env (free tier key uses `api-free.deepl.com`, paid uses `api.deepl.com` — the client detects via key suffix `:fx`)
- Sends up to 50 segments per request (DeepL batch limit)
- Throws a typed `DeepLError` on non-2xx responses

---

## 3. Translation Utility — `lib/i18n/translate.ts`

**Exports:**
```ts
translateText(text: string, targetLang: string): Promise<string>
```

**Flow:**
1. If `targetLang === 'en'` → return `text` unchanged
2. Hash source text with SHA-256 → query `translation_cache` for `(hash, targetLang)`
3. Cache hit → return `translated_text`
4. Cache miss:
   a. Segment text by newline boundaries, preserving delimiter tokens
   b. Call `deeplTranslate(segments, targetLang)`
   c. Rejoin segments with original delimiters
   d. Insert into `translation_cache`
   e. Return translated text

**Newline segmentation:**
```ts
const parts = text.split(/(\n+)/);          // alternates: [text, delim, text, delim, ...]
const textParts = parts.filter((_, i) => i % 2 === 0);
const delims    = parts.filter((_, i) => i % 2 === 1);
const translated = await deeplTranslate(textParts, targetLang);
return translated.reduce((acc, t, i) => acc + t + (delims[i] ?? ''), '');
```

This guarantees newline structure is preserved regardless of what DeepL does to whitespace inside segments.

---

## 4. Language Detection in API Routes

The client passes `?lang=<code>` as a query param on requests where translation is needed (e.g. `?lang=fr`). The client already knows its language from `i18n.language` (react-i18next).

- No extra Supabase lookup required in the API route
- Falls back to `'en'` if param is absent or unrecognised

---

## 5. Company Profile Route Integration

File: `app/api/stock/[ticker]/company-profile/route.ts`

After fetching the TwelveData profile and before `return NextResponse.json(...)`:

```ts
const lang = (searchParams.get('lang') ?? 'en').toLowerCase();
if (profile.description) {
  profile.description = await translateText(profile.description, lang);
}
```

The `useQuery` call in `components/stock/CompanyProfileCard.tsx` (line ~64) fetches this route. It will be updated to append `?lang=${i18n.language}` to the URL.

---

## 6. AI Chat Language Injection

File: `lib/ai/agent.ts`

The `runAgent()` function already receives `experienceLevel` from the client body. Add `language` to the same body shape and prepend to the system prompt:

```ts
const languageInstruction = language && language !== 'en'
  ? `You must respond in ${language}. `
  : '';
systemPrompt = languageInstruction + existingSystemPrompt;
```

Client sends `body.language = i18n.language` alongside `body.experienceLevel`.

---

## 7. Cleanup — Dead Routes and Components

Remove the following (they are not displayed in the app):

- `app/api/discover/companies-to-watch/route.ts`
- `app/api/discover/fundamental-changes/route.ts`
- Any components, hooks, or imports referencing these two endpoints

---

## Environment Variables

Add to `.env.local` and `.env.example`:

```
DEEPL_API_KEY=         # DeepL API key (free tier suffix :fx, paid has no suffix)
```

---

## Error Handling

- If DeepL returns an error, `translateText` logs the error and returns the original English text — the app degrades gracefully rather than blocking the page load.
- Rate limit (429) and quota exceeded (456) responses are caught and treated as cache misses with fallback to English.

---

## File Checklist

| File | Action |
|---|---|
| `supabase/migrations/*_add_translation_cache.sql` | Create |
| `lib/i18n/deepl.ts` | Create |
| `lib/i18n/translate.ts` | Create |
| `app/api/stock/[ticker]/company-profile/route.ts` | Modify |
| `lib/ai/agent.ts` | Modify |
| `components/ai/BullpenChat.tsx` | Modify (send `language`) |
| `app/api/discover/companies-to-watch/route.ts` | Delete |
| `app/api/discover/fundamental-changes/route.ts` | Delete |
| Any components referencing deleted routes | Delete/modify |
| `.env.example` | Modify |
