/**
 * Real-time TypeScript + ESLint error watcher for settle-web.
 *
 * Run alongside the dev server:
 *   pnpm watch:errors        (from repo root)
 *
 * On every .ts/.tsx save:
 * 1. eslint --fix the saved file (auto-heals immediately)
 * 2. tsc --noEmit → settle-web/.errors/tsc.log
 * 3. Machine-readable summary → settle-web/.errors/summary.json
 */

import { watch } from 'fs';
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const WEB = join(ROOT, 'settle-web');
const ERRORS_DIR = join(WEB, '.errors');

if (!existsSync(ERRORS_DIR)) mkdirSync(ERRORS_DIR, { recursive: true });

const TSC_LOG = resolve(ERRORS_DIR, 'tsc.log');
const ESLINT_LOG = resolve(ERRORS_DIR, 'eslint.log');
const SUMMARY_JSON = resolve(ERRORS_DIR, 'summary.json');

let debounceTimer = null;
let isRunning = false;

function log(msg) {
  console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

function eslintFix(filePath) {
  try {
    const rel = filePath.replace(WEB + '/', '');
    execSync(`./node_modules/.bin/eslint --fix "${rel}"`, {
      cwd: WEB,
      stdio: 'pipe',
      timeout: 15000,
    });
    log(`✓ eslint fixed: ${rel}`);
  } catch (e) {
    writeFileSync(ESLINT_LOG, (e.stdout?.toString() || '') + (e.stderr?.toString() || ''));
  }
}

function typecheck() {
  try {
    execSync('./node_modules/.bin/tsc --noEmit 2>&1', {
      cwd: WEB,
      stdio: 'pipe',
      timeout: 180000,
    });
    writeFileSync(TSC_LOG, '');
    return [];
  } catch (e) {
    const out = (e.stdout?.toString() || '') + (e.stderr?.toString() || '');
    writeFileSync(TSC_LOG, out);
    return out
      .split('\n')
      .filter((l) => l.includes('error TS'))
      .map((l) => {
        const m = l.match(/^(.*)\((\d+),(\d+)\): error (TS\d+): (.*)$/);
        return m
          ? { file: m[1], line: +m[2], col: +m[3], code: m[4], message: m[5] }
          : { raw: l };
      });
  }
}

function runAll(changedFile) {
  if (isRunning) return;
  isRunning = true;
  try {
    if (changedFile) eslintFix(changedFile);
    const errors = typecheck();
    writeFileSync(
      SUMMARY_JSON,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          package: 'settle-web',
          tscErrorCount: errors.length,
          tscErrors: errors,
          eslintLog: ESLINT_LOG,
          tscLog: TSC_LOG,
        },
        null,
        2
      )
    );
    log(`tsc: ${errors.length} error(s) — .errors/summary.json`);
  } finally {
    isRunning = false;
  }
}

log(`Watching ${WEB} for .ts/.tsx changes...`);
runAll(null); // initial pass

watch(WEB, { recursive: true }, (_event, filename) => {
  if (!filename || !/\.(ts|tsx)$/.test(filename)) return;
  if (/node_modules|\.next|\.open-next|\.errors/.test(filename)) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => runAll(join(WEB, filename)), 400);
});
