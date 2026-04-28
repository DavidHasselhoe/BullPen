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
