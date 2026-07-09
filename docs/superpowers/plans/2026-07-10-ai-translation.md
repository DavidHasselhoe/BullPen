# AI-Based Translation + Language Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace DeepL with GPT-4o-mini for dynamic content translation, add Norwegian as a 7th supported language, and make "Why Today?" respect the user's language setting (AI chat already does, minus a small bug this plan also fixes).

**Architecture:** A new `lib/i18n/ai-translate.ts` engine (using the Vercel AI SDK's `generateText` + `openai('gpt-4o-mini')`, already used elsewhere in this codebase) drops into `lib/i18n/translate.ts`'s existing cache-then-translate flow in place of the old DeepL HTTP client, with zero change to the `translation_cache` table or its callers. A shared `lib/i18n/language-names.ts` lookup feeds both this engine's prompts and a fix to the AI chat's existing language instruction, then the same pattern is applied to "Why Today?".

**Tech Stack:** Vercel AI SDK (`ai` + `@ai-sdk/openai`, both already dependencies), i18next/react-i18next (already wired up), Supabase (`translation_cache` table, unchanged).

## Global Constraints

- `lib/i18n/translate.ts`'s exported `translateText(text, targetLang)` signature and its callers (`app/api/stock/[ticker]/company-profile/route.ts` and its 3 upstream callers) do not change.
- The `translation_cache` table schema and caching behavior (hash of text + target lang, cached forever) do not change.
- DeepL is fully removed (`lib/i18n/deepl.ts` deleted), not kept as a fallback.
- Daily Brief stays English-only — no task in this plan touches `app/api/cron/generate-daily-brief/route.ts`.
- No task in this plan extracts hardcoded UI strings beyond the one new `languages.no` key needed for the language picker itself — full UI string extraction is a separate, deferred effort.

---

### Task 1: GPT-4o-mini translation engine (replaces DeepL)

**Files:**
- Create: `lib/i18n/language-names.ts`
- Create: `lib/i18n/ai-translate.ts`
- Modify: `lib/i18n/translate.ts`
- Delete: `lib/i18n/deepl.ts`
- Create: `scripts/test-ai-translate.ts`
- Modify: `package.json` (add one script entry)

**Interfaces:**
- Produces: `languageName(code: string): string` and `LANGUAGE_NAMES: Record<string, string>` from `lib/i18n/language-names.ts` — used by Task 2 (locale generation), Task 3 (chat fix), and Task 4 (Why Today?).
- Produces: `aiTranslate(texts: string[], targetLang: string): Promise<string[]>` and `TranslationError` from `lib/i18n/ai-translate.ts` — used only by `lib/i18n/translate.ts` in this task.
- Consumes/preserves: `translateText(text: string, targetLang: string): Promise<string>` from `lib/i18n/translate.ts` — signature unchanged, used by Task 2's locale-generation script.

- [ ] **Step 1: Write the language-names helper**

```ts
// lib/i18n/language-names.ts
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

- [ ] **Step 2: Write the translation engine**

```ts
// lib/i18n/ai-translate.ts
/**
 * GPT-4o-mini-based translation engine — replaces the old DeepL HTTP client.
 * Same texts[]/targetLang contract as the old deeplTranslate(), so
 * lib/i18n/translate.ts's caching/segmentation logic is unaffected.
 */

import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { languageName } from './language-names';

export class TranslationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'TranslationError';
  }
}

export async function aiTranslate(texts: string[], targetLang: string): Promise<string[]> {
  const name = languageName(targetLang);

  try {
    return await Promise.all(
      texts.map(async (text) => {
        const result = await generateText({
          model: openai('gpt-4o-mini'),
          system:
            `Translate the given text into ${name}. This is content for a financial investing app — ` +
            `preserve financial terminology accurately and keep a professional, approachable tone. ` +
            `Return ONLY the translated text, with no commentary, quotes, or preamble.`,
          prompt: text,
          maxOutputTokens: 2000,
        });
        const translated = result.text.trim();
        if (!translated) throw new TranslationError('Empty translation response', 502);
        return translated;
      })
    );
  } catch (err) {
    if (err instanceof TranslationError) throw err;
    throw new TranslationError(
      err instanceof Error ? err.message : 'Unknown translation error',
      500
    );
  }
}
```

- [ ] **Step 3: Swap the engine inside translate.ts**

In `lib/i18n/translate.ts`, change this line:

```ts
import { deeplTranslate, DeepLError } from './deepl';

