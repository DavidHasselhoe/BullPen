/**
 * Headshot for a curated member, served through /api/congress/photo/[slug].
 *
 * Circular, unlike FundAvatar's rounded square: these are portrait photographs
 * of people, where a circle is the conventional crop and the subject sits
 * centred, rather than square brand artwork that a circle would clip.
 *
 * Initials render underneath rather than as a JS fallback, so a photo that
 * fails to load degrades to them with no error handling and no client
 * component. Same trick as FundAvatar.
 */
export function PoliticianAvatar({
  displayName,
  slug,
  size = 44,
}: {
  displayName: string;
  slug: string;
  size?: number;
}) {
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted/60 font-semibold text-muted-foreground"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
    >
      <span aria-hidden>{initials}</span>
      {/* eslint-disable-next-line @next/next/no-img-element -- the proxy route
          already sets a 30-day immutable cache and next/image would add a
          second optimisation hop for a 44px avatar that is already small. */}
      <img
        src={`/api/congress/photo/${slug}`}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
      />
    </div>
  );
}
