/**
 * Two-phase smoke test for settleinpeace.settleinpeace.workers.dev.
 *
 *   pnpm smoke                              # tests https://settleinpeace.settleinpeace.workers.dev
 *   SMOKE_BASE=http://localhost:3025 pnpm smoke   # local dev server
 *
 * Phase 1 — Node fetch: HTTP status for every public route (cheap, can't
 *           trip the edge's per-client request budget).
 * Phase 2 — Playwright (system Chrome): real browser loads core routes and
 *           reports pageerrors + console errors. Small route set on purpose —
 *           edge rate-limits ~100+ requests/client and each page pulls ~15
 *           JS chunks.
 *
 * Writes settle-web/.errors/smoke.json for agent self-diagnosis.
 * Uses playwright-core + system Chrome — no browser download needed.
 */

import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ERRORS_DIR = join(ROOT, 'settle-web', '.errors');
mkdirSync(ERRORS_DIR, { recursive: true });

const BASE = process.env.SMOKE_BASE || 'https://settleinpeace.settleinpeace.workers.dev';
const TIMEOUT = 30000;

const STATUS_ROUTES = [
  '/',
  '/login',
  '/register',
  '/assessment',
  '/calculators',
  '/coaching',
  '/compare',
  '/dashboard',
  '/debts',
  '/learn',
  '/providers',
  '/settlement',
  '/privacy',
  '/terms',
  '/disclosures',
];

const BROWSER_ROUTES = ['/', '/login', '/assessment', '/calculators', '/debts'];

let failures = 0;

console.log('Phase 1 — HTTP status checks');
const statusResults = [];
for (const route of STATUS_ROUTES) {
  let status = null;
  let error = null;
  try {
    const res = await fetch(BASE + route, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT),
    });
    status = res.status;
  } catch (e) {
    error = e.message;
  }
  const ok = status >= 200 && status < 400;
  if (!ok) failures++;
  statusResults.push({ route, status, ok, error });
  console.log(`${ok ? '✓' : '✗'} ${route} [${status ?? error}]`);
  await new Promise((r) => setTimeout(r, 300));
}

console.log('\nPhase 2 — browser console/pageerror check (system Chrome)');
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--disable-blink-features=AutomationControlled'],
});
const browserResults = [];
try {
  const ctx = await browser.newContext({
    serviceWorkers: 'block',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  await ctx.route(/\.(png|jpe?g|gif|webp|svg|ico|woff2?|ttf|mp4|webm|css)(\?|$)/i, (r) => r.abort());

  for (const route of BROWSER_ROUTES) {
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => {
      // next-pwa-style registration scripts crash when SWs are blocked —
      // artifact of serviceWorkers:'block', not a site defect.
      if (e.message.includes("'waiting'")) return;
      errors.push(`pageerror: ${e.message}`);
    });
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const text = m.text();
      if (/Failed to load resource|net::ERR_/.test(text)) return;
      errors.push(`console: ${text}`);
    });
    let status = null;
    let loadError = null;
    try {
      const res = await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
      status = res?.status();
      await page.waitForTimeout(1500);
    } catch (e) {
      loadError = e.message.split('\n')[0];
    }
    if (status === 503 || (loadError && status === null)) {
      await page.waitForTimeout(10000);
      errors.length = 0;
      loadError = null;
      try {
        const res = await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
        status = res?.status();
        await page.waitForTimeout(1500);
      } catch (e) {
        loadError = e.message.split('\n')[0];
      }
    }
    const ok = status >= 200 && status < 400 && !loadError;
    if (!ok || errors.length) failures++;
    browserResults.push({ route, status, ok, loadError, errors });
    console.log(`${ok ? '✓' : '✗'} ${route} [${status ?? loadError}]${errors.length ? ` — ${errors.length} js error(s)` : ''}`);
    await page.close();
    await new Promise((r) => setTimeout(r, 2500));
  }
} finally {
  await browser.close();
}

const report = {
  base: BASE,
  timestamp: new Date().toISOString(),
  failures,
  statusResults,
  browserResults,
};
writeFileSync(join(ERRORS_DIR, 'smoke.json'), JSON.stringify(report, null, 2));
console.log(`\n${failures === 0 ? '✅' : '❌'} ${failures} issue(s) — ${ERRORS_DIR}/smoke.json`);
process.exit(failures === 0 ? 0 : 1);
