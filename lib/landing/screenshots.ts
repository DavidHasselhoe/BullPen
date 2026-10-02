import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Which landing-page screenshots actually exist on disk.
 *
 * Resolved on the server at render time rather than probed from the browser.
 * An earlier version fetched each candidate with `fetch(..., {method:'HEAD'})`
 * from the client and kept the ones that returned ok — which worked, but the
 * browser logs a console 404 for every miss before JavaScript ever sees the
 * response, so a page with no screenshots yet threw five red errors into
 * devtools and into any error-reporting tool watching the console. Checking the
 * filesystem server-side has neither problem and costs nothing at runtime.
 */

export interface Shot {
  id: string;
  label: string;
  /** Route shown in the mock browser chrome. */
  url: string;
  /** File under /public/screenshots. */
  file: string;
  alt: string;
}

/**
 * Every screenshot the landing page's app tour knows how to display.
 *
 * Whole-screen captures, cropped below the app navigation. The cropped
 * single-moment captures belong to `Benefits.tsx` and are not repeated here, so
 * no capture appears in both sections.
 */
export const CANDIDATE_SHOTS: Shot[] = [
  {
    id: 'stock',
    label: 'Stock page',
    url: '/stock/NVDA',
    file: 'tour-stock.png',
    alt: "NVIDIA's BullPen stock page: the price, today's move and a six-month chart",
  },
  {
    id: 'discover',
    label: 'Discover',
    url: '/discover',
    file: 'tour-discover.png',
    alt: "BullPen Discover: Bull's Weekly Pick and the market pulse for the major indexes",
  },
  {
    id: 'screener',
    label: 'Screener',
    url: '/tools/screener',
    file: 'tour-screener.png',
    alt: 'The BullPen stock screener listing S&P 500 companies with health scores, price and valuation',
  },
  {
    id: 'holdings',
    label: 'Holdings',
    url: '/holdings',
    file: 'tour-holdings.png',
    alt: "A portfolio on BullPen's Holdings page: total value, today's gain, and each position",
  },
];

/**
 * Server-only. Returns the subset of CANDIDATE_SHOTS whose file is present, in
 * declared order — so screenshots can be added one at a time and the section
 * simply grows. Returns an empty array when none exist, which the gallery
 * treats as "render nothing".
 */
export function getAvailableShots(): Shot[] {
  const dir = path.join(process.cwd(), 'public', 'screenshots');
  return CANDIDATE_SHOTS.filter((s) => existsSync(path.join(dir, s.file)));
}
