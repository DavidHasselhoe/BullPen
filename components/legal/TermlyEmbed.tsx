interface TermlyEmbedProps {
  policyId: string;
  /** Iframe height in px. Policies vary a lot in length (Privacy runs long,
   * Terms/Accessibility are shorter) — tune per page rather than sharing one
   * value, since a too-short iframe would truncate the document instead of
   * just leaving blank space. */
  height?: number;
}

/**
 * Termly's hosted policy viewer, in a plain iframe — renders the same
 * live, dashboard-editable policy as Termly's official JS embed
 * (`embed-policy.min.js`), without needing that script.
 *
 * The JS embed calls eval() internally, which broke in production once
 * middleware.ts's CSP stopped allowing 'unsafe-eval' (2026-07-29, a
 * deliberate security fix — see git history). CSP's 'unsafe-eval' can't be
 * scoped to one script's origin, so re-adding it to unblock Termly would
 * have reopened eval-based XSS for every script on the page, not just
 * theirs. This iframe sidesteps the whole problem: content renders inside
 * Termly's own origin/CSP context (app.termly.io), which our script-src
 * never needs to touch — only `frame-src https://app.termly.io` in
 * middleware.ts, which was already required and unaffected by the eval fix.
 *
 * `&lang=en` best-effort forces English — unverified against a non-English
 * browser locale, but the JS embed this replaced needed an explicit fix for
 * Weglot auto-translating the (authoritative, must-not-vary) legal text out
 * of English, so defaulting defensively here rather than assuming the
 * hosted viewer is immune to the same class of issue.
 */
export function TermlyEmbed({ policyId, height = 3000 }: TermlyEmbedProps) {
  return (
    <iframe
      src={`https://app.termly.io/policy-viewer/policy.html?policyUUID=${policyId}&lang=en`}
      title="Legal policy"
      style={{ width: '100%', height, border: 'none' }}
    />
  );
}
