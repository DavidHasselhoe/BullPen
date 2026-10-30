'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { intlLocale } from '@/lib/i18n/intl-locale';
import type { ReleaseNotesParams } from '@/lib/notifications/notifications-db';

const EVENT = 'bullpen:release-notes';

/**
 * Opens the weekly "What's new" modal. It is mounted once at the root
 * (ReleaseNotesDialogHost) rather than inside the notification card: the card
 * lives in the bell's popover, and a click in the dialog counts as outside the
 * popover, which closed it and took a nested dialog with it.
 */
export function openReleaseNotes(params: ReleaseNotesParams) {
  window.dispatchEvent(new CustomEvent<ReleaseNotesParams>(EVENT, { detail: params }));
}

const SECTIONS = [
  { type: 'new', labelKey: 'releaseNotesNew' },
  { type: 'improved', labelKey: 'releaseNotesImproved' },
  { type: 'fixed', labelKey: 'releaseNotesFixed' },
] as const;

export function ReleaseNotesDialogHost() {
  const { t, i18n } = useTranslation('navigation');
  const [notes, setNotes] = useState<ReleaseNotesParams | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = (e: Event) => {
      setNotes((e as CustomEvent<ReleaseNotesParams>).detail);
      setOpen(true);
    };
    window.addEventListener(EVENT, onOpen);
    return () => window.removeEventListener(EVENT, onOpen);
  }, []);

  if (!notes) return null;
  // Changelog days are YYYY-MM-DD; UTC keeps them on the same date everywhere.
  const day = new Intl.DateTimeFormat(intlLocale(i18n.language), { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const range = day.formatRange(new Date(`${notes.from}T12:00:00Z`), new Date(`${notes.to}T12:00:00Z`));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('releaseNotesTitle')}</DialogTitle>
          <DialogDescription>{range}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {SECTIONS.map(({ type, labelKey }) => {
            const items = notes.items.filter((i) => i.type === type);
            if (!items.length) return null;
            return (
              <section key={type} aria-labelledby={`release-notes-${type}`}>
                <h3 id={`release-notes-${type}`} className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t(labelKey)}
                </h3>
                <ul className="space-y-2">
                  {items.map((item) => (
                    <li key={item.text} className="flex gap-2.5 text-sm leading-relaxed text-foreground">
                      <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/40" />
                      {/* Changelog text is English only; see lib/notifications/release-notes.ts. */}
                      <span lang="en">{item.text}</span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
        <Link
          href="/changelog"
          onClick={() => setOpen(false)}
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {t('releaseNotesSeeAll')}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </DialogContent>
    </Dialog>
  );
}
