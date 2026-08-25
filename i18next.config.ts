/**
 * i18next-cli config for the app-wide translation effort's Phase 1 codemod
 * (instrument + extract). Deliberately scoped to ONE area at a time via
 * extract.input — see the i18n plan's Phase 1 for why (i18next-cli's own
 * docs: "expect both false positives and false negatives", never run
 * repo-wide). Update `extract.input` to the next area before each pass.
 *
 * locales is ['en'] ONLY on purpose: this config's extract step manages the
 * English source file (finding t() calls, keeping en/<ns>.json in sync with
 * them). The other 6 languages are exclusively managed by
 * scripts/translate-locales.ts, which reads en/<ns>.json as its source of
 * truth — letting i18next-cli also write "secondary languages" here would
 * mean two systems independently deciding what belongs in es/fr/de/ja/zh/no,
 * and it would blow away real existing translations with empty placeholders
 * on first run.
 */
import { defineConfig } from 'i18next-cli';

export default defineConfig({
  locales: ['en'],
  extract: {
    input: 'app/tools/ai-chat/**/*.tsx',
    output: 'lib/i18n/locales/{{language}}/{{namespace}}.json',
    defaultNS: 'common',
    primaryLanguage: 'en',
    // Never let a narrowly-scoped run (see input above) delete keys that
    // belong to a namespace file this run doesn't touch.
    removeUnusedKeys: false,
  },
});
