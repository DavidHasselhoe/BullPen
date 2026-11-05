/**
 * Fits every stored logo's mark inside the circle the app shows it in
 * (lib/logos/fit-logo-to-circle.ts). New uploads already go through it; this
 * catches up the logos stored before 2026-11-05. Each original is saved to
 * .playwright-mcp/logo-backup/ (gitignored) before it is overwritten.
 *
 * npx tsx scripts/fit-logos-to-circle.ts --dry-run      count, write nothing
 * npx tsx scripts/fit-logos-to-circle.ts --only=aapl.jpg,mu.jpg
 * npx tsx scripts/fit-logos-to-circle.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'fs';

const BUCKET = 'company-logos';
const BACKUP = '.playwright-mcp/logo-backup';

async function selfCheck(fit: typeof import('../lib/logos/fit-logo-to-circle').fitLogoToCircle) {
  const sharp = (await import('sharp')).default;
  // A wordmark bar drawn edge to edge on white (IDEXX) loses its ends to the circle: it must shrink.
  const edge = await sharp({ create: { width: 100, height: 30, channels: 3, background: '#000' } })
    .extend({ top: 37, bottom: 37, left: 2, right: 2, background: '#fff' }).jpeg().toBuffer();
  assert.ok(await fit(edge, 'image/jpeg'), 'edge-to-edge mark is fitted');
  // A full-bleed colour logo is left alone, so is a disc logo on white (Arm).
  const bleed = await sharp({ create: { width: 104, height: 104, channels: 3, background: '#ff385c' } }).png().toBuffer();
  assert.equal(await fit(bleed, 'image/png'), null, 'full-bleed colour untouched');
  const disc = await sharp(Buffer.from('<svg width="104" height="104"><rect width="104" height="104" fill="#fff"/><circle cx="52" cy="52" r="52" fill="#0092bb"/></svg>')).png().toBuffer();
  assert.equal(await fit(disc, 'image/png'), null, 'disc logo untouched');
  // A small mark already inside the circle is left alone.
  const small = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#000' } })
    .extend({ top: 32, bottom: 32, left: 32, right: 32, background: '#fff' }).png().toBuffer();
  assert.equal(await fit(small, 'image/png'), null, 'mark inside the circle untouched');
}

async function main() {
  const { fitLogoToCircle } = await import('../lib/logos/fit-logo-to-circle');
  const { createServerClient } = await import('../lib/supabase/client');
  await selfCheck(fitLogoToCircle);

  const dry = process.argv.includes('--dry-run');
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
  const db = createServerClient();

  let names: string[] = [];
  if (only) names = only;
  else {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db.storage.from(BUCKET).list('', { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
      if (error) throw error;
      names.push(...data.map((f) => f.name));
      if (data.length < 1000) break;
    }
  }
  names = names.filter((n) => /\.(png|jpe?g)$/i.test(n));
  mkdirSync(BACKUP, { recursive: true });

  let changed = 0;
  let failed = 0;
  // 8 at a time: one by one took ~15 minutes over the ~4,000-file bucket.
  const queue = [...names];
  const worker = async () => { for (let name = queue.shift(); name; name = queue.shift()) await one(name); };
  await Promise.all(Array.from({ length: 8 }, worker));
  console.log(`${dry ? 'dry run: ' : ''}${changed} of ${names.length} logos ${dry ? 'need' : 'got'} fitting, ${failed} failed`);

  async function one(name: string) {
    try {
      const { data, error } = await db.storage.from(BUCKET).download(name);
      if (error || !data) throw error ?? new Error('empty download');
      const buf = Buffer.from(await data.arrayBuffer());
      const mime = /png$/i.test(name) ? 'image/png' : 'image/jpeg';
      const out = await fitLogoToCircle(buf, mime);
      if (!out) return;
      changed++;
      if (dry) { console.log(`would fit ${name}`); return; }
      writeFileSync(`${BACKUP}/${name}`, buf);
      const up = await db.storage.from(BUCKET).upload(name, out, { contentType: mime, upsert: true, cacheControl: 'public, max-age=31536000' });
      if (up.error) throw up.error;
      console.log(`fitted ${name}`);
    } catch (e) {
      failed++;
      console.warn(`skip ${name}: ${e instanceof Error ? e.message : e}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
