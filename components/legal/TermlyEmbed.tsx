import Script from 'next/script';

interface TermlyEmbedProps {
  policyId: string;
}

/**
 * Termly's official policy embed — fetches the current published policy (and
 * theme) at runtime, so edits made in the Termly dashboard show up here
 * automatically with no redeploy. Requires app.termly.io in middleware.ts's
 * CSP (script-src + frame-src) — the embed renders via an internal iframe.
 *
 * The embed loads Weglot for translation, which auto-detects the visitor's
 * browser locale and can silently translate the whole legal document out of
 * English — confirmed happening for a Norwegian-locale visitor. These are
 * legal terms; the authored, authoritative language must not vary by visitor.
 * Force it back to English once Weglot initializes (polled, since Weglot's
 * own async init isn't guaranteed to be ready the instant the script tag's
 * `onLoad` fires).
 */
export function TermlyEmbed({ policyId }: TermlyEmbedProps) {
  return (
    <>
      <div className="legal-doc" name="termly-embed" data-id={policyId} />
      <Script src="https://app.termly.io/embed-policy.min.js" strategy="afterInteractive" />
      <Script id={`termly-force-english-${policyId}`} strategy="afterInteractive">
        {`
          (function poll(attemptsLeft) {
            if (window.Weglot && typeof window.Weglot.switchTo === 'function') {
              window.Weglot.switchTo('en');
              return;
            }
            if (attemptsLeft > 0) setTimeout(function () { poll(attemptsLeft - 1); }, 200);
          })(25);
        `}
      </Script>
    </>
  );
}
