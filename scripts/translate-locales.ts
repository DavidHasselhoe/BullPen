/**
 * Translates lib/i18n/locales/en/<ns>.json into the app's other 6 locales
 * using Claude Haiku 4.5. Supersedes scripts/add-norwegian-locale.ts (see
 * that file's header for why) — two things that script couldn't do at scale:
 *
 *  1. Batches many keys per request instead of one string per API call. The
 *     old translateTree() awaited a call per string in a loop; at ~3,000
 *     keys x 6 languages that's ~18,000 sequential calls. This script sends
 *     ~40 keys per request as a single JSON object.
 *  2. Only re-translates keys whose English source actually changed, via a
 *     per-language _meta.json (sha256 of the source string per key) —
 *     unchanged keys cost nothing on a re-run.
 *
 * Not yet using the Anthropic Batch API (50% cheaper, ideal for this since
 * it's not latency-sensitive) — at current catalog size (Phase 1 in
 * progress) a synchronous run finishes in seconds. Worth revisiting once a
 * single run is translating hundreds of new keys at once.
 *
 * Usage:
 *   npm run i18n:translate                  all namespaces, all target languages
 *   npm run i18n:translate -- --ns=settings just one namespace
 *   npm run i18n:translate -- --lang=no     just one target language
 *   npm run i18n:translate -- --force       ignore _meta.json, retranslate everything
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { languageName } from '../lib/i18n/language-names';
import { DO_NOT_TRANSLATE } from '../lib/i18n/do-not-translate';

const LOCALES_DIR = join(process.cwd(), 'lib', 'i18n', 'locales');
const GLOSSARIES_DIR = join(process.cwd(), 'lib', 'i18n', 'glossaries');
const SOURCE_LANG = 'en';
const TARGET_LANGS = ['es', 'fr', 'de', 'ja', 'zh', 'no'] as const;
const CHUNK_SIZE = 40;
const MODEL = 'claude-haiku-4-5';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const nsFilter = args.find((a) => a.startsWith('--ns='))?.slice(5);
const langFilter = args.find((a) => a.startsWith('--lang='))?.slice(7) as
  | (typeof TARGET_LANGS)[number]
  | undefined;
const force = args.includes('--force');

// ── Flatten / unflatten (namespace files may nest one level for grouped keys) ─

type Tree = { [key: string]: string | Tree };
type Flat = Record<string, string>;

function flatten(tree: Tree, prefix = ''): Flat {
  const out: Flat = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out[path] = value;
    else Object.assign(out, flatten(value, path));
  }
  return out;
}

function unflatten(flat: Flat): Tree {
  const out: Tree = {};
  for (const [path, value] of Object.entries(flat)) {
    const parts = path.split('.');
    let node = out;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (typeof node[part] !== 'object') node[part] = {};
      node = node[part] as Tree;
    }
    node[parts[parts.length - 1]] = value;
  }
  return out;
}

// ── File I/O ─────────────────────────────────────────────────────────────────

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function writeJson(path: string, data: unknown): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function listNamespaces(): string[] {
  const dir = join(LOCALES_DIR, SOURCE_LANG);
  const all = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''));
  return nsFilter ? all.filter((ns) => ns === nsFilter) : all;
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

// ── Translation ──────────────────────────────────────────────────────────────

interface Glossary {
  [englishTerm: string]: string;
}

function loadGlossary(lang: string): Glossary {
  return readJson(join(GLOSSARIES_DIR, `${lang}.json`), {});
}

const REGISTER_NOTE: Record<string, string> = {
  de: 'Use informal "du" register, not formal "Sie".',
  ja: 'Use polite です/ます register.',
  no: 'Use Bokmål, not Nynorsk.',
  zh: 'Use Simplified Chinese, not Traditional.',
};

function buildSystemPrompt(lang: string, glossary: Glossary): string {
  const name = languageName(lang);
  const glossaryLines = Object.entries(glossary)
    .map(([en, translated]) => `- "${en}" → "${translated}"`)
    .join('\n');

  return `You translate UI copy for BullPen, a stock research and portfolio app aimed at beginner-to-intermediate investors, into ${name}.

Voice: approachable and precise, matching a beginner-friendly financial app — never stiffly formal, never jargon for its own sake. ${REGISTER_NOTE[lang] ?? ''}

You will receive a JSON object mapping i18n keys to English source strings. The key itself is context — e.g. "stock.close" vs "common.close" may warrant different translations even though the English text is identical. Return a JSON object with the SAME keys, translated values, nothing else.

Rules:
- Preserve every {{variableName}} interpolation placeholder EXACTLY as written — same spelling, same braces, same position relative to surrounding words as makes grammatical sense in ${name}. Never translate the variable name itself.
- Preserve markdown exactly: **bold**, ## headings, - bullets, line breaks.
- Do NOT translate these terms — copy them through verbatim wherever they appear: ${DO_NOT_TRANSLATE.join(', ')}.
- That list is exhaustive: it does NOT include ordinary words, adjectives, or the everyday names of languages, countries, or nationalities. Every value you receive that isn't one of those exact listed terms must be translated into ${name}, including capitalized words like language names (e.g. "English", "Spanish") — those are ordinary vocabulary, not brand terms, and must be translated like any other word.
${glossaryLines ? `- Use these approved translations for domain terms when they appear:\n${glossaryLines}` : ''}
- Never invent information. If the English string is ambiguous, translate it as literally and safely as possible.
- Return ONLY a single JSON object, no markdown fences, no commentary.`;
}

function extractPlaceholders(text: string): string[] {
  return [...text.matchAll(/\{\{[^}]+\}\}/g)].map((m) => m[0]).sort();
}

/** Same guard ai-translate.ts uses against a model replying conversationally instead of translating. */
const CONVERSATIONAL_RESPONSE_RE = /^(sure|i'm sorry|i am sorry|please provide|certainly)[,!.]?\s/i;

function isValidTranslation(sourceText: string, translated: unknown): translated is string {
  if (typeof translated !== 'string' || !translated.trim()) return false;
  if (CONVERSATIONAL_RESPONSE_RE.test(translated.trim())) return false;

  const sourcePlaceholders = extractPlaceholders(sourceText);
  const targetPlaceholders = extractPlaceholders(translated);
  if (JSON.stringify(sourcePlaceholders) !== JSON.stringify(targetPlaceholders)) return false;

  for (const term of DO_NOT_TRANSLATE) {
    if (sourceText.includes(term) && !translated.includes(term)) return false;
  }

  // Verified live 2026-08-26: with a long do-not-translate list in the system
  // prompt, Haiku sometimes over-generalizes and echoes OTHER capitalized,
  // proper-noun-shaped source text back unchanged (observed on the
  // `languages` namespace — "English"/"Spanish"/etc. came back untranslated,
  // even though none of them are on the DNT list). The prompt in
  // buildSystemPrompt() now explicitly guards against this, but this check
  // stays as a second, independent net: an unchanged value is only
  // legitimate when the source text IS actually a do-not-translate term.
  const isLegitimatelyUnchanged = (DO_NOT_TRANSLATE as readonly string[]).includes(sourceText.trim());
  if (translated.trim() === sourceText.trim() && !isLegitimatelyUnchanged) return false;

  return true;
}

interface ChunkResult {
  translated: Flat;
  /** Keys that failed validation — deliberately NOT recorded in _meta.json,
   *  so the next run retries them instead of treating "fell back to
   *  English" as a permanent success. See translateNamespace(). */
  failedKeys: Set<string>;
}

async function translateChunk(
  lang: string,
  entries: Flat,
  glossary: Glossary
): Promise<ChunkResult> {
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: [
      {
        type: 'text',
        text: buildSystemPrompt(lang, glossary),
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: JSON.stringify(entries) }],
  });

  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error(`No text content in translation response for ${lang}`);
  }

  const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Could not find a JSON object in response for ${lang}`);

  const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  const out: Flat = {};
  const failedKeys = new Set<string>();
  for (const [key, sourceText] of Object.entries(entries)) {
    const candidate = parsed[key];
    if (isValidTranslation(sourceText, candidate)) {
      out[key] = candidate;
    } else {
      failedKeys.add(key);
      console.warn(`  ⚠ ${lang}/${key}: invalid or missing translation, keeping English`);
      out[key] = sourceText;
    }
  }
  return { translated: out, failedKeys };
}

function chunkEntries(flat: Flat, size: number): Flat[] {
  const keys = Object.keys(flat);
  const chunks: Flat[] = [];
  for (let i = 0; i < keys.length; i += size) {
    const slice = keys.slice(i, i + size);
    chunks.push(Object.fromEntries(slice.map((k) => [k, flat[k]])));
  }
  return chunks;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function translateNamespace(ns: string, lang: string) {
  const enFlat = flatten(readJson(join(LOCALES_DIR, SOURCE_LANG, `${ns}.json`), {}));
  const existingFlat = flatten(readJson(join(LOCALES_DIR, lang, `${ns}.json`), {}));

  const metaPath = join(LOCALES_DIR, lang, '_meta.json');
  const meta = readJson<Record<string, string>>(metaPath, {});

  const toTranslate: Flat = {};
  const resultFlat: Flat = {};

  for (const [key, sourceText] of Object.entries(enFlat)) {
    const metaKey = `${ns}.${key}`;
    const currentHash = sha256(sourceText);
    const unchanged = !force && meta[metaKey] === currentHash && existingFlat[key];
    if (unchanged) {
      resultFlat[key] = existingFlat[key];
    } else {
      toTranslate[key] = sourceText;
    }
  }

  if (Object.keys(toTranslate).length === 0) {
    console.log(`  ${lang}/${ns}: nothing changed, skipped`);
    return;
  }

  console.log(`  ${lang}/${ns}: translating ${Object.keys(toTranslate).length} key(s)...`);
  const glossary = loadGlossary(lang);
  const chunks = chunkEntries(toTranslate, CHUNK_SIZE);
  const allFailedKeys = new Set<string>();
  for (const chunk of chunks) {
    const { translated, failedKeys } = await translateChunk(lang, chunk, glossary);
    Object.assign(resultFlat, translated);
    for (const key of failedKeys) allFailedKeys.add(key);
  }

  // Prune orphans: a key removed from English shouldn't linger in target locales.
  for (const key of Object.keys(resultFlat)) {
    if (!(key in enFlat)) delete resultFlat[key];
  }

  writeJson(join(LOCALES_DIR, lang, `${ns}.json`), unflatten(resultFlat));

  // Failed keys are deliberately left out of meta (or have their old entry
  // deleted) so the hash comparison at the top of this function treats them
  // as still-needing-translation next run, instead of "successfully
  // translated" just because we fell back to the (unchanged) English source.
  const newMeta = { ...meta };
  for (const key of Object.keys(enFlat)) {
    const metaKey = `${ns}.${key}`;
    if (allFailedKeys.has(key)) delete newMeta[metaKey];
    else newMeta[metaKey] = sha256(enFlat[key]);
  }
  for (const metaKey of Object.keys(newMeta)) {
    if (metaKey.startsWith(`${ns}.`) && !(metaKey.slice(ns.length + 1) in enFlat)) {
      delete newMeta[metaKey];
    }
  }
  writeJson(metaPath, newMeta);
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set.');
    process.exit(1);
  }

  const namespaces = listNamespaces();
  const targets = langFilter ? [langFilter] : TARGET_LANGS;

  console.log(`Translating ${namespaces.length} namespace(s) into ${targets.length} language(s)...`);
  for (const ns of namespaces) {
    for (const lang of targets) {
      await translateNamespace(ns, lang);
    }
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
