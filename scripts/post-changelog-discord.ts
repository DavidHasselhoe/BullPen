/**
 * Post the newest changelog entry to Discord.
 *
 * Usage: npm run post-changelog-discord
 * Run this after committing a new content/changelog.json entry — see
 * CLAUDE.md's End Session Protocol, step 3.
 *
 * Ensure DISCORD_CHANGELOG_WEBHOOK_URL is set in .env.local
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { readFileSync } from 'fs';
import { join } from 'path';
import { postToDiscord, type DiscordEmbed } from '../lib/discord/post-message';

type ChangelogEntryType = 'new' | 'improved' | 'fixed';
interface ChangelogEntry {
  type: ChangelogEntryType;
  text: string;
}
interface ChangelogDateGroup {
  date: string;
  entries: ChangelogEntry[];
}

const TYPE_EMOJI: Record<ChangelogEntryType, string> = {
  new: '🆕',
  improved: '⚡',
  fixed: '🐛',
};

async function main() {
  const webhookUrl = process.env.DISCORD_CHANGELOG_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error('Set DISCORD_CHANGELOG_WEBHOOK_URL in .env.local first.');
    process.exit(1);
  }

  const changelogPath = join(process.cwd(), 'content', 'changelog.json');
  const changelog = JSON.parse(readFileSync(changelogPath, 'utf-8')) as ChangelogDateGroup[];

  if (changelog.length === 0) {
    console.error('content/changelog.json is empty — nothing to post.');
    process.exit(1);
  }

  const latest = changelog[0];
  const description = latest.entries.map((e) => `${TYPE_EMOJI[e.type]} ${e.text}`).join('\n');

  const embed: DiscordEmbed = {
    title: `📦 BullPen updates — ${latest.date}`,
    description,
    color: 0x3b82f6,
    fields: [{ name: 'Full changelog', value: 'https://bullpen.no/changelog' }],
    timestamp: new Date().toISOString(),
  };

  await postToDiscord(webhookUrl, { embeds: [embed] });
  console.log(`Posted ${latest.entries.length} entries from ${latest.date} to Discord.`);
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