const SUPPORTED_LANGS = new Set(['es', 'fr', 'de', 'ja', 'zh']);
```

to:

```ts
import { aiTranslate, TranslationError } from './ai-translate';

const SUPPORTED_LANGS = new Set(['es', 'fr', 'de', 'ja', 'zh', 'no']);
```

Then change this line inside the second `try` block:

```ts
    const translated = await deeplTranslate(textParts, lang);
```

to:

```ts
    const translated = await aiTranslate(textParts, lang);
```

Then change the corresponding `catch` block:

```ts
  } catch (err) {
    if (err instanceof DeepLError) {
      console.error(`[translate] DeepL error ${err.statusCode}:`, err.message);
    } else {
      console.error('[translate] Unexpected error:', err);
    }
    return text;
  }
```

to:

```ts
  } catch (err) {
    if (err instanceof TranslationError) {
      console.error(`[translate] Translation error ${err.statusCode}:`, err.message);
    } else {
      console.error('[translate] Unexpected error:', err);
    }
    return text;
  }
```

- [ ] **Step 4: Delete the DeepL client**

```bash
rm lib/i18n/deepl.ts
```

- [ ] **Step 5: Write the verification script**

```ts
// scripts/test-ai-translate.ts
/**
 * Verifies the AI translation engine end-to-end:
 *  1. Translates a sample string into all 6 non-English supported languages
 *     and prints the results for manual quality review.
 *  2. Confirms a repeated call for the same text+language hits the cache
 *     (fast) instead of calling the model again (slow).
 *
 * Usage: npm run test-ai-translate
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { translateText } from '../lib/i18n/translate';

const SAMPLE = 'Stocks will display in their exchange currency (e.g., NOK for Norway, USD for US)';
const LANGUAGES = ['es', 'fr', 'de', 'ja', 'zh', 'no'];

async function main() {
  let failed = false;

  for (const lang of LANGUAGES) {
    const start = Date.now();
    const translated = await translateText(SAMPLE, lang);
    const ms = Date.now() - start;
    console.log(`\n[${lang}] (${ms}ms):\n  ${translated}`);
    if (translated === SAMPLE) {
      console.error(`  ❌ FAIL — translation returned the original English text unchanged`);
      failed = true;
    }
  }

  console.log('\n--- Cache round-trip check ---');
  const cachedStart = Date.now();
  const cached = await translateText(SAMPLE, 'es');
  const cachedMs = Date.now() - cachedStart;
  console.log(`[es] second lookup took ${cachedMs}ms: ${cached}`);
  if (cachedMs > 800) {
    console.warn('  ⚠️  Took over 800ms — expected a fast cache hit, not a fresh model call. Check the cache write in translate.ts.');
  } else {
    console.log('  ✅ Fast — looks like a cache hit.');
  }

  if (failed) process.exit(1);
  console.log('\n✅ All languages produced translated (non-identical) output. Review the printed translations above for quality.');
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
```

- [ ] **Step 6: Add the package.json script**

```json
"test-ai-translate": "tsx scripts/test-ai-translate.ts",
```

- [ ] **Step 7: Run the verification script**

Run: `npm run test-ai-translate`

Expected: 6 translated strings print (Spanish, French, German, Japanese, Chinese, Norwegian), none identical to the English source, followed by:
```
[es] second lookup took <fast>ms: <same Spanish translation>
  ✅ Fast — looks like a cache hit.

✅ All languages produced translated (non-identical) output. Review the printed translations above for quality.
```

Read the 6 printed translations and confirm by eye that they're coherent, correctly-translated sentences (not garbled, not English, not an error message) before proceeding.

- [ ] **Step 8: Lint**

Run: `npx eslint lib/i18n/language-names.ts lib/i18n/ai-translate.ts lib/i18n/translate.ts scripts/test-ai-translate.ts`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add lib/i18n/language-names.ts lib/i18n/ai-translate.ts lib/i18n/translate.ts scripts/test-ai-translate.ts package.json
git rm lib/i18n/deepl.ts
git commit -m "feat(i18n): replace DeepL with GPT-4o-mini translation engine"
git push origin preview
```

---

### Task 2: Add Norwegian as a supported language

**Files:**
- Modify: `lib/i18n/locales/en.json`
- Create: `scripts/add-norwegian-locale.ts`
- Modify: `package.json` (add one script entry)
- Create: `lib/i18n/locales/no.json` (generated by the script in Step 3)
- Modify: `lib/i18n/locales/es.json`, `lib/i18n/locales/fr.json`, `lib/i18n/locales/de.json`, `lib/i18n/locales/ja.json`, `lib/i18n/locales/zh.json` (each gets one new key, patched by the script in Step 3)
- Modify: `lib/i18n/config.ts`
- Modify: `components/i18n/LanguageProvider.tsx`
- Modify: `components/user/SettingsModal.tsx`

**Interfaces:**
- Consumes: `translateText` from `lib/i18n/translate.ts` (Task 1) — must be complete first, since this task translates into `'no'`, which Task 1 adds to `SUPPORTED_LANGS`.

- [ ] **Step 1: Add the Norwegian label to en.json**

In `lib/i18n/locales/en.json`, find:

```json
  "languages": {
    "en": "English",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "ja": "Japanese",
    "zh": "Chinese"
  }
```

Replace with:

```json
  "languages": {
    "en": "English",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "ja": "Japanese",
    "zh": "Chinese",
    "no": "Norwegian"
  }
```

- [ ] **Step 2: Write the locale-generation script**

```ts
// scripts/add-norwegian-locale.ts
/**
 * One-off script: adds Norwegian as a supported language.
 *  1. Translates "Norwegian" into the 5 existing non-English locales and
 *     patches languages.no into each of their JSON files.
 *  2. Translates the entire en.json object into Norwegian and writes
 *     lib/i18n/locales/no.json.
 *
 * Usage: npm run add-norwegian-locale
 * Run once, after adding "no": "Norwegian" to en.json's languages block.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { translateText } from '../lib/i18n/translate';

const LOCALES_DIR = join(process.cwd(), 'lib', 'i18n', 'locales');
const EXISTING_LANGS = ['es', 'fr', 'de', 'ja', 'zh'];

type LocaleTree = { [key: string]: string | LocaleTree };

async function translateTree(tree: LocaleTree, targetLang: string): Promise<LocaleTree> {
  const out: LocaleTree = {};
  for (const [key, value] of Object.entries(tree)) {
    if (typeof value === 'string') {
      out[key] = await translateText(value, targetLang);
    } else {
      out[key] = await translateTree(value as LocaleTree, targetLang);
    }
  }
  return out;
}

async function main() {
  const enPath = join(LOCALES_DIR, 'en.json');
  const en = JSON.parse(readFileSync(enPath, 'utf-8')) as LocaleTree;
  const enLanguages = en.languages as LocaleTree;

  if (enLanguages?.no !== 'Norwegian') {
    console.error('Add "no": "Norwegian" to en.json\'s languages block before running this script.');
    process.exit(1);
  }

  console.log('1) Patching languages.no into the 5 existing locale files...');
  for (const lang of EXISTING_LANGS) {
    const filePath = join(LOCALES_DIR, `${lang}.json`);
    const locale = JSON.parse(readFileSync(filePath, 'utf-8')) as LocaleTree;
    const translatedLabel = await translateText('Norwegian', lang);
    (locale.languages as LocaleTree).no = translatedLabel;
    writeFileSync(filePath, JSON.stringify(locale, null, 2) + '\n', 'utf-8');
    console.log(`  [${lang}] languages.no = "${translatedLabel}"`);
  }

  console.log('\n2) Generating lib/i18n/locales/no.json from en.json...');
  const no = await translateTree(en, 'no');
  writeFileSync(join(LOCALES_DIR, 'no.json'), JSON.stringify(no, null, 2) + '\n', 'utf-8');
  console.log('  Wrote lib/i18n/locales/no.json');

  console.log('\n✅ Done. Review the diffs, then wire no.json into lib/i18n/config.ts and the Settings language selector.');
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
```

- [ ] **Step 3: Add the package.json script and run it**

Add to `package.json`'s `"scripts"`:

```json
"add-norwegian-locale": "tsx scripts/add-norwegian-locale.ts",
```

Run: `npm run add-norwegian-locale`

Expected output ends with:
```
  Wrote lib/i18n/locales/no.json

✅ Done. Review the diffs, then wire no.json into lib/i18n/config.ts and the Settings language selector.
```

- [ ] **Step 4: Review the generated files**

Run: `git diff lib/i18n/locales/es.json lib/i18n/locales/fr.json lib/i18n/locales/de.json lib/i18n/locales/ja.json lib/i18n/locales/zh.json`

Expected: each diff adds exactly one line, `"no": "<translated word for Norwegian>"`, inside the `languages` object — no other changes.

Run: `cat lib/i18n/locales/no.json` (or open it) and confirm it has the same top-level structure as `en.json` (`common`, `settings`, `languages` keys) with Norwegian text throughout, and that `languages.no` itself reads something like `"Norsk"`.

- [ ] **Step 5: Wire the new locale into i18next config**

In `lib/i18n/config.ts`, find:

```ts
// Import translation files
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import ja from './locales/ja.json';
import zh from './locales/zh.json';

const resources = {
  en: { translation: en },
  es: { translation: es },
  fr: { translation: fr },
  de: { translation: de },
  ja: { translation: ja },
  zh: { translation: zh },
};
```

Replace with:

```ts
// Import translation files
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import ja from './locales/ja.json';
import zh from './locales/zh.json';
import no from './locales/no.json';

const resources = {
  en: { translation: en },
  es: { translation: es },
  fr: { translation: fr },
  de: { translation: de },
  ja: { translation: ja },
  zh: { translation: zh },
  no: { translation: no },
};
```

- [ ] **Step 6: Add Norwegian to the supported-languages list**

In `components/i18n/LanguageProvider.tsx`, change:

```ts
const SUPPORTED_LANGUAGES = ['en', 'es', 'fr', 'de', 'ja', 'zh'];
```

to:

```ts
const SUPPORTED_LANGUAGES = ['en', 'es', 'fr', 'de', 'ja', 'zh', 'no'];
```

- [ ] **Step 7: Add Norwegian to the Settings language selector**

In `components/user/SettingsModal.tsx`, find:

```tsx
                      <SelectContent>
                        <SelectItem value="system">{t('settings.languageSystem')}</SelectItem>
                        <SelectItem value="en">{t('languages.en')}</SelectItem>
                        <SelectItem value="es">{t('languages.es')}</SelectItem>
                        <SelectItem value="fr">{t('languages.fr')}</SelectItem>
                        <SelectItem value="de">{t('languages.de')}</SelectItem>
                        <SelectItem value="ja">{t('languages.ja')}</SelectItem>
                        <SelectItem value="zh">{t('languages.zh')}</SelectItem>
                      </SelectContent>
```

Replace with:

```tsx
                      <SelectContent>
                        <SelectItem value="system">{t('settings.languageSystem')}</SelectItem>
                        <SelectItem value="en">{t('languages.en')}</SelectItem>
                        <SelectItem value="es">{t('languages.es')}</SelectItem>
                        <SelectItem value="fr">{t('languages.fr')}</SelectItem>
                        <SelectItem value="de">{t('languages.de')}</SelectItem>
                        <SelectItem value="ja">{t('languages.ja')}</SelectItem>
                        <SelectItem value="zh">{t('languages.zh')}</SelectItem>
                        <SelectItem value="no">{t('languages.no')}</SelectItem>
                      </SelectContent>
```

- [ ] **Step 8: Verify in the browser**

Run: `npm run dev` (if not already running)

Navigate to the app while logged in, open Settings → Preferences, open the Language dropdown. Confirm "Norwegian" (or "Norsk", depending on the current UI language) appears as the last option. Select it, save, and confirm the Settings modal's own UI chrome (button labels, section titles) switches to Norwegian text — this exercises the full `no.json` file, not just the dropdown label.

- [ ] **Step 9: Lint**

Run: `npx eslint lib/i18n/config.ts components/i18n/LanguageProvider.tsx components/user/SettingsModal.tsx scripts/add-norwegian-locale.ts`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add lib/i18n/locales/en.json lib/i18n/locales/es.json lib/i18n/locales/fr.json lib/i18n/locales/de.json lib/i18n/locales/ja.json lib/i18n/locales/zh.json lib/i18n/locales/no.json lib/i18n/config.ts components/i18n/LanguageProvider.tsx components/user/SettingsModal.tsx scripts/add-norwegian-locale.ts package.json
git commit -m "feat(i18n): add Norwegian as a supported language"
git push origin preview
```

---

### Task 3: Fix AI chat's language-name bug

**Files:**
- Modify: `lib/ai/agent.ts:1-33`

**Interfaces:**
- Consumes: `languageName` from `lib/i18n/language-names.ts` (Task 1).

- [ ] **Step 1: Import languageName and use it in the prefix**

In `lib/ai/agent.ts`, find:

```ts
import { streamText, convertToModelMessages, stepCountIs } from 'ai';
import { openai } from '@ai-sdk/openai';
import type { UIMessage } from 'ai';
import { SYSTEM_PROMPT } from './systemPrompt';
import { BULLPEN_TOOLS } from './tools';
```

Replace with:

```ts
import { streamText, convertToModelMessages, stepCountIs } from 'ai';
import { openai } from '@ai-sdk/openai';
import type { UIMessage } from 'ai';
import { SYSTEM_PROMPT } from './systemPrompt';
import { BULLPEN_TOOLS } from './tools';
import { languageName } from '@/lib/i18n/language-names';
```

Then find:

```ts
  const languagePrefix = language && language !== 'en'
    ? `[Language: You MUST respond entirely in ${language}. Do not switch to English under any circumstance.]\n\n`
    : '';
```

Replace with:

```ts
  const languagePrefix = language && language !== 'en'
    ? `[Language: You MUST respond entirely in ${languageName(language)}. Do not switch to English under any circumstance.]\n\n`
    : '';
```

- [ ] **Step 2: Verify in the browser**

Run: `npm run dev` (if not already running)

In Settings, set language to Norwegian (added in Task 2), then open the AI chat panel and ask a question (e.g. "What is a P/E ratio?"). Confirm the response comes back in Norwegian. Switch language back to English and confirm chat responds in English again.

- [ ] **Step 3: Lint**

Run: `npx eslint lib/ai/agent.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/ai/agent.ts
git commit -m "fix(ai): use full language name in chat's language instruction"
git push origin preview
```

---

### Task 4: Wire "Why Today?" to respect language

**Files:**
- Modify: `app/api/ai/why-today/route.ts`
- Modify: `components/stock/WhyTodayPanel.tsx`

**Interfaces:**
- Consumes: `languageName` from `lib/i18n/language-names.ts` (Task 1).

- [ ] **Step 1: Parse language from the request body and build the prefix**

In `app/api/ai/why-today/route.ts`, find:

```ts
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { checkQuota } from '@/lib/billing/quotas';
import { logAiCall } from '@/lib/billing/log-ai-call';
```

Replace with:

```ts
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { checkQuota } from '@/lib/billing/quotas';
import { logAiCall } from '@/lib/billing/log-ai-call';
import { languageName } from '@/lib/i18n/language-names';
```

Then find:

```ts
  // ── Parse body ────────────────────────────────────────────────────────────
  let ticker: string, price: number, change: number, changePct: number;
  try {
    const body = await request.json();
    ticker   = String(body.ticker ?? '').toUpperCase().slice(0, 10);
    price    = Number(body.price)    || 0;
    change   = Number(body.change)   || 0;
    changePct = Number(body.changePct) || 0;
    if (!ticker) throw new Error('missing ticker');
  } catch {
    return addSecurityHeaders(
      NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    );
  }
```

Replace with:

```ts
  // ── Parse body ────────────────────────────────────────────────────────────
  let ticker: string, price: number, change: number, changePct: number, language: string;
  try {
    const body = await request.json();
    ticker   = String(body.ticker ?? '').toUpperCase().slice(0, 10);
    price    = Number(body.price)    || 0;
    change   = Number(body.change)   || 0;
    changePct = Number(body.changePct) || 0;
    language = String(body.language ?? 'en');
    if (!ticker) throw new Error('missing ticker');
  } catch {
    return addSecurityHeaders(
      NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    );
  }
```

- [ ] **Step 2: Prepend the language instruction to the system prompt**

Find:

```ts
        const stream = anthropic.beta.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 600,
          betas: ['web-search-2025-03-05'],
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          system:
            'You are a concise financial analyst. Explain why a stock moved today using only what you find in current news. ' +
            'Respond with exactly 2–3 bullet points (each starting with "• "). ' +
            'Name the specific catalyst, event, or news item. Keep each bullet under 25 words. ' +
            'Do not use headers, bold text, or generic market commentary.',
```

Replace with:

```ts
        const languagePrefix = language && language !== 'en'
          ? `[Language: You MUST respond entirely in ${languageName(language)}. Do not switch to English under any circumstance.]\n\n`
          : '';

        const stream = anthropic.beta.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 600,
          betas: ['web-search-2025-03-05'],
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          system:
            languagePrefix +
            'You are a concise financial analyst. Explain why a stock moved today using only what you find in current news. ' +
            'Respond with exactly 2–3 bullet points (each starting with "• "). ' +
            'Name the specific catalyst, event, or news item. Keep each bullet under 25 words. ' +
            'Do not use headers, bold text, or generic market commentary.',
```

- [ ] **Step 3: Send the language from the client**

In `components/stock/WhyTodayPanel.tsx`, find:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
```

Replace with:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import Link from 'next/link';
```

Then find:

```tsx
export function WhyTodayPanel({ ticker, price, change, changePct, open, onClose }: Props) {
  const [status, setStatus] = useState<Status>('idle');
```

Replace with:

```tsx
export function WhyTodayPanel({ ticker, price, change, changePct, open, onClose }: Props) {
  const { i18n } = useTranslation();
  const [status, setStatus] = useState<Status>('idle');
```

Then find:

```tsx
        const res = await fetch('/api/ai/why-today', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker, price, change, changePct }),
          signal: ctrl.signal,
        });
```

Replace with:

```tsx
        const res = await fetch('/api/ai/why-today', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker, price, change, changePct, language: i18n.language }),
          signal: ctrl.signal,
        });
```

- [ ] **Step 4: Verify in the browser**

Run: `npm run dev` (if not already running)

With Settings language set to Norwegian (from Task 2), open a stock page and trigger "Why Today?" for a ticker that moved today. Confirm the streamed bullet points come back in Norwegian. This makes one real Anthropic API call with web search — run it once, not repeatedly, since it's a paid call.

Then switch language back to English and confirm English bullets return as before (regression check — this route worked before this task and must still work for English/no-language-param callers).

- [ ] **Step 5: Lint**

Run: `npx eslint "app/api/ai/why-today/route.ts" components/stock/WhyTodayPanel.tsx`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "app/api/ai/why-today/route.ts" components/stock/WhyTodayPanel.tsx
git commit -m "feat(ai): make Why Today? respect the user's language setting"
git push origin preview
```

---

## Self-Review Notes

**Spec coverage:** DeepL replaced with GPT-4o-mini, same cache/callers unchanged (Task 1) ✓. Norwegian added everywhere — locale file, config, Settings dropdown, and the `languages.no` label patched into every other locale (Task 2) ✓. Chat's language-name bug fixed (Task 3) ✓. Why Today? wired to respect language (Task 4) ✓. Daily Brief and full UI-string extraction untouched, as specified ✓. DeepL fully removed, not kept as fallback (Task 1, Step 4) ✓.

**Type consistency:** `languageName`/`LANGUAGE_NAMES` (Task 1) imported identically in Task 3 (`import { languageName } from '@/lib/i18n/language-names'`) and Task 4 (same import) — both routes/files are inside the `@/` alias root so this matches, unlike the scripts in Tasks 1–2 which correctly use relative imports (`'../lib/i18n/translate'`) matching this codebase's established scripts convention (confirmed against `scripts/test-resend.ts`, `scripts/test-discord-webhook.ts` from earlier work this session). `aiTranslate`/`TranslationError` (Task 1) are only consumed within `lib/i18n/translate.ts` in the same task — no cross-task type risk there. `translateText`'s signature is unchanged from its pre-existing form, so Task 2's script (written against the pre-existing signature) needed no adjustment.
