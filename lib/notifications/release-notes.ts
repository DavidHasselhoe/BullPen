/**
 * Weekly "What's new" notification from content/changelog.json.
 *
 * Only entries marked `highlight: true` go out: the changelog ships five or
 * more items most days, and most are too small to interrupt anyone with. A
 * week with no highlights sends nothing. On by default; switched off by
 * settings.notifications.release_notes === false. In-app only, never emailed.
 *
 * The items ride along in the notification's params, so the modal needs no
 * fetch and the full changelog never reaches the client bundle.
 */

import changelog from '@/content/changelog.json';
import { createServerClient } from '@/lib/supabase/client';
import type { ReleaseNotesParams } from './notifications-db';
import { fetchAllPages } from '@/lib/supabase/paging';

export type ChangelogType = 'new' | 'improved' | 'fixed';
export interface ChangelogDay { date: string; entries: { type: string; text: string; highlight?: boolean }[] }

const ORDER: ChangelogType[] = ['new', 'improved', 'fixed'];
/** A curated week is two or three items; this only stops a mis-tagged week from flooding the modal. */
const MAX_ITEMS = 12;

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** The seven days before `runDate` (changelog dates are UTC commit days), highlights only, New then Improved then Fixed. */
export function weeklyHighlights(days: ChangelogDay[], runDate: string): ReleaseNotesParams | null {
  const from = addDays(runDate, -7);
  const items = days
    .filter((d) => d.date >= from && d.date < runDate)
    .sort((a, b) => b.date.localeCompare(a.date))
    .flatMap((d) => d.entries)
    .filter((e): e is { type: ChangelogType; text: string; highlight: true } => e.highlight === true && ORDER.includes(e.type as ChangelogType))
    .sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type))
    .slice(0, MAX_ITEMS)
    .map(({ type, text }) => ({ type, text }));
  return items.length ? { kind: 'release_notes', from, to: addDays(runDate, -1), items } : null;
}

/** One notification per user who hasn't switched it off. Idempotent on entity_id. */
export async function notifyReleaseNotes(runDate: string): Promise<{ items: number; notified: number }> {
  const params = weeklyHighlights(changelog as ChangelogDay[], runDate);
  if (!params) return { items: 0, notified: 0 };
  const supabase = createServerClient();
  const entityId = `release_notes:${params.from}`;

  // Both paged: a cut-off `existing` would send the notes twice to everyone past row 1000.
  const [existing, users] = await Promise.all([
    fetchAllPages<{ user_id: string }>(() => supabase.from('notifications').select('user_id').eq('entity_id', entityId).order('id')),
    fetchAllPages<{ id: string; settings: { notifications?: Record<string, boolean> } | null }>(() =>
      supabase.from('users').select('id, settings').order('id')),
  ]);
  if (existing.error || users.error) throw new Error(existing.error ?? users.error!);
  const skip = new Set(existing.rows.map((n) => n.user_id));
  const userIds = users.rows
    .filter((u) => u.settings?.notifications?.release_notes !== false && !skip.has(u.id))
    .map((u) => u.id);

  const count = params.items.length;
  const rows = userIds.map((user_id) => ({
    user_id,
    type: 'release_notes',
    title: "What's new in BullPen",
    message: `${count} ${count === 1 ? 'update' : 'updates'} from the past week.`,
    entity_type: 'market',
    entity_id: entityId,
    severity: 'info',
    params,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('notifications').insert(rows.slice(i, i + 500));
    if (error) throw error;
  }
  return { items: count, notified: rows.length };
}
