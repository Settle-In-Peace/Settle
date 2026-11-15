#!/usr/bin/env node
/**
 * Provider-invite sender — delivers generated outreach through Resend.
 * Settle port of Notyced's send_claim_emails.mjs.
 *
 * SAFE BY DEFAULT: --dry-run unless --send is passed. A real send requires:
 *   --unsubscribe-url <url>     working opt-out (mailto: is CAN-SPAM-legal if
 *                               the mailbox is monitored; a web endpoint is better)
 *   --mailing-address <addr>    real postal address (CAN-SPAM §7704(a)(5)(A)(iii))
 *   RESEND_API_KEY env          from settle-api/.env (or the oracle box .env)
 * The run aborts if any body still contains {{unsubscribe_url}} or
 * {{mailing_address}} after substitution.
 *
 * Suppression: out/suppression.txt — one email per line, matched
 * case-insensitively. Suppressed addresses are NEVER sent, in any run.
 * Add entries manually (or --suppress <email>) when opt-outs come in —
 * honoring opt-outs within 10 business days is the legal floor; honor them
 * immediately. The file is gitignored-adjacent tooling state — keep it.
 *
 * Idempotent: (to + touch) pairs already logged "sent" are skipped.
 *
 * Usage:
 *   export RESEND_API_KEY=$(grep '^RESEND_API_KEY=' ../../settle-api/.env | cut -d= -f2-)
 *   node send_provider_invites.mjs --in out/provider-invites-1.jsonl --dry-run
 *   node send_provider_invites.mjs --in out/provider-invites-1.jsonl --send \
 *     --mailing-address "Reid Technology, <street>, <city>, <state> <zip>" \
 *     --unsubscribe-url "mailto:support@settleinpeace.com?subject=unsubscribe" \
 *     --limit 25
 *
 * Options:
 *   --in <path>              Generated emails JSONL/CSV       (required)
 *   --send                   Actually send (default: dry-run)
 *   --unsubscribe-url <url>  Real opt-out link               (required with --send)
 *   --mailing-address <str>  Postal address for the footer   (required with --send;
 *                            or MAILING_ADDRESS env)
 *   --suppress <email>       Add an address to suppression.txt and exit-friendly
 *   --suppression <path>     Suppression list                (default: out/suppression.txt)
 *   --limit <n>              Max emails this run             (recommend ≤25/day)
 *   --touch <n>              Only this touch number
 *   --delay <ms>             Gap between sends               (default: 2000)
 *   --from <str>             From header                     (default: Settle In Peace
 *                            Partnerships <partners@settleinpeace.com>)
 *   --log <path>             Send log JSONL                  (default: <in>.sent.jsonl)
 */

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_FROM = 'Settle In Peace Partnerships <partners@settleinpeace.com>';

function parseArgs(argv) {
  const args = { delay: 2000, dryRun: true, from: DEFAULT_FROM };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--in') args.in = next();
    else if (a === '--send') args.dryRun = false;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--unsubscribe-url') args.unsubscribeUrl = next();
    else if (a === '--mailing-address') args.mailingAddress = next();
    else if (a === '--suppress') args.suppress = next().toLowerCase();
    else if (a === '--suppression') args.suppression = next();
    else if (a === '--limit') args.limit = parseInt(next(), 10);
    else if (a === '--touch') args.touch = String(next());
    else if (a === '--delay') args.delay = Math.max(250, parseInt(next(), 10) || 2000);
    else if (a === '--from') args.from = next();
    else if (a === '--log') args.log = next();
    else if (a === '-h' || a === '--help') {
      console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace('/**', ''));
      process.exit(0);
    } else {
      console.error(`Unknown arg: ${a}`);
      process.exit(1);
    }
  }
  args.mailingAddress = args.mailingAddress || process.env.MAILING_ADDRESS;
  return args;
}

function parseJsonl(text) {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l));
}

// Minimal CSV reader (to,touch,subject,body + any extra columns, quoted fields)
function parseCsvRecords(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field || row.length) { row.push(field); if (row.some((v) => v.trim())) rows.push(row); }
  const headers = (rows[0] || []).map((h) => h.trim().toLowerCase());
  const idx = (n) => headers.indexOf(n);
  return rows.slice(1).map((r) => ({
    to: r[idx('to')] || '',
    touch: r[idx('touch')] || '',
    subject: r[idx('subject')] || '',
    body: r[idx('body')] || '',
    company: r[idx('company')] || '',
  }));
}

const args = parseArgs(process.argv.slice(2));

const suppressionPath = path.resolve(args.suppression || 'out/suppression.txt');
const suppressed = new Set(
  fs.existsSync(suppressionPath)
    ? fs.readFileSync(suppressionPath, 'utf8').split(/\r?\n/).map((l) => l.trim().toLowerCase()).filter(Boolean)
    : [],
);
if (args.suppress) {
  if (!suppressed.has(args.suppress)) {
    fs.mkdirSync(path.dirname(suppressionPath), { recursive: true });
    fs.appendFileSync(suppressionPath, `${args.suppress}\n`);
    suppressed.add(args.suppress);
  }
  console.log(`[suppressed] ${args.suppress} — ${suppressed.size} total on the list`);
  if (!args.in) process.exit(0);
}

