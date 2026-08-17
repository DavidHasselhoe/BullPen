/**
 * Instagram (Instagram Platform API, "Business Login for Instagram") publishing client.
 *
 * Plain fetch() calls, no SDK — matches lib/discord/post-message.ts's
 * precedent for external-platform publishing rather than adding a new
 * dependency for what's a handful of REST calls.
 *
 * Deliberately uses the Facebook-Page-free auth path (graph.instagram.com +
 * an Instagram-scoped user id from Instagram Login) rather than the older
 * Graph API path that publishes through a linked Facebook Page — this
 * pipeline only ever needs to publish, never ads/Business Manager features,
 * so the lighter path is a strict win. See docs/instagram-setup.md for the
 * one-time OAuth setup and app/api/instagram/oauth/callback/route.ts for the
 * helper that turns an authorization code into these env vars.
 *
 * Carousel publish is a 3-step async flow (Meta's own design, not ours):
 *   1. One "item container" per image (POST .../media, is_carousel_item=true)
 *   2. One "carousel container" referencing all the item containers as children
 *   3. Poll the carousel container until Meta finishes processing it, then
 *      POST .../media_publish with its id to actually go live.
 *
 * Lazy config + isInstagramConfigured() mirrors lib/snaptrade/client.ts's
 * established pattern for optional third-party integrations in this repo.
 * Unlike that client, publishCarousel() does NOT throw when unconfigured —
 * it returns a dry-run result instead, so the rest of the pipeline
 * (generation, rendering, staging, review) is fully testable before real
 * Meta credentials exist.
 */

const GRAPH_API_BASE = 'https://graph.instagram.com/v21.0';

export function isInstagramConfigured(): boolean {
  return !!(process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_USER_ID);
}

interface InstagramConfig {
  accessToken: string;
  userId: string;
}

function getConfig(): InstagramConfig {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const userId = process.env.INSTAGRAM_USER_ID;
  if (!accessToken || !userId) {
    throw new Error(
      'Instagram not configured. Add INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_USER_ID to your environment — see docs/instagram-setup.md.'
    );
  }
  return { accessToken, userId };
}

interface GraphApiError {
  error?: { message?: string; type?: string; code?: number };
}

async function graphPost(path: string, body: Record<string, string>, accessToken: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${GRAPH_API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, access_token: accessToken }),
  });
  const json = (await res.json()) as Record<string, unknown> & GraphApiError;
  if (!res.ok || json.error) {
    throw new Error(`Instagram Graph API error (${path}): ${json.error?.message ?? res.status}`);
  }
  return json;
}

async function graphGet(path: string, accessToken: string): Promise<Record<string, unknown>> {
  const url = `${GRAPH_API_BASE}${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url);
  const json = (await res.json()) as Record<string, unknown> & GraphApiError;
  if (!res.ok || json.error) {
    throw new Error(`Instagram Graph API error (${path}): ${json.error?.message ?? res.status}`);
  }
  return json;
}

/**
 * Meta processes a media container asynchronously after creation. Polls
 * every 2s up to maxWaitMs — a pacing/bound, not a promise it always
 * finishes; a slow/stuck container throws rather than hanging the caller
 * forever, same "wait bounded, then give up loudly" philosophy as
 * lib/twelvedata/credit-budget.ts's waitForCronCreditBudget.
 */
async function waitForContainerReady(containerId: string, accessToken: string, maxWaitMs = 30_000): Promise<void> {
  const start = Date.now();
  for (;;) {
    const status = await graphGet(`/${containerId}?fields=status_code`, accessToken);
    if (status.status_code === 'FINISHED') return;
    if (status.status_code === 'ERROR') {
      throw new Error(`Instagram media container ${containerId} failed processing`);
    }
    if (Date.now() - start > maxWaitMs) {
      throw new Error(`Instagram media container ${containerId} did not finish processing within ${maxWaitMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

export interface PublishCarouselParams {
  /** Publicly fetchable image URLs, in carousel display order. */
  imageUrls: string[];
  /** Parallel to imageUrls — alt text per slide (Meta's accessibility +
   *  content-understanding field, see altTextForSlide in render/slides.tsx).
   *  Optional per-entry since not every content type supplies it yet. */
  altTexts?: (string | undefined)[];
  caption: string;
}

export interface PublishCarouselResult {
  dryRun: boolean;
  mediaId?: string;
  permalink?: string;
}

export async function publishCarousel(params: PublishCarouselParams): Promise<PublishCarouselResult> {
  if (!isInstagramConfigured()) {
    return { dryRun: true };
  }
  const { accessToken, userId } = getConfig();

  const childIds: string[] = [];
  for (let i = 0; i < params.imageUrls.length; i++) {
    const altText = params.altTexts?.[i];
    const item = await graphPost(
      `/${userId}/media`,
      {
        image_url: params.imageUrls[i],
        is_carousel_item: 'true',
        ...(altText ? { alt_text: altText } : {}),
      },
      accessToken
    );
    childIds.push(item.id as string);
  }

  const carousel = await graphPost(
    `/${userId}/media`,
    { media_type: 'CAROUSEL', children: childIds.join(','), caption: params.caption },
    accessToken
  );
  const containerId = carousel.id as string;

  await waitForContainerReady(containerId, accessToken);

  const published = await graphPost(
    `/${userId}/media_publish`,
    { creation_id: containerId },
    accessToken
  );
  const mediaId = published.id as string;

  const permalinkRes = await graphGet(`/${mediaId}?fields=permalink`, accessToken);
  const permalink = permalinkRes.permalink as string | undefined;

  return { dryRun: false, mediaId, permalink };
}
