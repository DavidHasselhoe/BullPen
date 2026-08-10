/**
 * Guards the "every cron route has a scheduler, every scheduler points at a
 * real route" invariant.
 *
 * Run: npm run test-cron-coverage
 *
 * Background: a 2026-08-10 audit found the app's scheduled-work docs
 * (CLAUDE.md) had drifted from reality (a cron the docs still called a
 * Vercel cron had actually moved to GitHub Actions months earlier, and 4 of
 * 11 workflows weren't documented at all). The routes themselves were fine —
 * nothing was actually orphaned — but nothing would have caught it if one
 * had been. This script encodes that check directly against the source
 * files (vercel.json, .github/workflows/*.yml, app/api/cron/*), so a route
 * added without a scheduler, or a scheduler pointing at a renamed/deleted
 * route, fails here instead of silently never firing (or firing 401s).
 *
 * Parsed rather than imported, same reasoning as test-credit-budget.ts: the
 * route modules pull in Next.js server-only dependencies that can't load in
 * a bare tsx process, and vercel.json / the workflow YAML are trivially
 * regex-able without a YAML parser dependency.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

let failures = 0;

function check(label: string, ok: boolean, detail: string) {
  if (ok) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.error(`  FAIL  ${label}\n        ${detail}`);
  }
}

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

// ── Discover real cron routes ────────────────────────────────────────────────
// app/api/cron/<slug>/route.ts -> /api/cron/<slug>
const CRON_DIR = join(ROOT, 'app', 'api', 'cron');
const cronSlugs = readdirSync(CRON_DIR).filter((name) =>
  statSync(join(CRON_DIR, name)).isDirectory()
);
const cronRoutes = cronSlugs.map((slug) => `/api/cron/${slug}`);

// Other CRON_SECRET-gated endpoints outside app/api/cron/ that workflows call
// directly (the screener refresh/seed pipeline). Verified to exist below the
// same way, just listed explicitly since they don't share the /api/cron/
// folder convention.
const OTHER_SCHEDULED_ROUTES = [
  { path: '/api/screener/refresh', file: join(ROOT, 'app', 'api', 'screener', 'refresh', 'route.ts') },
  { path: '/api/screener/seed-universe', file: join(ROOT, 'app', 'api', 'screener', 'seed-universe', 'route.ts') },
];

// ── Discover schedulers ──────────────────────────────────────────────────────
const vercelJson = JSON.parse(read('vercel.json')) as { crons?: { path: string; schedule: string }[] };
const vercelCronPaths = new Set((vercelJson.crons ?? []).map((c) => c.path));

const WORKFLOWS_DIR = join(ROOT, '.github', 'workflows');
const workflowFiles = readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith('.yml'));

// Every /api/... path referenced anywhere in a workflow file, plus whether
// that same file actually has a `schedule:` trigger (vs. workflow_dispatch-only,
// which doesn't count as "this route has a working scheduler").
const referencedByScheduledWorkflow = new Set<string>();
const referencedByAnyWorkflow = new Set<string>();

for (const file of workflowFiles) {
  const src = read(join('.github', 'workflows', file));
  const hasSchedule = /^\s*schedule:\s*$/m.test(src);
  const pathMatches = src.matchAll(/\/api\/[a-zA-Z0-9/_-]+/g);
  for (const m of pathMatches) {
    // Strip any trailing query string or quote/paren picked up by the regex.
    const p = m[0].replace(/["'?].*$/, '');
    referencedByAnyWorkflow.add(p);
    if (hasSchedule) referencedByScheduledWorkflow.add(p);
  }
}

const allScheduledPaths = new Set([...vercelCronPaths, ...referencedByScheduledWorkflow]);

// ── 1. Every cron route has a real scheduler (Vercel cron or a workflow with `schedule:`) ──
console.log('Every app/api/cron/* route has a scheduler:');
for (const route of cronRoutes) {
  check(
    route,
    allScheduledPaths.has(route),
    `no vercel.json cron and no .github/workflows/*.yml with a \`schedule:\` trigger calls ${route}. ` +
      `Either wire it up or delete the route if it's genuinely unused.`
  );
}

// ── 2. Every vercel.json cron path resolves to a real route file ────────────
console.log('\nEvery vercel.json cron path has a matching route file:');
for (const path of vercelCronPaths) {
  const slug = path.replace('/api/cron/', '');
  const file = join(CRON_DIR, slug, 'route.ts');
  check(
    path,
    cronSlugs.includes(slug),
    `vercel.json schedules ${path} but ${file} doesn't exist — renamed or deleted route left ` +
      `behind in the cron config.`
  );
}

// ── 3. Every /api/cron/* path referenced by a workflow resolves to a real route ──
console.log('\nEvery workflow-referenced /api/cron/* path has a matching route file:');
const referencedCronPaths = [...referencedByAnyWorkflow].filter((p) => p.startsWith('/api/cron/'));
for (const path of referencedCronPaths) {
  const slug = path.replace('/api/cron/', '');
  check(
    path,
    cronSlugs.includes(slug),
    `a workflow calls ${path} but app/api/cron/${slug}/route.ts doesn't exist — stale reference ` +
      `(possibly a typo, or the route was renamed without updating the workflow).`
  );
}

// ── 4. The screener refresh/seed routes referenced by workflows still exist ──
console.log('\nOther workflow-referenced scheduled routes exist:');
for (const { path, file } of OTHER_SCHEDULED_ROUTES) {
  const referenced = referencedByAnyWorkflow.has(path);
  check(
    `${path}${referenced ? '' : ' (not referenced by any workflow — skipping existence check)'}`,
    !referenced || (() => { try { statSync(file); return true; } catch { return false; } })(),
    `a workflow calls ${path} but ${file} doesn't exist.`
  );
}

console.log('');
if (failures > 0) {
  console.error(`${failures} check(s) failed.\n`);
  process.exit(1);
}
console.log('All cron-coverage invariants hold.\n');
