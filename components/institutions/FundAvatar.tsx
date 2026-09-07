/**
 * Fund avatar for the 13F tracker — deliberately NOT CompanyLogo. A fund
 * slug/name isn't a stock ticker, and CompanyLogo's no-logoUrl fallback hits
 * `/api/logo/[ticker]`, which would fire a real (wasted, guaranteed-miss)
 * TwelveData lookup for every private fund with no public ticker.
 *
 * `logoUrl` is the fund's real logo, fetched from logo.dev by domain and
 * stored in our own bucket (scripts/backfill-institution-logos.ts). It sits on
 * a white chip because brand logos are drawn for light backgrounds and a dark
 * wordmark would otherwise vanish into a dark card. Initials render underneath
 * rather than as a JS fallback, so a logo that fails to load degrades to them
 * with no error handling and no client component.
 *
 * `accentColor` is the fund's assigned categorical color (see
 * InstitutionalHoldingsSection): it tints the initials and lays a soft glow
 * behind the avatar, which is what lets a grid of otherwise-identical cards be
 * told apart at a glance, and what carries the fund's identity through to its
 * detail page. Without it this stays grayscale.
 */
export function FundAvatar({
  displayName,
  size = 36,
  accentColor,
  logoUrl,
}: {
  displayName: string;
  size?: number;
  accentColor?: string;
  logoUrl?: string | null;
}) {
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold"
      style={{
        width: size,
        height: size,
        minWidth: size,
        fontSize: size * 0.36,
        // 8-digit hex = the accent at low alpha; keeps the fill quiet enough
        // that the mark stays the legible thing, not the color.
        backgroundColor: logoUrl ? '#ffffff' : accentColor ? `${accentColor}24` : 'var(--muted)',
        color: accentColor ?? 'var(--muted-foreground)',
        boxShadow: accentColor ? `0 0 18px -4px ${accentColor}80` : undefined,
      }}
      aria-hidden
    >
      {!logoUrl && initials}
      {logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-contain"
          style={{ padding: size * 0.14 }}
        />
      )}
    </div>
  );
}
