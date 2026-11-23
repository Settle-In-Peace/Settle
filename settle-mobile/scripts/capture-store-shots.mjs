// Store-listing screenshot capture for settle-mobile.
//
// Renders the REAL app UI: `expo export --platform web` bundle served locally,
// driven by Playwright + Brave (owner rule — never Chrome). Authed shots are
// seeded with a reviewer login so Dashboard/Debts/Assessment/etc. render real
// data. Output PNGs land at exact store-required pixel sizes.
//
// Usage:
//   npx expo export --platform web --output-dir /tmp/settle-web-export
//   node scripts/capture-store-shots.mjs [exportDir]
//
// Env overrides:
//   SHOT_EXPORT_DIR   — bundle dir (default /tmp/settle-web-export)
//   SHOT_API          — API base (default https://api.settleinpeace.com)
//   SHOT_EMAIL/SHOT_PASS — reviewer login (default: seeded applereview@ acct)
//   SHOT_SETTLE_MS    — settle wait per shot (default 2600)
//
// Prod API CORS only allows settleinpeace.com, so api.* calls are proxied
// through this process's page.route handler (server-side fetch, no CORS).
// Session seeding mirrors src/services/session.ts AsyncStorage fallback keys.

import { chromium } from '/Volumes/Os_Sites/Prime/node_modules/playwright/index.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXPORT_DIR = process.env.SHOT_EXPORT_DIR || '/tmp/settle-web-export';
const API = (process.env.SHOT_API || 'https://api.settleinpeace.com').replace(/\/$/, '');
const EMAIL = process.env.SHOT_EMAIL || 'applereview@settleinpeace.com';
const PASS = process.env.SHOT_PASS || 'Review2026!';
const SETTLE = Number(process.env.SHOT_SETTLE_MS || 2600);
const BRAVE = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';

// Store-required pixel sizes. viewport = logical CSS px; scale → exact pixels.
// iPhone 6.7" = 1290x2796 (430x932@3x); iPhone 6.5" = 1242x2688 (414x896@3x);
// iPad 12.9" = 2048x2732 (1024x1366@2x); Play phone = 1080x2400; Play tablet
// = 1600x2560.
const DEVICES = [
  { dir: 'ios',        w: 430,  h: 932,  scale: 3, px: '1290x2796' },
  { dir: 'ios-6.5',    w: 414,  h: 896,  scale: 3, px: '1242x2688' },
  { dir: 'ipad',       w: 1024, h: 1366, scale: 2, px: '2048x2732' },
  { dir: 'play',       w: 360,  h: 800,  scale: 3, px: '1080x2400' },
  { dir: 'play-tablet',w: 800,  h: 1280, scale: 2, px: '1600x2560' },
];

// Authed screens — deep-linked via the app's linking config (App.tsx).
const AUTHED_SHOTS = [
  ['dashboard',   '/home'],
  ['debts',       '/debts'],
  ['assessment',  '/assessment'],
  ['attorneys',   '/attorneys'],
  ['coaching',    '/coaching'],
  ['learn',       '/learn'],
  ['calculators', '/calculators'],
];

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.css': 'text/css', '.map': 'application/json', '.wasm': 'application/wasm' };

function serve(dir) {
  const srv = createServer((req, res) => {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    let f = join(dir, p);
    if (!existsSync(f) || !f.startsWith(dir) || p.endsWith('/')) f = join(dir, 'index.html'); // SPA fallback
    try {
      const body = readFileSync(f);
      res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end('nf'); }
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getSession() {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  });
  const data = await res.json();
  if (!data.accessToken) throw new Error('login failed: ' + JSON.stringify(data).slice(0, 200));
  return data;
}

// Intercept api.* requests: browser CORS would block localhost origins, so
// fulfill them server-side (preflight answered with wide-open headers).
async function wireApiProxy(context) {
  const origin = new URL(API).origin;
  await context.route(`${origin}/**`, async (route) => {
    const req = route.request();
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,*',
    };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    try {
      const resp = await route.fetch({ headers: { ...req.headers(), origin: 'https://settleinpeace.com' } });
      const headers = { ...resp.headers(), ...cors };
      return route.fulfill({ response: resp, headers });
    } catch (e) {
      return route.fulfill({ status: 502, headers: cors, body: String(e).slice(0, 200) });
    }
  });
}

