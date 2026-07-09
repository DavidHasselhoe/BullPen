/**
 * Test Discord webhook posting.
 *
 * Usage: npm run test-discord-webhook -- deploy
 *        npm run test-discord-webhook -- changelog
 *
 * Ensure DISCORD_DEPLOY_WEBHOOK_URL / DISCORD_CHANGELOG_WEBHOOK_URL is set in .env.local
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { postToDiscord } from '../lib/discord/post-message';

async function main() {
  const which = process.argv[2] === 'changelog' ? 'changelog' : 'deploy';
  const envVar = which === 'changelog' ? 'DISCORD_CHANGELOG_WEBHOOK_URL' : 'DISCORD_DEPLOY_WEBHOOK_URL';
  const webhookUrl = process.env[envVar];

  if (!webhookUrl) {
    console.error(`Set ${envVar} in .env.local first.`);
    process.exit(1);
  }

  try {
    await postToDiscord(webhookUrl, {
      embeds: [
        {
          title: '✅ Test message from BullPen',
          description: `This is a test post to the ${which} channel.`,
          color: 0x3b82f6,
          timestamp: new Date().toISOString(),
        },
      ],
    });
    console.log(`Posted test message to the ${which} webhook — check Discord.`);
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
