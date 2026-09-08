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
 * The chip is a rounded square, not a circle: these marks are square artwork
 * (and several are wide wordmarks), so a circle clips the corners and forces
 * enough padding that the logo floats in a ring of dead white space.
 *
 * `accentColor` tints the initials only. It deliberately does not tint the
 * card or throw a glow behind the avatar — a grid of a dozen differently
 * washed, haloed cards reads as decoration, not as information.
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
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl font-semibold"
      style={{
        width: size,
        height: size,
        minWidth: size,
        fontSize: size * 0.36,
        // 8-digit hex = the accent at low alpha; keeps the fill quiet enough
        // that the mark stays the legible thing, not the color.
        backgroundColor: logoUrl ? '#ffffff' : accentColor ? `${accentColor}24` : 'var(--muted)',
        color: accentColor ?? 'var(--muted-foreground)',
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
          // Eager, not lazy: a not-yet-loaded logo is a blank chip, and this
          // renders as a grid of a dozen at once, so lazily they pop in one by
          // one as the grid scrolls past. They are ~40px each.
          loading="eager"
          decoding="async"
          // No padding: object-contain never crops, so a full-bleed brand tile
          // fills the chip and picks up its rounded corners, while a mark on
          // white keeps the breathing room already baked into its own artwork.
          className="h-full w-full object-contain"
        />
      )}
    </div>
  );
}
