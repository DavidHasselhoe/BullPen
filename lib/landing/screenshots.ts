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

/** Every screenshot the landing page knows how to display. */
export const CANDIDATE_SHOTS: Shot[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    url: '/dashboard',
    file: 'dashboard.png',
    alt: 'The BullPen dashboard, showing the daily brief, market context and portfolio summary',
  },
  {
    id: 'stock',
    label: 'Stock detail',
    url: '/stock/AAPL',
    file: 'stock-detail.png',
    alt: 'A BullPen stock page, showing the price chart, health score and key statistics',
  },
  {
    id: 'ai',
    label: 'BullPen AI',
    url: '/tools/ai-chat',
    file: 'ai-chat.png',
    alt: 'The BullPen AI assistant answering a question about a company with cited sources',
  },
  {
    id: 'screener',
    label: 'Screener',
    url: '/tools/screener',
    file: 'screener.png',
    alt: 'The BullPen stock screener with filters applied and matching companies listed',
  },
  {
    id: 'holdings',
    label: 'Holdings',
    url: '/holdings',
    file: 'holdings.png',
    alt: 'The BullPen holdings page, showing positions, allocation and profit and loss',
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