// Runs in the page before app JS — AsyncStorage (RNW) reads these same keys.
const seedStorage = (sess) => {
  localStorage.setItem('@settle_onboarded.v2', '1');
  localStorage.setItem('@settle_token', sess.accessToken);
  localStorage.setItem('@settle_refresh', sess.refreshToken || '');
  localStorage.setItem('@settle_user', JSON.stringify(sess.user || {}));
};

async function shot(page, file, extraWait = 0) {
  await sleep(SETTLE + extraWait);
  await page.screenshot({ path: file });
  console.log('  ->', file.split('/screenshots/')[1]);
}

async function captureDevice(browser, dev, base, session) {
  const outDir = join(ROOT, 'screenshots', dev.dir);
  mkdirSync(outDir, { recursive: true });
  console.log(`\n[${dev.dir}] ${dev.w}x${dev.h} @${dev.scale}x = ${dev.px}`);

  // --- unauth passes: onboarding panes + login + register -----------------
  const unauth = await browser.newContext({ viewport: { width: dev.w, height: dev.h }, deviceScaleFactor: dev.scale });
  await wireApiProxy(unauth);
  let page = await unauth.newPage();
  await page.goto(base + '/', { waitUntil: 'networkidle', timeout: 60000 });
  await shot(page, join(outDir, '01-onboarding.png'));
  // Pager panes — tap through "Next"/dots if the control exists.
  for (let i = 2; i <= 3; i++) {
    const btn = page.locator('text=/^next$/i').first();
    if (await btn.count().catch(() => 0)) {
      await btn.click({ timeout: 3000 }).catch(() => {});
      await shot(page, join(outDir, `0${i}-onboarding-${i}.png`));
    }
  }
  // Login / register via deep links (onboarding flag must be set first).
  await page.evaluate(() => localStorage.setItem('@settle_onboarded.v2', '1'));
  for (const [name, path] of [['login', '/login'], ['register', '/register']]) {
    await page.goto(base + path, { waitUntil: 'networkidle', timeout: 60000 });
    await shot(page, join(outDir, `0${name === 'login' ? 4 : 5}-${name}.png`));
  }
  await unauth.close();

  // --- authed pass ---------------------------------------------------------
  const ctx = await browser.newContext({ viewport: { width: dev.w, height: dev.h }, deviceScaleFactor: dev.scale });
  await wireApiProxy(ctx);
  await ctx.addInitScript(seedStorage, session);
  page = await ctx.newPage();
  let n = 5;
  for (const [name, path] of AUTHED_SHOTS) {
    n += 1;
    try {
      await page.goto(base + path, { waitUntil: 'networkidle', timeout: 60000 });
      await shot(page, join(outDir, `${String(n).padStart(2, '0')}-${name}.png`), 800);
    } catch (e) { console.log(`  FAIL ${name}: ${e.message.slice(0, 100)}`); }
  }
  await ctx.close();
}

async function main() {
  if (!existsSync(join(EXPORT_DIR, 'index.html'))) {
    console.error(`No web export at ${EXPORT_DIR} — run: npx expo export --platform web --output-dir ${EXPORT_DIR}`);
    process.exit(1);
  }
  const srv = await serve(EXPORT_DIR);
  const base = `http://127.0.0.1:${srv.address().port}`;
  console.log('serving', EXPORT_DIR, 'at', base);

  const session = await getSession().catch((e) => { console.log('login failed, authed shots will be empty:', e.message); return null; });
  const browser = await chromium.launch({ executablePath: BRAVE });
  try {
    for (const dev of DEVICES) {
      await captureDevice(browser, dev, base, session || {});
    }
  } finally {
    await browser.close();
    srv.close();
  }
  console.log('\ndone ->', join(ROOT, 'screenshots'));
}

main();
