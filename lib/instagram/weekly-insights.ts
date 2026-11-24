/**
 * Weekly Instagram summary for Discord, posted Monday morning about the
 * Monday-Sunday (UTC) week that just ended. Read by
 * app/api/cron/instagram-weekly-insights.
 *
 * Instagram keeps the history: account totals can be asked for any date range
 * and per-post numbers are running totals, so nothing is logged daily. Only
 * the follower count has to be kept by us (Instagram gives today's total
 * only), one row a week in instagram_weekly_stats (migration 203).
 *
 * Posts are split into the pipeline's own (their media id is in
 * instagram_posts) and everything else, which someone posted by hand. That
 * split is the meme vs informative comparison, with nobody tagging anything.
 */

import { instagramGet, parseMetaTime } from '@/lib/instagram/client';
import { isoWeekKey } from '@/lib/instagram/period-key';
import { formatWeekLabel } from '@/lib/instagram/content/shared';
import type { DiscordEmbed } from '@/lib/discord/post-message';

const DAY = 86_400_000;

const ACCOUNT_METRICS = ['views', 'reach', 'profile_views', 'website_clicks'] as const;
type AccountMetric = (typeof ACCOUNT_METRICS)[number];
export type AccountTotals = Record<AccountMetric, number>;
const ACCOUNT_LABELS: Record<AccountMetric, string> = {
  views: 'Views',
  reach: 'Accounts reached',
  profile_views: 'Profile visits',
  website_clicks: 'Bio link clicks',
};

const POST_METRICS = ['views', 'reach', 'likes', 'comments', 'shares', 'saved'];

export interface WeekWindow {
  key: string;
  start: Date; // Monday 00:00 UTC
  end: Date; // the next Monday 00:00 UTC, exclusive
}

export interface WeekPost {
  id: string;
  permalink: string;
  postedAt: number;
  isReel: boolean;
  /** Running totals at the time of the run; null when Instagram wouldn't give them. */
  stats: Record<string, number> | null;
}

/** The full Monday-Sunday week before the one `now` falls in, or `weeksBack` weeks before that. */
export function completedWeek(now: Date, weeksBack = 0): WeekWindow {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const thisMonday = today - ((now.getUTCDay() + 6) % 7) * DAY;
  const end = new Date(thisMonday - weeksBack * 7 * DAY);
  const start = new Date(end.getTime() - 7 * DAY);
  return { key: isoWeekKey(start), start, end };
}

export async function fetchAccountTotals(week: WeekWindow): Promise<AccountTotals> {
  const res = await instagramGet(
    `/me/insights?metric=${ACCOUNT_METRICS.join(',')}&period=day&metric_type=total_value` +
      `&since=${week.start.getTime() / 1000}&until=${week.end.getTime() / 1000}`,
  );
  const data = (res.data ?? []) as { name: string; total_value?: { value?: number } }[];
  return Object.fromEntries(ACCOUNT_METRICS.map((m) => [m, data.find((d) => d.name === m)?.total_value?.value ?? 0])) as AccountTotals;
}

export async function fetchFollowers(): Promise<number> {
  const res = await instagramGet('/me?fields=followers_count');
  return Number(res.followers_count ?? 0);
}

/** Every feed post and Reel published inside the week, newest first, with its numbers so far. */
export async function fetchWeekPosts(week: WeekWindow): Promise<WeekPost[]> {
  const base = '/me/media?fields=id,media_product_type,timestamp,permalink&limit=50';
  const found: Omit<WeekPost, 'stats'>[] = [];
  let after: string | undefined;
  // ponytail: 4 pages = 200 posts back; plenty at a few posts a day.
  for (let page = 0; page < 4; page++) {
    const res = await instagramGet(after ? `${base}&after=${encodeURIComponent(after)}` : base);
    const items = (res.data ?? []) as { id: string; media_product_type?: string; timestamp: string; permalink: string }[];
    for (const m of items) {
      const postedAt = parseMetaTime(m.timestamp);
      if (postedAt >= week.start.getTime() && postedAt < week.end.getTime()) {
        found.push({ id: m.id, permalink: m.permalink, postedAt, isReel: m.media_product_type === 'REELS' });
      }
    }
    after = (res.paging as { cursors?: { after?: string } } | undefined)?.cursors?.after;
    const oldest = items.at(-1);
    if (!after || !oldest || parseMetaTime(oldest.timestamp) < week.start.getTime()) break;
  }

  return Promise.all(
    found.map(async (p) => {
      const metrics = p.isReel ? [...POST_METRICS, 'ig_reels_avg_watch_time'] : POST_METRICS;
      try {
        const res = await instagramGet(`/${p.id}/insights?metric=${metrics.join(',')}`);
        const data = (res.data ?? []) as { name: string; values?: { value?: number }[] }[];
        return { ...p, stats: Object.fromEntries(data.map((d) => [d.name, d.values?.[0]?.value ?? 0])) };
      } catch (err) {
        console.error(`[instagram-weekly-insights] no stats for ${p.id}:`, err);
        return { ...p, stats: null };
      }
    }),
  );
}

