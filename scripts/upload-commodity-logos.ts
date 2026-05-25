/**
 * Upload commodity logos to the `company-logos` Supabase Storage bucket.
 *
 * Source SVGs live in scripts/commodity-logos/. Run once per design change:
 *   npx tsx scripts/upload-commodity-logos.ts
 *
 * Idempotent — uses upsert so re-runs simply overwrite.
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(url, key);
const BUCKET = 'company-logos';

const LOGOS: Array<{ filename: string; localPath: string; label: string }> = [
  { filename: 'commodity-xau.svg', localPath: 'scripts/commodity-logos/xau.svg', label: 'Gold (XAU)' },
  { filename: 'commodity-xag.svg', localPath: 'scripts/commodity-logos/xag.svg', label: 'Silver (XAG)' },
  { filename: 'commodity-xpt.svg', localPath: 'scripts/commodity-logos/xpt.svg', label: 'Platinum (XPT)' },
  { filename: 'commodity-xpd.svg', localPath: 'scripts/commodity-logos/xpd.svg', label: 'Palladium (XPD)' },
  { filename: 'commodity-wti.svg', localPath: 'scripts/commodity-logos/wti.svg', label: 'Crude Oil WTI' },
  { filename: 'commodity-xbr.svg', localPath: 'scripts/commodity-logos/xbr.svg', label: 'Brent Crude (XBR)' },
];

async function uploadAll() {
  console.log(`Uploading ${LOGOS.length} commodity logos to '${BUCKET}'...\n`);

  let ok = 0;
  let fail = 0;

  for (const logo of LOGOS) {
    const filePath = resolve(process.cwd(), logo.localPath);
    let svg: Buffer;
    try {
      svg = readFileSync(filePath);
    } catch (err) {
      console.error(`✗ ${logo.label}: cannot read ${filePath} —`, err instanceof Error ? err.message : err);
      fail++;
      continue;
    }

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(logo.filename, svg, {
        contentType: 'image/svg+xml',
        cacheControl: '604800', // 1 week — these are static
        upsert: true,
      });

    if (error) {
      console.error(`✗ ${logo.label}: ${error.message}`);
      fail++;
    } else {
      const publicUrl = `${url}/storage/v1/object/public/${BUCKET}/${logo.filename}`;
      console.log(`✓ ${logo.label.padEnd(20)} → ${publicUrl}`);
      ok++;
    }
  }

  console.log(`\nDone — ${ok} uploaded, ${fail} failed.`);
  process.exit(fail === 0 ? 0 : 1);
}

uploadAll();
