import { createHash } from 'crypto';
import { createServerClient } from '@/lib/supabase/client';
import { aiTranslate, TranslationError } from './ai-translate';

const SUPPORTED_LANGS = new Set(['es', 'fr', 'de', 'ja', 'zh', 'no']);

function hashText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function segmentByNewlines(text: string): { textParts: string[]; delims: string[] } {
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

  if (!text || !SUPPORTED_LANGS.has(lang)) return text;

  const hash = hashText(text);
  const supabase = createServerClient();

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

  try {
    const { textParts, delims } = segmentByNewlines(text);
    const translated = await aiTranslate(textParts, lang);
    const result = rejoinSegments(translated, delims);

    // Fire-and-forget cache write
    supabase
      .from('translation_cache')
      .insert({ text_hash: hash, target_lang: lang, translated_text: result })
      .then(({ error }) => {
        if (error && error.code !== '23505') {
          console.error('[translate] Cache write failed:', error.message);
        }
      });

    return result;
  } catch (err) {
    if (err instanceof TranslationError) {
      console.error(`[translate] Translation error ${err.statusCode}:`, err.message);
    } else {
      console.error('[translate] Unexpected error:', err);
    }
    return text;
  }
}
