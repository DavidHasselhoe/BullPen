/**
 * Fetches a real logo for each tracked 13F fund from logo.dev, stores it in
 * the same `company-logos` bucket the stock logos use, and writes the public
 * URL onto institutional_investors.logo_url.
 *
 * Usage: npx tsx scripts/backfill-institution-logos.ts [--force]
 *
 * These funds are private partnerships with no ticker, so logo.dev's
 * /ticker/ lookup can never resolve them — this goes through the domain
 * endpoint instead. We hold a publishable (pk_) LOGO_DEV_KEY, which can fetch
 * images but not call the brand-search API, so the domain per fund is curated
 * here rather than looked up. Candidates are tried in order and validated by
 * actually downloading the image (fallback=404 means a wrong guess 404s rather
 * than returning a monogram placeholder we'd store as if it were real), so a
 * wrong first guess costs nothing but a request.
 *
 * Re-runnable: skips funds that already have a logo_url unless --force.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import sharp from 'sharp';
import { createServerClient } from '../lib/supabase/client';
import { resolveFromLogoDevDomain } from '../lib/logos/resolve-logo';
import { uploadLogoToStorage } from '../lib/logos/logos-storage';

/**
 * Widest content box we'll still show inside a ~40px avatar. Plenty of these
 * funds' logos are pure wordmarks ("The Baupost Group" set across a 256px
 * square, occupying about a sixth of its height): scaled into a small avatar
 * that renders as an illegible smudge, strictly worse than the initials it
 * would replace. Icons and monograms are roughly square and survive fine.
 */
const MAX_CONTENT_ASPECT = 2.2;

/**
 * True when the image's actual ink (after trimming uniform borders) is far
 * wider than it is tall — i.e. a wordmark rather than an icon.
 */
async function isWordmark(buffer: Buffer): Promise<boolean> {
  try {
    const trimmed = await sharp(buffer).trim().toBuffer({ resolveWithObject: true });
    const { width, height } = trimmed.info;
    if (!width || !height) return false;
    return width / height > MAX_CONTENT_ASPECT;
  } catch {
    // Undecodable or already tight — don't block the logo on a failed measure.
    return false;
  }
}

/**
 * Candidate domains per fund slug, best guess first. Multiple entries where
 * the fund's public site isn't the obvious name (Renaissance trades as
 * rentec.com, Duquesne's family office is a different domain from the old
 * Duquesne Capital, and so on).
 */
const FUND_DOMAINS: Record<string, string[]> = {
  'berkshire-hathaway': ['berkshirehathaway.com'],
  bridgewater: ['bridgewater.com'],
  'citadel-advisors': ['citadel.com'],
  'renaissance-tech': ['rentec.com', 'renaissance.com'],
  'ark-invest': ['ark-invest.com', 'ark-funds.com'],
  'pershing-square': ['pershingsquareholdings.com', 'pershingsquare.com'],
  'baupost-group': ['baupost.com'],
  'third-point': ['thirdpoint.com'],
  'tiger-global': ['tigerglobal.com'],
  'soros-fund-mgmt': ['soros.com', 'sorosfundmgmt.com'],
  'coatue-management': ['coatue.com'],
  'viking-global': ['vikingglobal.com'],
  'lone-pine-capital': ['lonepinecapital.com'],
  'duquesne-family': ['duquesne.com', 'duquesnefamilyoffice.com'],
  // If Appaloosa is ever re-added (see migration 130), note that it has
  // essentially no web presence and logo.dev has nothing for
  // appaloosamanagement.com or appaloosalp.com. Do NOT "fix" that with
  // appaloosa.com or tepper.com: both return a real image, and both are
  // somebody else (appaloosa.com is the Appaloosa Horse Club, verified
  // 2026-09-07). The initials avatar is the correct outcome.
};

/** Storage key prefix, so a fund can never collide with a ticker's object. */
const STORAGE_PREFIX = 'fund-';

interface InvestorRow {
  id: string;
  slug: string;
  display_name: string;
  logo_url: string | null;
}

async function main() {
  const force = process.argv.includes('--force');
  if (!process.env.LOGO_DEV_KEY) {
    console.error('LOGO_DEV_KEY is not set in .env.local — nothing to fetch with.');
    process.exit(1);
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('institutional_investors')
    .select('id, slug, display_name, logo_url')
    .order('sort_order');

  if (error || !data) {
    console.error('Could not load institutional_investors:', error?.message);
    process.exit(1);
  }

  const investors = data as InvestorRow[];
  const results: { slug: string; status: string; detail?: string }[] = [];

  for (const investor of investors) {
    if (investor.logo_url && !force) {
      results.push({ slug: investor.slug, status: 'skipped (already has logo)' });
      continue;
    }

    const domains = FUND_DOMAINS[investor.slug];
    if (!domains) {
      results.push({ slug: investor.slug, status: 'no domain mapped' });
      continue;
    }

    let stored: string | null = null;
    let usedDomain: string | null = null;

    for (const domain of domains) {
      const image = await resolveFromLogoDevDomain(domain);
      if (!image) continue;

      if (await isWordmark(image.buffer)) {
        results.push({
          slug: investor.slug,
          status: 'skipped (wordmark)',
          detail: `${domain} — too wide to read at avatar size`,
        });
        break;
      }

      const upload = await uploadLogoToStorage(
        `${STORAGE_PREFIX}${investor.slug}`,
        image.buffer,
        image.mimeType
      );
      if (!upload.success || !upload.publicUrl) {
        results.push({ slug: investor.slug, status: 'upload failed', detail: upload.error });
        break;
      }
      stored = upload.publicUrl;
      usedDomain = domain;
      break;
    }

    if (!stored) {
      if (!results.some((r) => r.slug === investor.slug)) {
        results.push({ slug: investor.slug, status: 'not found', detail: domains.join(', ') });
      }
      // On a re-run, a fund that no longer qualifies (now judged a wordmark, or
      // whose domain stopped resolving) has to lose its stored logo too, or it
      // keeps rendering the image this run just decided against.
      if (force && investor.logo_url) {
        await supabase.from('institutional_investors').update({ logo_url: null } as never).eq('id', investor.id);
      }
      continue;
    }

    const { error: updateError } = await supabase
      .from('institutional_investors')
      .update({ logo_url: stored } as never)
      .eq('id', investor.id);

    results.push({
      slug: investor.slug,
      status: updateError ? 'db update failed' : 'ok',
      detail: updateError ? updateError.message : (usedDomain ?? undefined),
    });
  }

  console.log('\nInstitution logo backfill\n');
  for (const r of results) {
    console.log(`  ${r.status.padEnd(28)} ${r.slug}${r.detail ? `  (${r.detail})` : ''}`);
  }
  const ok = results.filter((r) => r.status === 'ok').length;
  console.log(`\n${ok}/${investors.length} resolved.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
