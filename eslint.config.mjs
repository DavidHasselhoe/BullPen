import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import i18next from "eslint-plugin-i18next";

/**
 * i18n lint ratchet (see the i18n effort plan, Phase 2b). `i18next/no-literal-string`
 * flags a hardcoded JSX text string — but it's only turned on for directories
 * that have ALREADY been through the Phase 1 codemod + review pass and verified
 * to have zero hardcoded strings. Enabling it repo-wide would just flag the
 * ~2,000 strings still awaiting conversion; scoped like this, it instead makes
 * a REGRESSION in an already-converted area impossible without failing the
 * lint gate that already runs every session — no ongoing discipline required.
 *
 * Add a directory's glob here the same PR its Phase 1 conversion completes.
 * Empty for now — nothing has been fully converted yet.
 */
const I18N_DONE_DIRS = ["app/tools/ai-chat/**/*.tsx", "app/tools/portfolio-builder/**/*.tsx", "app/tools/buy-here/**/*.tsx", "app/tools/market-mood/**/*.tsx", "app/tools/dividend/**/*.tsx", "app/tools/heatmap/**/*.tsx", "app/tools/alerts/**/*.tsx", "app/tools/calendar/**/*.tsx", "app/tools/page.tsx", "app/tools/[tool]/**/*.tsx", "app/tools/deep-dive/**/*.tsx", "app/tools/screener/page.tsx"];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...(I18N_DONE_DIRS.length > 0
    ? [
        {
          files: I18N_DONE_DIRS,
          plugins: { i18next },
          rules: {
            "i18next/no-literal-string": ["error", { mode: "jsx-text-only" }],
          },
        },
      ]
    : []),
  {
    // Respect the codebase's existing `_`-prefix convention for intentionally
    // unused handler params (e.g. `_session`, `_ctx`) instead of flagging them.
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Harness scratch space (agent worktrees) — never lint their build artifacts.
    ".claude/**",
    "**/.next/**",
    // Compiled Vercel output — not source
    ".vercel/**",
    // Vendored from Bklit UI (components.json @bklit registry) — third-party
    // source we don't author, trips react-hooks/refs and set-state-in-effect
    // in its own internals.
    "components/charts/**",
    // AI-tool skill/agent config directories (Claude Code, Cursor, GitHub
    // Copilot) — vendored skill bundles like impeccable's minified scripts,
    // not application source. Same rationale as components/charts/** above.
    ".agents/**",
    ".cursor/**",
    ".github/skills/**",
    ".github/agents/**",
    ".github/hooks/**",
  ]),
]);

export default eslintConfig;
