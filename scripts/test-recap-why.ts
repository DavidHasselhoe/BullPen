/**
 * Pro recap why: the recap message format createPortfolioRecapNotification
 * writes, read back by the morning email (recapLine), and the free cue.
 * Run: npx tsx scripts/test-recap-why.ts
 */
import { recapLine, recapProCue, buildAlertEmailHtml } from '../lib/email/alert-email';

const assert = (ok: unknown, msg: string) => { if (!ok) throw new Error(msg); };
const title = 'Your portfolio -1.24% today';
const why = 'Nvidia fell after the company guided revenue below hopes. Chip peers slid too.';

const pro = recapLine({ title, message: `8 holdings · NVDA -4.1% led. ${why}` });
assert(pro?.why === why, `pro why: ${pro?.why}`);
assert(pro?.rest === 'NVDA moved most, down 4.1%.', `pro rest: ${pro?.rest}`);
assert(recapProCue(pro, false) === null, 'no cue when the why is there');

const free = recapLine({ title, message: '8 holdings · NVDA -4.1% led' });
assert(free?.why === null && free.top?.pct === -4.1, 'free parse');
assert(recapProCue(free, false) === 'Pro tells you why NVDA moved', 'free cue');
assert(recapProCue(free, true) === null, 'Pro without a why gets no cue');
assert(recapProCue(recapLine({ title, message: '3 holdings · KO +0.6% led' }), false) === null, 'small move gets no cue');

const html = buildAlertEmailHtml([], { first: false, joinedBeforeLaunch: false, recap: pro });
assert(html.includes(why), 'why in email');
const cueHtml = buildAlertEmailHtml([], { first: false, joinedBeforeLaunch: false, recap: free, proCue: recapProCue(free, false) });
assert(cueHtml.includes('/upgrade?from=email_recap_why') && !cueHtml.includes(why), 'cue in free email');
console.log('recap why ok');
