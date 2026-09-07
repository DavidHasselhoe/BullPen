/**
 * Initials avatar for a fund card — deliberately NOT CompanyLogo. A fund
 * slug/name isn't a stock ticker, and CompanyLogo's no-logoUrl fallback
 * hits `/api/logo/[ticker]`, which would fire a real (wasted, guaranteed-miss)
 * TwelveData lookup for every private fund with no public ticker. Every fund
 * here has logoUrl=null in v1 (no admin UI to set one), so this always
 * renders initials — same neutral, grayscale-first treatment as the rest of
 * BullPen's "confident ledger" system rather than a colorful hash avatar.
 */
export function FundAvatar({ displayName, size = 36 }: { displayName: string; size?: number }) {
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground font-semibold"
      style={{ width: size, height: size, minWidth: size, fontSize: size * 0.36 }}
      aria-hidden
    >
      {initials}
    </div>
  );
}
