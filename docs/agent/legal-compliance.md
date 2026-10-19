# Legal compliance surfaces

_Moved out of CLAUDE.md on 2026-10-19 so it is read when needed instead of sent with every request. CLAUDE.md points here._

Four things are load-bearing and easy to break without noticing:

- **Age gate.** Signup collects a date of birth and refuses under-18s. The rule lives in `lib/auth/age-gate.ts` *and* in migration `147_age_gate_eighteen.sql` (a trigger, because signup runs client-side and form validation is not a boundary) — change both or neither. 18 was David's call on 2026-09-22, on the grounds that 18 is when someone can open a brokerage account; it also puts COPPA and GDPR Article 8 out of scope entirely rather than merely handled. `AgeCheckGate` in the root layout asks accounts that arrived without a date, which is every Google sign-in and everything created before 2026-09-22. The date field is the verification; the signup checkbox next to it is the terms acceptance and age representation, recorded as `users.terms_accepted_at`.
- **Email footers.** Every send goes through `sendEmail`, which requires a `kind` of `transactional` or `marketing` and appends the matching footer. The postal address CAN-SPAM requires comes from the registered DMCA address, so the two can never disagree; a marketing send with no address anywhere throws rather than sends.
- **Renewal terms.** `renewalTerms()` in `lib/billing/trial-copy.ts` is the single source for the auto-renewal disclosure, rendered next to all three purchase buttons (`/upgrade`, `/get-started/trial`, landing pricing). Deliberately not translated: see the comment there. `scripts/test-onboarding-trial.ts` asserts the four required facts are present.
- **Session replay.** Off in both halves: `disable_session_recording` in `PostHogProvider.tsx` and `session_recording_opt_in: false` on the PostHog project. If it is ever switched on, the config there already masks all inputs and blocks `.ph-no-capture` subtrees, which is what the auth forms are marked with.
