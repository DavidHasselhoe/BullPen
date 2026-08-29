/**
 * Discord Bot API client — used instead of an incoming webhook when a
 * message needs an interactive button. A button click on a message posted
 * through an incoming webhook has no real application to route the
 * interaction to (incoming webhooks aren't owned by one of our Discord
 * applications), so Discord can't deliver it anywhere and the click just
 * fails. A message posted by our own bot is unambiguously owned by this
 * app, so Discord delivers the resulting MESSAGE_COMPONENT interaction to
 * our Interactions Endpoint URL (see app/api/discord/interactions/route.ts).
 *
 * Requires DISCORD_BOT_TOKEN, and the bot must already be a member of the
 * target server with permission to post in `channelId`.
 */
import { ButtonStyleTypes, MessageComponentTypes } from 'discord-interactions';
import type { DiscordEmbed } from './post-message';

export interface DiscordBotButton {
  label: string;
  /** Encodes what the button does, e.g. `publish:<postId>` — read back out of the interaction payload when clicked. */
  customId: string;
  style?: 'primary' | 'success' | 'danger';
}

export interface DiscordBotMessage {
  content?: string;
  embeds?: DiscordEmbed[];
  buttons?: DiscordBotButton[];
}

const STYLE_MAP: Record<NonNullable<DiscordBotButton['style']>, ButtonStyleTypes> = {
  primary: ButtonStyleTypes.PRIMARY,
  success: ButtonStyleTypes.SUCCESS,
  danger: ButtonStyleTypes.DANGER,
};

export async function sendDiscordBotMessage(channelId: string, message: DiscordBotMessage): Promise<{ id: string }> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error('DISCORD_BOT_TOKEN not set');

  const components = message.buttons?.length
    ? [
        {
          type: MessageComponentTypes.ACTION_ROW,
          components: message.buttons.map((b) => ({
            type: MessageComponentTypes.BUTTON,
            style: STYLE_MAP[b.style ?? 'primary'],
            label: b.label,
            custom_id: b.customId,
          })),
        },
      ]
    : undefined;

  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: message.content, embeds: message.embeds, components }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Discord bot message failed: ${res.status} ${body}`);
  }

  return res.json();
}
