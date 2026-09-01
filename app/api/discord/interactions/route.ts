/**
 * Discord Interactions Endpoint
 * POST /api/discord/interactions
 *
 * Configured as this Discord application's "Interactions Endpoint URL"
 * (Developer Portal → General Information). Discord POSTs every slash
 * command and message-component (button) click here instead of us
 * needing a persistent bot process with a live Gateway connection.
 *
 * The only interaction handled is a "Publish Now" button, custom_id
 * `publish:<postId>` (see lib/discord/bot-message.ts), which calls the same
 * publishStagedPost() used by scripts/publish-instagram.ts and
 * app/api/instagram/publish-by-id. Nothing currently sends that button —
 * every Instagram generation cron auto-publishes immediately on staging now,
 * so there's never a still-'ready' post left for it to act on. This handler
 * is left in place in case a button is wanted again for something else.
 *
 * Every request must be signed-verified with the app's public key before
 * touching the body — this is Discord's replacement for a shared-secret
 * header, and requests failing verification must 401 or Discord disables
 * the endpoint. Publishing can take a few seconds (image render + Meta
 * upload), longer than Discord's 3-second interaction response budget, so
 * this responds with DEFERRED_UPDATE_MESSAGE immediately and does the real
 * work in `after()`, then edits the original message with the result via
 * the interaction's follow-up webhook (valid 15 minutes).
 */
import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { verifyKey, InteractionType, InteractionResponseType } from 'discord-interactions';
import { publishStagedPost, type PublishStagedPostResult } from '@/lib/instagram/publish';

export const maxDuration = 60;

async function editOriginalMessage(applicationId: string, interactionToken: string, content: string): Promise<void> {
  const res = await fetch(
    `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/@original`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, components: [] }),
    }
  );
  if (!res.ok) {
    console.error('[discord-interactions] failed to edit original message:', res.status, await res.text().catch(() => ''));
  }
}

function describeResult(postId: string, result: PublishStagedPostResult): string {
  switch (result.outcome) {
    case 'published':
      return `✅ Published to Instagram: ${result.permalink ?? result.mediaId}`;
    case 'dry_run':
      return '⚠️ Instagram credentials not configured on this deployment — dry run only, nothing was posted.';
    case 'not_found':
      return `❌ Post ${postId} not found.`;
    case 'not_ready':
      return `❌ Post ${postId} has status "${result.status}" — already handled or not publishable anymore.`;
    case 'failed':
      return `❌ Publish failed: ${result.error}`;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');
  const rawBody = await request.text();

  if (!publicKey || !signature || !timestamp || !(await verifyKey(rawBody, signature, timestamp, publicKey))) {
    return NextResponse.json({ error: 'invalid request signature' }, { status: 401 });
  }

  const interaction = JSON.parse(rawBody);

  if (interaction.type === InteractionType.PING) {
    return NextResponse.json({ type: InteractionResponseType.PONG });
  }

  if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
    const customId: string = interaction.data?.custom_id ?? '';
    if (customId.startsWith('publish:')) {
      const postId = customId.slice('publish:'.length);
      const applicationId: string = interaction.application_id;
      const interactionToken: string = interaction.token;

      after(async () => {
        try {
          const result = await publishStagedPost(postId);
          await editOriginalMessage(applicationId, interactionToken, describeResult(postId, result));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await editOriginalMessage(applicationId, interactionToken, `❌ Publish crashed for ${postId}: ${message}`).catch(() => {});
        }
      });

      return NextResponse.json({ type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE });
    }
  }

  return NextResponse.json({ error: 'unhandled interaction' }, { status: 400 });
}
