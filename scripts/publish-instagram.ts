/**
 * Publish a staged Instagram post — the manual, on-demand version of the
 * "actually make it go live" step. Every generation cron auto-publishes on
 * its own now (see lib/instagram/publish.ts), so this is mainly useful for
 * testing, or republishing a post that ended up 'failed' or 'draft'.
 *
 * Usage: npm run instagram-publish -- --id=<postId>
 *
 * If INSTAGRAM_ACCESS_TOKEN / INSTAGRAM_USER_ID aren't set yet
 * (see docs/instagram-setup.md), this runs as a dry run: prints what would
 * have been published and exits cleanly without touching the row's status,
 * so the whole pipeline is testable before real Meta credentials exist.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { publishStagedPost } from '../lib/instagram/publish';

function parseId(): string {
  const arg = process.argv.find((a) => a.startsWith('--id='));
  if (!arg) {
    console.error('Usage: npm run instagram-publish -- --id=<postId>');
    process.exit(1);
  }
  return arg.slice('--id='.length);
}

async function main() {
  const id = parseId();
  const result = await publishStagedPost(id);

  switch (result.outcome) {
    case 'not_found':
      console.error(`No instagram_posts row found for id ${id}.`);
      process.exit(1);
      break;
    case 'not_ready':
      console.error(`Post ${id} has status "${result.status}", not "ready" — nothing to publish.`);
      process.exit(1);
      break;
    case 'dry_run':
      console.log('Instagram is not configured (INSTAGRAM_ACCESS_TOKEN / INSTAGRAM_USER_ID unset) — dry run only.\n');
      console.log('Would publish:');
      console.log(`  Caption:\n${result.caption}\n`);
      console.log('  Slides:');
      result.imageUrls.forEach((url, i) => console.log(`    ${i + 1}. ${url}`));
      console.log('\nSet up Meta credentials (see docs/instagram-setup.md) and re-run this command to publish for real.');
      break;
    case 'published':
      console.log(`Published. Media id: ${result.mediaId}`);
      if (result.permalink) console.log(`Permalink: ${result.permalink}`);
      break;
    case 'failed':
      console.error('Publish failed:', result.error);
      process.exit(1);
      break;
  }
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
