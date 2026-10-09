/**
 * Renders every slide of real instagram_posts rows through the production
 * render route, with local code, into .playwright-mcp/ig/. For checking a
 * template change against real content before it ships. Read-only.
 *
 * npm run render-instagram-preview -- <postId> [<postId> ...]
 * npm run render-instagram-preview -- --latest   (newest post of each content type)
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
import { mkdirSync, writeFileSync } from 'fs';
import { NextRequest } from 'next/server';

async function main() {
  const { GET } = await import('../app/api/instagram/render/[postId]/[slideIndex]/route');
  const { createServerClient } = await import('../lib/supabase/client');
  const { totalSlideCount } = await import('../lib/instagram/render/slides');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServerClient() as any;

  let ids = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (process.argv.includes('--latest')) {
    const { data } = await db.from('instagram_posts').select('id, content_type').eq('status', 'published').order('created_at', { ascending: false }).limit(60);
    const seen = new Set<string>();
    ids = (data as { id: string; content_type: string }[]).filter((r) => !seen.has(r.content_type) && seen.add(r.content_type)).map((r) => r.id);
  }

  mkdirSync('.playwright-mcp/ig', { recursive: true });
  for (const id of ids) {
    const { data: post } = await db.from('instagram_posts').select('content_type, slides').eq('id', id).single();
    const n = totalSlideCount(post.slides);
    for (let i = 0; i < n; i++) {
      const res = await GET(new NextRequest(`http://local/api/instagram/render/${id}/${i}`), { params: Promise.resolve({ postId: id, slideIndex: String(i) }) });
      const file = `.playwright-mcp/ig/new-${post.content_type}-${i}.png`;
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      console.log(file, res.status);
    }
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