if (!args.in) {
  console.error('Missing required --in <path>. See --help.');
  process.exit(1);
}

const inputPath = path.resolve(args.in);
const text = fs.readFileSync(inputPath, 'utf8').replace(/^﻿/, '');
let emails = inputPath.endsWith('.csv') ? parseCsvRecords(text) : parseJsonl(text);

if (args.touch) emails = emails.filter((e) => String(e.touch) === args.touch);
emails = emails.filter((e) => e.to && e.to.includes('@') && e.subject && e.body);

const afterSuppression = emails.filter((e) => !suppressed.has(e.to.toLowerCase()));
const skippedSuppressed = emails.length - afterSuppression.length;
emails = afterSuppression;

// --- compliance substitution (mandatory before any real send) ---
if (!args.dryRun) {
  if (!args.unsubscribeUrl) {
    console.error('Refusing to send: --unsubscribe-url is required (CAN-SPAM).');
    process.exit(1);
  }
  if (!args.mailingAddress) {
    console.error('Refusing to send: --mailing-address (or MAILING_ADDRESS) is required (CAN-SPAM).');
    process.exit(1);
  }
  for (const e of emails) {
    e.body = e.body
      .replaceAll('{{unsubscribe_url}}', args.unsubscribeUrl)
      .replaceAll('{{mailing_address}}', args.mailingAddress);
    if (e.body.includes('{{unsubscribe_url}}') || e.body.includes('{{mailing_address}}')) {
      console.error(`Body for ${e.to} still contains an unsubstituted placeholder — aborting.`);
      process.exit(1);
    }
  }
}

// --- skip already-sent (to + touch) from the log ---
const logPath = args.log ? path.resolve(args.log) : `${inputPath}.sent.jsonl`;
const sentKeys = new Set();
if (fs.existsSync(logPath)) {
  for (const line of fs.readFileSync(logPath, 'utf8').split(/\r?\n/).filter(Boolean)) {
    try {
      const rec = JSON.parse(line);
      if (rec.status === 'sent') sentKeys.add(`${rec.to}|${rec.touch}`);
    } catch { /* ignore malformed log lines */ }
  }
}
const pending = emails.filter((e) => !sentKeys.has(`${e.to}|${e.touch}`));
const batch = pending.slice(0, args.limit || Infinity);

console.log(
  `[plan] ${emails.length} emails loaded (${skippedSuppressed} suppressed), ${sentKeys.size} already sent, ` +
    `${batch.length} to ${args.dryRun ? 'PREVIEW (dry-run)' : 'SEND'} this run` +
    (args.touch ? ` (touch ${args.touch} only)` : ''),
);

if (args.dryRun) {
  for (const e of batch.slice(0, 3)) {
    console.log(`\n--- ${e.to} (touch ${e.touch}${e.company ? `, ${e.company}` : ''}) ---`);
    console.log(`Subject: ${e.subject}`);
    console.log(
      e.body
        .replaceAll('{{unsubscribe_url}}', args.unsubscribeUrl || '<unsubscribe-url>')
        .replaceAll('{{mailing_address}}', args.mailingAddress || '<mailing-address>'),
    );
  }
  console.log('\nDry run — re-run with --send --unsubscribe-url <url> --mailing-address <addr> to deliver.');
  process.exit(0);
}

// --- send path ---
const resendKey = process.env.RESEND_API_KEY;
if (!resendKey) {
  console.error('RESEND_API_KEY env var required for --send (settle-api/.env or the oracle box).');
  process.exit(1);
}

let sent = 0, failed = 0;
for (const [i, e] of batch.entries()) {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: args.from,
        to: [e.to],
        subject: e.subject,
        text: e.body,
        html: e.body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br/>'),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const status = res.ok ? 'sent' : `failed-${res.status}`;
    if (res.ok) sent++; else failed++;
    fs.appendFileSync(
      logPath,
      JSON.stringify({ ts: new Date().toISOString(), to: e.to, touch: e.touch, company: e.company, status }) + '\n',
    );
    if (!res.ok) console.error(`  x ${e.to}: HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
    else process.stderr.write(`  ✓ ${e.to}\n`);
  } catch (err) {
    failed++;
    fs.appendFileSync(
      logPath,
      JSON.stringify({ ts: new Date().toISOString(), to: e.to, touch: e.touch, company: e.company, status: 'failed-network' }) + '\n',
    );
    console.error(`  x ${e.to}: ${err.message}`);
  }
  if (i < batch.length - 1) await new Promise((r) => setTimeout(r, args.delay));
}

console.log(`\n[done] sent=${sent} failed=${failed} log=${logPath}`);
process.exit(failed > 0 ? 2 : 0);
