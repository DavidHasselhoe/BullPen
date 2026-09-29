import { useId, type ReactNode } from 'react';

/**
 * One header and one container language for every section on Home: a
 * sentence-case h2 at the product Title size (DESIGN.md §3), never an
 * uppercase eyebrow, above a single flat panel. Real headings, so a screen
 * reader can jump section to section.
 */
export const homePanel = 'rounded-xl border border-border/60 bg-card';

export function HomeSection({
  title,
  aside,
  children,
}: {
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="min-w-0">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 id={id} className="text-lg font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