const fmt = (n: number) => n.toLocaleString('en-US');

/** "14 → 41", with a % only once last week's number is big enough for one to mean something. */
export function fmtChange(prev: number | null, cur: number): string {
  if (prev === null) return fmt(cur);
  const pct = prev >= 100 ? ` (${cur >= prev ? '+' : ''}${Math.round(((cur - prev) / prev) * 100)}%)` : '';
  return `${fmt(prev)} → ${fmt(cur)}${pct}`;
}

const typeLabel = (contentType: string) => {
  const s = contentType.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const dayLabel = (ms: number) => {
  const d = new Date(ms);
  const part = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('en-US', { ...o, timeZone: 'UTC' });
  return `${part({ weekday: 'short' })} ${part({ month: 'short' })} ${d.getUTCDate()}`;
};
const watchSeconds = (p: WeekPost) => (p.stats?.ig_reels_avg_watch_time ?? 0) / 1000;

function postLine(p: WeekPost, label: string): string {
  const head = `[${label}, ${dayLabel(p.postedAt)}](${p.permalink})`;
  if (!p.stats) return `${head}: stats unavailable`;
  const s = p.stats;
  const count = (n = 0, word: string) => `${fmt(n)} ${word}${n === 1 ? '' : 's'}`;
  const parts = [count(s.views, 'view'), `reach ${fmt(s.reach ?? 0)}`, count(s.likes, 'like'), count(s.shares, 'share'), count(s.saved, 'save')];
  if (p.isReel && s.ig_reels_avg_watch_time) parts.push(`${watchSeconds(p).toFixed(1)} s avg watch`);
  return `${head}: ${parts.join(', ')}`;
}

function postSection(title: string, lines: string[], empty: string): string {
  // Discord caps an embed description at 4,096 characters.
  const shown = lines.slice(0, 12);
  const more = lines.length > shown.length ? `\n…and ${lines.length - shown.length} more` : '';
  return `**${title} (${lines.length})**\n${lines.length ? shown.join('\n') + more : empty}`;
}

export function buildWeeklySummary(input: {
  week: WeekWindow;
  account: AccountTotals;
  prevAccount: AccountTotals;
  followers: number;
  prevFollowers: number | null;
  posts: WeekPost[];
  /** media id → content_type for posts the pipeline published. */
  pipeline: Map<string, string>;
}): DiscordEmbed {
  const { week, account, prevAccount, followers, prevFollowers, posts, pipeline } = input;
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const weekNo = Number(week.key.split('-W')[1]);

  const accountLines = ACCOUNT_METRICS.map((m) => `${ACCOUNT_LABELS[m]}: ${fmtChange(prevAccount[m], account[m])}`);
  accountLines.push(
    prevFollowers === null ? `Followers: ${fmt(followers)} (first week tracked)` : `Followers: ${fmtChange(prevFollowers, followers)}`,
  );

  const byHand = posts.filter((p) => !pipeline.has(p.id));
  const automatic = posts.filter((p) => pipeline.has(p.id));
  const sections = [
    `**Account** (week before → this week)\n${accountLines.join('\n')}`,
    postSection('Posted by hand', byHand.map((p) => postLine(p, p.isReel ? 'Reel' : 'Post')), 'Nothing posted by hand this week.'),
    postSection('Automatic posts', automatic.map((p) => postLine(p, typeLabel(pipeline.get(p.id)!))), 'No automatic posts this week.'),
  ];

  const best = posts.filter((p) => p.isReel && watchSeconds(p) > 0).sort((a, b) => watchSeconds(b) - watchSeconds(a))[0];
  if (best) sections.push(`**Best watch time:** [${dayLabel(best.postedAt)} Reel](${best.permalink}), ${watchSeconds(best).toFixed(1)} s on average`);

  // Discord rejects the whole embed past 4,096 characters: drop whole lines from the end.
  let description = sections.join('\n\n');
  while (description.length > 4096) description = description.slice(0, description.lastIndexOf('\n', 4090)) + '\n…';

  return {
    title: `Instagram week ${weekNo}: ${formatWeekLabel(iso(week.start), iso(new Date(week.end.getTime() - DAY)))}`,
    description,
    color: 0x34d399,
    footer: { text: 'Post numbers are totals so far, so posts from late in the week have had less time to collect them.' },
    timestamp: new Date().toISOString(),
  };
}
