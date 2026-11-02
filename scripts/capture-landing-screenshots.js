/**
 * Re-takes the landing page's bento captures (public/screenshots/bento-*.png).
 *
 * Run through the Playwright MCP's run_code tool, not node: it is invoked with
 * the MCP's `page`, opens its own contexts, and needs a signed-in storage state
 * for the QA account (see public/screenshots/README.md for setting the account
 * up: light theme, beginner mode, free plan).
 *
 * Each shot is taken twice from the app's own responsive layout, so neither is
 * a shrunken desktop screen: `*.png` at a 600px viewport and 2x for the
 * two-column desktop bento, `*-m.png` at 360px and 3x for phones.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- run_code evaluates this expression
async (page) => {
  // A storage state saved after signing the QA account in (context.storageState).
  const STATE = 'C:/Users/david/AppData/Local/Temp/claude/C--bullpen/8d18f647-cb60-4112-b8ca-8422ad1b3430/scratchpad/qa-state.json';
  const OUT = 'C:/bullpen/public/screenshots/';
  const HIDE = 'nextjs-portal, button[title="Ask Bull"], [aria-label="Cookie consent"], .fixed.bottom-4, nav.fixed.bottom-0 { display: none !important; }'
    + ' *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }';

  // `find` runs in the page and returns the element to shoot.
  const SHOTS = [
    { file: 'bento-plain-english', url: '/stock/NVDA', find: () => document.querySelector('#nav-statistics') },
    { file: 'bento-health', url: '/stock/NVDA', find: () => document.querySelector('#nav-health') },
    {
      file: 'bento-watchlist', url: '/watchlist',
      find: () => [...document.querySelectorAll('div')].find((d) => d.childElementCount === 0 && d.textContent.trim() === 'Average move today')?.closest('section'),
    },
    { file: 'bento-economy', url: '/tools/economy', find: () => document.querySelector('ul.grid') },
    {
      file: 'bento-academy', url: '/academy',
      find: () => [...document.querySelectorAll('p')].find((d) => d.textContent.trim() === 'Daily Challenge')?.closest('.rounded-2xl'),
    },
    {
      file: 'bento-daily-brief', url: '/dashboard',
      find: () => [...document.querySelectorAll('h2')].find((d) => d.textContent.trim() === 'Daily brief')?.closest('section'),
    },
  ];

  const browser = page.context().browser();
  const done = [];
  for (const [suffix, width, scale] of [['', 600, 2], ['-m', 360, 3]]) {
    const ctx = await browser.newContext({ deviceScaleFactor: scale, viewport: { width, height: 1400 }, storageState: STATE });
    const p = await ctx.newPage();
    for (const s of SHOTS) {
      await p.goto('http://localhost:3000' + s.url, { waitUntil: 'networkidle', timeout: 120000 }).catch(() => {});
      await p.addStyleTag({ content: HIDE });
      // Live data and logos settle after networkidle on the heavier pages.
      let el = null;
      for (let tries = 0; tries < 4 && !el; tries++) {
        await p.waitForTimeout(4000);
        // A late client-side redirect can swap the page under the query; just try again.
        el = await p.evaluateHandle(s.find).then((h) => h.asElement(), () => null);
      }
      if (!el) { done.push(`${s.file}${suffix}: not found`); continue; }
      await el.scrollIntoViewIfNeeded();
      await p.waitForTimeout(500);
      await el.screenshot({ path: `${OUT}${s.file}${suffix}.png` });
      const box = await el.boundingBox();
      done.push(`${s.file}${suffix}: ${Math.round(box.width)}x${Math.round(box.height)} css`);
    }
    await ctx.close();
  }
  return done;
}
