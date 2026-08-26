/**
 * Discord incoming-webhook client for BullPen.
 *
 * Posts to a Discord "Incoming Webhook" URL (created in a channel's
 * Integrations → Webhooks settings) — no OAuth, no bot token, just a POST.
 */

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number; // decimal RGB, e.g. 0x22c55e for green
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text: string };
  timestamp?: string; // ISO 8601
  /** One image per embed — Discord renders it inline, full-width, directly
   *  in the message. Multiple embeds in the same message (up to 10) each
   *  with their own `image` is the standard way to paste several pictures
   *  into one webhook post, since a single embed can only carry one. */
  image?: { url: string };
}

export interface DiscordMessage {
  content?: string;
  embeds?: DiscordEmbed[];
}

/**
 * Post a message to a Discord incoming webhook. Throws on a non-2xx response —
 * callers decide whether to await (propagate failure) or fire-and-forget with
 * a .catch(), matching how lib/email/resend.ts's sendEmail() is used.
 */
export async function postToDiscord(webhookUrl: string, message: DiscordMessage): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Discord webhook post failed: ${res.status} ${body}`);
  }
}
