#!/usr/bin/env node
/**
 * Records the Settle In Peace consumer enrollment journey for MFSN's
 * production-API branding review. Drives Brave (project rule) on a FRESH temp
 * profile — no personal extensions/data in the recording — and writes a WebM
 * under ./out/, plus an mp4 if ffmpeg is available.
 *
 * Usage: node record-flow.mjs [--base https://settleinpeace.com]
 */
import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.argv.find((a) => a.startsWith('--base='))?.split('=')[1]
  || 'https://settleinpeace.com';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');
const BRAVE = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const VIEW = { width: 1280, height: 720 };
const PAUSE = 2500;

fs.mkdirSync(OUT, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mfsn-rec-'));

const ctx = await chromium.launchPersistentContext(profile, {
  executablePath: BRAVE,
  headless: false,
  viewport: VIEW,
  recordVideo: { dir: OUT, size: VIEW },
});
const page = ctx.pages()[0] || (await ctx.newPage());

const go = async (url, label, scroll = 600) => {
  console.log(`→ ${label}: ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(PAUSE);
  if (scroll) {
    await page.mouse.wheel(0, scroll);
    await page.waitForTimeout(PAUSE);
    await page.mouse.wheel(0, -scroll);
    await page.waitForTimeout(PAUSE / 2);
  }
};

// The consumer journey MFSN reviews:
await go(`${BASE}/`, 'Homepage');
await go(`${BASE}/assessment`, 'Free Assessment — lead capture');
// Step through the first assessment screen if it's a form — click through
const start = page.getByRole('button', { name: /start|begin|continue|next/i }).first();
try {
  if (await start.isEnabled({ timeout: 3000 })) {
    await start.click();
    await page.waitForTimeout(PAUSE);
  }
} catch {}
await go(`${BASE}/register`, 'Account registration');
await go(`${BASE}/login`, 'Login');
await go(`${BASE}/collections`, 'Collections workspace (member area)');
await go(`${BASE}/compare`, 'Provider comparison — affiliate disclosure');
await go(`${BASE}/learn`, 'Learn hub');

await ctx.close();
fs.rmSync(profile, { recursive: true, force: true });

// Rename newest webm to a stable name + transcode mp4 if ffmpeg exists
const webms = fs.readdirSync(OUT).filter((f) => f.endsWith('.webm'));
if (webms.length) {
  const newest = webms.map((f) => [f, fs.statSync(path.join(OUT, f)).mtimeMs]).sort((a, b) => b[1] - a[1])[0][0];
  const webm = path.join(OUT, newest);
  const stable = path.join(OUT, 'settle-enrollment-flow.webm');
  if (newest !== 'settle-enrollment-flow.webm') fs.renameSync(webm, stable);
  try {
    execSync(`ffmpeg -y -i "${stable}" -c:v libx264 -crf 23 -pix_fmt yuv420p "${path.join(OUT, 'settle-enrollment-flow.mp4')}"`, { stdio: 'ignore' });
    console.log('✓ mp4 written:', path.join(OUT, 'settle-enrollment-flow.mp4'));
  } catch { console.log('webm only:', stable); }
}
console.log('Done.');
