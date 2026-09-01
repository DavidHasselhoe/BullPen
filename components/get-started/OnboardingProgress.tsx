'use client';

/**
 * Progress bar for the /get-started quiz. Deliberately a plain proportional
 * fill with no "step X of Y" label, and deliberately counts the screen
 * currently being viewed as already underway rather than starting from an
 * empty bar — arriving at question 1 of 4 shows the bar at 1/5 (20%) full,
 * not 0%. This mirrors the "endowed progress" effect (Nunes & Drèze 2006):
 * a car-wash loyalty card pre-stamped 2 of 10 outperformed a blank 8-stamp
 * card at the same real remaining effort, because a task framed as "already
 * begun" gets finished more often than one framed as "not yet started". See
 * docs/conversion-optimization-research.md for the full research and why no
 * numeric label is shown (a visible fraction invites the "wait, shouldn't
 * this be 0 of 4?" scrutiny that a plain visual proportion doesn't).
 */
export function OnboardingProgress({ stepIndex, totalSteps }: { stepIndex: number; totalSteps: number }) {
  const percent = Math.round(((stepIndex + 1) / totalSteps) * 100);

  return (
    <div
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{ maxWidth: 200, margin: '0 auto 32px', height: 6, borderRadius: 999, background: 'var(--border-strong)', overflow: 'hidden' }}
    >
      <div
        style={{
          height: '100%',
          width: '100%',
          borderRadius: 999,
          background: 'var(--accent)',
          transform: `scaleX(${percent / 100})`,
          transformOrigin: 'left',
          transition: 'transform 400ms cubic-bezier(0.22,1,0.36,1)',
        }}
      />
    </div>
  );
}
