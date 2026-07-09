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
