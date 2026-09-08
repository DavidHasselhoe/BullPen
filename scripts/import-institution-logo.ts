/**
 * Store a fund logo from a local image file, for the funds logo.dev has
 * nothing usable for.
 *
 * Usage:
 *   npx tsx scripts/import-institution-logo.ts --slug=<fund> --file=<path> [--trim] [--dry-run]
 *
 * Companion to backfill-institution-logos.ts, which resolves logos by domain
 * from logo.dev. That covers the funds with an ordinary web presence; several
 * of these are private partnerships whose mark logo.dev simply does not have,
 * so the file arrives by hand instead. Same bucket, same fund- prefix, same
 * resulting logo_url, so nothing downstream can tell the two apart.
 *
 * --trim removes a uniform border before squaring the image. Use it only for
 * a mark floating in whitespace: on a full-bleed logo (a white wordmark on a
 * navy square) trimming crops away the background that IS the logo.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { createServerClient } from '../lib/supabase/client';
import { uploadLogoToStorage } from '../lib/logos/logos-storage';

/** Square canvas the avatar samples down from. The chip renders at 40px, so
 *  this is 6x headroom for retina without storing a needlessly large file. */
const OUTPUT_SIZE = 256;

/** Matches backfill-institution-logos.ts so a fund can never collide with a
 *  ticker's object in the shared bucket. */
const STORAGE_PREFIX = 'fund-';

function flag(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : '';
}

async function main() {
  const slug = flag('slug');
  const file = flag('file');
  const doTrim = flag('trim') !== undefined;
  const dryRun = flag('dry-run') !== undefined;

  if (!slug || !file) {
    console.error('Usage: --slug=<fund> --file=<path> [--trim] [--dry-run]');
    process.exit(1);
  }

  const supabase = createServerClient();
  const { data: investor } = await supabase
    .from('institutional_investors')
    .select('id, slug, display_name')
    .eq('slug', slug)
    .maybeSingle<{ id: string; slug: string; display_name: string }>();

  if (!investor) {
    console.error(`No fund with slug "${slug}".`);
    process.exit(1);
  }

  const source = await readFile(file);

  // Flatten onto white before anything else: FundAvatar sits these on a white
  // chip, so a transparent mark should be composited against the same white it
  // will actually be seen on, not left to the renderer.
  let pipeline = sharp(source).flatten({ background: '#ffffff' });
  if (doTrim) pipeline = pipeline.trim();

  const output = await pipeline
    .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: 'contain', background: '#ffffff' })
    .png()
    .toBuffer();

  // Shape check, and it only means something for a mark floating on white.
  //
  // A full-bleed logo (white wordmark on a navy square) fills its whole tile,
  // so it reads at 40px as a coloured chip exactly the way the brand's own
  // avatar does, however wide the lettering inside it happens to be. Measuring
  // the trimmed content there measures the lettering, not the logo, and would
  // condemn a perfectly good mark. So: decide full-bleed first, from whether
  // the corner is white, and only judge aspect when it isn't.
  const { data: corner } = await sharp(output)
    .extract({ left: 0, top: 0, width: 8, height: 8 })
    .stats()
    .then((s) => ({ data: s.channels.map((c) => c.mean) }));
  const fullBleed = corner.slice(0, 3).some((mean) => mean < 240);

  const trimmed = await sharp(output).trim().toBuffer({ resolveWithObject: true });
  const aspect = trimmed.info.width / trimmed.info.height;

  console.log(`${investor.display_name}`);
  console.log(`  source     ${file}`);
  console.log(
    `  shape      ${fullBleed ? 'full-bleed tile' : `mark on white, ${trimmed.info.width}x${trimmed.info.height} (aspect ${aspect.toFixed(2)})`}`
  );
  if (!fullBleed && aspect > 2.2) {
    console.log(`  WARNING    wide wordmark on white; likely illegible at 40px next to the initials it replaces`);
  }

  if (dryRun) {
    console.log('  dry run, nothing written');
    return;
  }

  const upload = await uploadLogoToStorage(`${STORAGE_PREFIX}${slug}`, output, 'image/png');
  if (!upload.success || !upload.publicUrl) {
    console.error(`  upload failed: ${upload.error}`);
    process.exit(1);
  }

  const { error } = await supabase
    .from('institutional_investors')
    .update({ logo_url: upload.publicUrl } as never)
    .eq('id', investor.id);

  if (error) {
    console.error(`  logo_url update failed: ${error.message}`);
    process.exit(1);
  }

  console.log(`  stored     ${upload.publicUrl}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
