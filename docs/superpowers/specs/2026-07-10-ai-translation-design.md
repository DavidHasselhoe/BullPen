# AI-Based Translation + Language Completion — Design

## Purpose

BullPen has a working i18next-based language system (6 languages, no Norwegian) and a DeepL-backed live translation feature for company profile descriptions — but Norwegian isn't selectable anywhere, DeepL is the most expensive translation option available for a workload that doesn't need its speed advantage, and two of the app's three AI-generated-content features ("Why Today?", Daily Brief) don't respect the user's language setting at all. This is Sub-project A of a two-part effort: it establishes the translation mechanism and completes language support for existing AI-touching features. Sub-project B (extracting the app's remaining hardcoded English UI strings into the i18next locale system) is deferred to a separate spec — it depends on the mechanism decided here but is otherwise independent, larger, and more mechanical work.

## Current state (confirmed by investigation)

- **i18next is real and active**, not dead weight: `lib/i18n/config.ts` initializes it with `fallbackLng: 'en'` and browser-language detection; `lib/i18n/locales/{en,es,fr,de,ja,zh}.json` hold ~90 keys/language under `common.*`/`settings.*` namespaces; `components/i18n/LanguageProvider.tsx` syncs `user.settings.language` → `i18n.changeLanguage()`; `components/user/SettingsModal.tsx` (~line 611–636) has a working language `<Select>`. Coverage is partial — most product surfaces still render hardcoded English JSX even in files that import `useTranslation` (this gap is Sub-project B, not here).
- **`language` lives in `users.settings.language`** (JSONB, ad-hoc key, no dedicated column, no CHECK constraint) — values are the i18next codes (`'en'|'es'|'fr'|'de'|'ja'|'zh'|null`). No Norwegian value exists anywhere in the app today.
- **Separate DeepL subsystem**: `lib/i18n/translate.ts` + `lib/i18n/deepl.ts` translate one dynamic field (company profile descriptions) on demand, cached forever in Supabase `translation_cache` (migration `044_translation_cache.sql`, keyed by SHA-256 hash of source text + target language — each unique text+language pair is translated at most once, ever). `DEEPL_LANG_MAP` covers `es/fr/de/ja/zh` only. Called from `app/api/stock/[ticker]/company-profile/route.ts` via a `?lang=` query param, with call sites in `app/stock/[ticker]/page.tsx`, `app/etf/[ticker]/page.tsx`, and `components/stock/CompanyProfileCard.tsx` passing `lang=${i18n.language}`.
- **AI chat already has a working language mechanism.** `components/ai/BullpenChat.tsx` sends `language: i18n.language` in the chat request body → `app/api/ai/chat/route.ts` → `lib/ai/agent.ts`'s `runAgent()`, which prepends a `languagePrefix` string (`"[Language: You MUST respond entirely in ${language}...]"`) to the system prompt whenever `language !== 'en'` — the same pattern already used for `experiencePrefix`/`riskPrefix`/`horizonPrefix`/`stylePrefix`. **Known bug**: it interpolates the raw i18next code (e.g. `"es"`) rather than a readable language name (`"Spanish"`) — works today because GPT-4o resolves common codes, but is worth fixing while this file is already being touched for Norwegian.
- **"Why Today?"** (`app/api/ai/why-today/route.ts` — CLAUDE.md's documented path is stale) calls Anthropic directly with a hardcoded English system prompt and reads no language parameter at all.
- **Daily Brief** (`app/api/cron/generate-daily-brief/route.ts`) generates once globally per calendar day, idempotency keyed only on `published_date`, no `user_id`, shared across all Pro users via the `daily_briefs` table. **Confirmed with user: out of scope this round** — stays English-only; a real per-language Daily Brief would need a schema change (`UNIQUE(published_date)` → `UNIQUE(published_date, language)`) and N× the daily Claude generation cost, deferred until there's real multi-language Pro demand to justify it.
- **Cost research** (see conversation): dedicated translation APIs run $10–25 per million characters (Azure cheapest, DeepL priciest but historically the European-language quality benchmark). GPT-4o-mini, already available via the existing `OPENAI_API_KEY`, costs roughly $0.20–0.25 per million characters translated (~100x cheaper) and — unlike dedicated NMT APIs — can be given financial-domain context in-prompt. Both of this app's actual translation workloads (batch UI strings, cache-forever company descriptions) are insensitive to DeepL's speed/latency advantage, since neither is live/real-time.

## Scope decisions (confirmed with user)

- **This round covers**: Norwegian added as a 7th supported language; DeepL replaced by GPT-4o-mini-based translation for company descriptions (same cache, different engine); the chat language-name bug fixed; "Why Today?" wired to respect the user's language.
- **Daily Brief stays English-only** this round — no schema change, no per-language generation.
- **Full app-wide UI string extraction (Sub-project B) is explicitly deferred** to a separate spec.
- **DeepL is fully removed**, not kept as a fallback — no reason to maintain two translation code paths once the new engine is live.

## Architecture

```
lib/i18n/language-names.ts  (new, shared)
        │
        ├──► lib/i18n/translate.ts (modified: DeepL → GPT-4o-mini)
        │        │
        │        ▼
        │    translation_cache (Supabase, UNCHANGED — hash(text+lang), cache forever)
        │        │
        │        ▲ read/write, same as today
        │    app/api/stock/[ticker]/company-profile/route.ts  (UNCHANGED call site)
        │
        ├──► lib/ai/agent.ts (modified: languagePrefix uses language name, not raw code)
        │
        └──► app/api/ai/why-today/route.ts (modified: new language-aware prefix, same pattern)
```

## Components

### `lib/i18n/language-names.ts` (new)

```ts
export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  ja: 'Japanese',
  zh: 'Chinese',
  no: 'Norwegian',
};

export function languageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code;
}
```

Single source of truth for code→name, imported by both the translation helper and the two AI-prompt call sites — avoids duplicating this mapping.

### `lib/i18n/translate.ts` (modified)

Keeps its existing exported function signature exactly as-is (callers — the company-profile route — are unaffected). Internally, the DeepL HTTP call is replaced with an OpenAI chat completion call (GPT-4o-mini) using a prompt built from `languageName()`: translate the given text into `<name>`, preserve a tone appropriate for a financial app, return only the translated text with no commentary or preamble. The existing cache-lookup-then-store flow around this call is untouched.

`lib/i18n/deepl.ts` and the `deepl-node` (or equivalent) dependency in `package.json` are deleted. `DEEPL_API_KEY` references are removed from `CLAUDE.md`/`ENV_SETUP.md`.

### Norwegian language addition

- `'no'` added to the supported-languages list in `lib/i18n/config.ts` / `components/i18n/LanguageProvider.tsx`.
- `lib/i18n/locales/no.json` — created by a one-time script that runs the *new* `translate.ts` helper over every value in `en.json` (reusing the just-built mechanism rather than hand-writing translations), then committed as a static file like the other 6 locale files.
- A Norwegian option added to the Settings language `<Select>` in `components/user/SettingsModal.tsx`, matching the existing pattern for the other 6 languages.

### `lib/ai/agent.ts` (modified)

`languagePrefix` changes from interpolating the raw code to `languageName(language)`, e.g. `"[Language: You MUST respond entirely in Norwegian...]"` instead of `"...in no..."`. No other change to the chat pipeline — this already fully supports Norwegian once it's a selectable value, no new plumbing needed.

### `app/api/ai/why-today/route.ts` (modified)

- Accepts a new optional `language` field in the request body (defaulting to `'en'`/absent → no prefix, preserving current behavior for any caller that doesn't send it).
- Prepends a language instruction to the existing hardcoded system prompt using `languageName()`, mirroring `agent.ts`'s `languagePrefix` pattern exactly (same wording style, same `!== 'en'` guard).
- The caller, `components/stock/WhyTodayPanel.tsx`, is updated to send `language: i18n.language` in its request body, matching how `BullpenChat.tsx` already does it for chat.

## Out of scope

- Daily Brief per-language generation (English-only this round; would need a `daily_briefs` schema change and real multi-language Pro demand to justify the added generation cost).
- Sub-project B: extracting the app's remaining hardcoded UI strings into the i18next locale system (separate spec).
- Any change to the `translation_cache` table schema or caching TTL/invalidation strategy — unchanged from today.
- Migrating or invalidating already-cached DeepL-era translations — they're left in place as still-valid cached results; only new cache misses use the new engine.
- Adding Norwegian to any language list beyond what's specified here (e.g. no Nynorsk variant — Bokmål (`'no'`) only, matching how the other 6 languages are single-variant).
