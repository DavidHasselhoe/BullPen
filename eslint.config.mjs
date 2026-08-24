import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
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
