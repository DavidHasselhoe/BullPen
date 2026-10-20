# Environment variables

_Moved out of CLAUDE.md on 2026-10-19 so it is read when needed instead of sent with every request. CLAUDE.md points here._


Copy `.env.example` (or see `ENV_SETUP.md`) and create `.env.local`. Required:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
TWELVE_DATA_API_KEY
```

Optional but used in production: `FINNHUB_API_KEY`, `RESEND_API_KEY`, `CRON_SECRET`, `LOGO_DEV_KEY`, `NEXT_PUBLIC_APP_URL`, `SNAPTRADE_CLIENT_ID`, `SNAPTRADE_CONSUMER_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `DISCORD_CHANGELOG_WEBHOOK_URL` (Discord changelog announcements — see `scripts/post-changelog-discord.ts`), `DISCORD_INSTAGRAM_WEBHOOK_URL`, `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_USER_ID` (automated Instagram content pipeline, Business Login for Instagram — see `docs/instagram-setup.md`), `DISCORD_INDEX_SYNC_WEBHOOK_URL` (index-constituent sync change notifications — see `scripts/sync-index-constituents.ts`), `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` (product analytics, gated behind cookie consent — see `components/analytics/PostHogProvider.tsx`), `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (Google One Tap, off when unset; the same Web client ID must be in the Supabase Google provider's client IDs — see `components/auth/GoogleOneTap.tsx`), `BULLPEN_POSTAL_ADDRESS` (overrides the CAN-SPAM footer address, which defaults to the registered DMCA service provider address), `DMCA_AGENT_NAME` / `DMCA_AGENT_ADDRESS` / `DMCA_AGENT_PHONE` / `DMCA_AGENT_EMAIL` / `DMCA_AGENT_REGISTRATION_NUMBER` (override the registered agent details published on `/dmca`; the real ones are defaults in `lib/legal/dmca-agent.ts`).

