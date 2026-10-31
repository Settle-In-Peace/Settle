#!/usr/bin/env node
/**
 * Provider-invite email generator — Settle In Peace partner-recruitment pipeline.
 *
 * Reads a CSV of prospective debt-relief providers and generates a 3-touch
 * outreach sequence as {to, subject, body} rows ready to import into Resend /
 * your sender of choice. Modeled on Notyced's tools/claim-campaign generator.
 *
 * THIS TOOL DOES NOT SEND EMAIL. It only writes files to out/. Sending,
 * throttling, unsubscribe handling, and CAN-SPAM compliance live in your
 * email provider. Every generated body includes an {{unsubscribe_url}}
 * placeholder — your sender template must substitute a real opt-out link
 * before delivery.
 *
 * Expected CSV columns (headers matched case-insensitively, extra columns ignored):
 *   company     provider company name               (required — or 'name')
 *   email       recipient                           (rows without email skipped)
 *   contact     contact person's first name         (optional, for greeting)
 *   state       primary state (2-letter)            (optional, personalization)
 *   website     provider site                       (optional)
 *   notes       internal notes                      (optional, not used in copy)
 *
 * Usage:
 *   node generate_invite_emails.mjs --csv prospects.csv
 *   node generate_invite_emails.mjs --csv prospects.csv --touch 1 --format csv -o out/t1.csv
 *   node generate_invite_emails.mjs --csv prospects.csv --touch all --dry-run
 *
 * Options:
 *   --csv <path>         Input CSV of prospects             (required)
 *   --touch <1|2|3|all>  Which touch(es) to generate        (default: all)
 *   --format <jsonl|csv> Output format                      (default: jsonl)
 *   -o, --out <path>     Output file (default: out/provider-invites-<touch>.<ext>)
 *   --base-url <url>     Site base for enroll links         (default: https://settleinpeace.com)
 *   --sender-name <str>  Signature name                     (default: "Settle In Peace Partnerships")
 *   --state <XX>         Only generate for prospects in a state
 *   --limit <n>          Max rows to process
 *   --dry-run            Print counts + 2 samples, write nothing
 */

import fs from 'node:fs';
import path from 'node:path';

// ---------- tiny CSV parser (quoted fields, escaped quotes, CRLF) ----------

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQ = false;
        }
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    if (row.some((v) => v.trim())) rows.push(row);
  }
  return rows;
}

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ---------- args ----------

function parseArgs(argv) {
  const args = {
    touch: 'all',
    format: 'jsonl',
    baseUrl: 'https://settleinpeace.com',
    senderName: 'Settle In Peace Partnerships',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--csv') args.csv = next();
    else if (a === '--touch') args.touch = next();
    else if (a === '--format') args.format = next();
    else if (a === '-o' || a === '--out') args.out = next();
    else if (a === '--base-url') args.baseUrl = next();
    else if (a === '--sender-name') args.senderName = next();
    else if (a === '--state') args.state = next().toUpperCase();
    else if (a === '--limit') args.limit = parseInt(next(), 10);
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '-h' || a === '--help') {
      console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace('/**', ''));
      process.exit(0);
    } else {
      console.error(`Unknown arg: ${a}`);
      process.exit(1);
    }
  }
  return args;
}

// ---------- templates ----------

function vars(prospect, args) {
  const company = prospect.company;
  return {
    company,
    contact: prospect.contact || `${company} team`,
    state_phrase: prospect.state ? ` in ${prospect.state}` : '',
    enroll_url: `${args.baseUrl}/providers`,
    compare_url: `${args.baseUrl}/compare`,
    sender_name: args.senderName,
    unsubscribe_url: '{{unsubscribe_url}}', // sender substitutes real opt-out link
  };
}

function render(template, v) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in v ? v[k] : `{{${k}}}`));
}

const TOUCHES = {
  1: {
    subject: 'Qualified debt-relief leads{{state_phrase}} — invitation for {{company}}',
    body: `Hi {{contact}},

I'm reaching out from Settle In Peace — a debt-relief marketplace where consumers self-qualify through a detailed assessment before any provider ever speaks to them.

We're opening our provider network{{state_phrase}} and {{company}} looks like a strong fit. Here's the short version:

- Leads are scored 0–100 on debt amount, delinquency, employment, and income before they're matched
- You see the lead's state, debt types, amount, and match score BEFORE you buy
- Leads are exclusive — once you purchase, nobody else gets it
- Pay-per-lead from $75, no monthly minimums; marketplace seats include priority placement

Enrollment takes about 5 minutes and there's no cost to apply:

{{enroll_url}}

Happy to answer questions — just reply to this email.

— {{sender_name}}

--
You received this because {{company}} is a licensed debt-relief provider we identified for our partner network.
Unsubscribe: {{unsubscribe_url}}`,
  },
  2: {
    subject: 'How {{company}} would see leads on Settle In Peace',
    body: `Hi {{contact}},

Quick follow-up — here's what a matched lead looks like inside the provider portal:

  Lead #SET-4821 · Match score 92/100 · Premium tier
  $34,500 total debt · Credit card + medical · Texas
  3 months behind · Employed · $4,200/mo income
  Price: $200 — exclusive, full contact info on purchase

Every consumer consents to provider contact (TCPA) during the assessment, so your calls are expected, not cold.

Two ways to participate:

- Pay Per Lead — buy only the leads you want, from $75
- Marketplace Seat — $199/mo adds your profile to the consumer comparison page plus priority placement and 20% off leads

Apply in about 5 minutes — applications are reviewed within 1–2 business days:

{{enroll_url}}

— {{sender_name}}

--
Not interested? Unsubscribe: {{unsubscribe_url}}`,
  },
  3: {
    subject: 'Last note — founding-provider terms for {{company}}',
    body: `Hi {{contact}},

Last email from us on this.

We're onboarding our founding cohort of providers now, and early partners get the best terms: founding rates locked for 12 months, first pick on lead volume in your states, and a direct line to the team building the matching engine.

If the timing isn't right, no problem — but if you'd like {{company}} in the first cohort, the door is open:

{{enroll_url}}

Either way, wishing {{company}} a strong quarter.

— {{sender_name}}

--
This is the last email in this series. Unsubscribe anytime: {{unsubscribe_url}}`,
  },
};

// ---------- main ----------

const args = parseArgs(process.argv.slice(2));
if (!args.csv) {
  console.error('Missing required --csv <path>. See --help.');
  process.exit(1);
}
if (!['jsonl', 'csv'].includes(args.format)) {
  console.error('--format must be jsonl or csv');
  process.exit(1);
}
const touches = args.touch === 'all' ? ['1', '2', '3'] : [String(args.touch)];
for (const t of touches) {
  if (!TOUCHES[t]) {
    console.error(`--touch must be 1, 2, 3, or all (got ${t})`);
    process.exit(1);
  }
}

const text = fs.readFileSync(path.resolve(args.csv), 'utf8').replace(/^﻿/, '');
const rows = parseCsv(text);
if (rows.length < 2) {
  console.error('CSV needs a header row + at least one data row');
  process.exit(1);
}

const headers = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
const col = (...names) => names.map((n) => headers.indexOf(n)).find((i) => i !== -1) ?? -1;
const need = (...names) => {
  const i = col(...names);
  if (i === -1) {
    console.error(`Missing required column "${names[0]}". Found: ${headers.join(', ')}`);
    process.exit(1);
  }
  return i;
};

const cCompany = need('company', 'name', 'company_name');
const cEmail = col('email', 'contact_email');
const cContact = col('contact', 'contact_name', 'first_name');
const cState = col('state');
const cWebsite = col('website');

const emails = [];
let skippedNoEmail = 0;
let skippedState = 0;
let processed = 0;

for (const row of rows.slice(1)) {
  if (args.limit && processed >= args.limit) break;
  const get = (i) => (i === -1 ? '' : (row[i] || '').trim());
  const company = get(cCompany);
  if (!company) continue;

  const state = get(cState);
  if (args.state && state.toUpperCase() !== args.state) {
    skippedState++;
    continue;
  }
  const email = cEmail === -1 ? '' : get(cEmail);
  if (!email || !email.includes('@')) {
    skippedNoEmail++;
    continue;
  }

  processed++;
  const prospect = {
    company,
    contact: get(cContact),
    state,
    website: get(cWebsite),
  };
  const v = vars(prospect, args);

  for (const t of touches) {
    emails.push({
      to: email,
      touch: Number(t),
      company,
      subject: render(TOUCHES[t].subject, v),
      body: render(TOUCHES[t].body, v),
    });
  }
}

const stats = { processed, emails: emails.length, skippedNoEmail, skippedState };

if (args.dryRun) {
  console.log('[dry-run]', JSON.stringify(stats));
  for (const e of emails.slice(0, 2)) {
    console.log(`\n=== TO ${e.to} | touch ${e.touch} ===\nSubject: ${e.subject}\n\n${e.body}`);
  }
  process.exit(0);
}

let output;
if (args.format === 'jsonl') {
  output = emails.map((e) => JSON.stringify(e)).join('\n') + '\n';
} else {
  output =
    'to,touch,company,subject,body\n' +
    emails.map((e) => [e.to, e.touch, csvEscape(e.company), csvEscape(e.subject), csvEscape(e.body)].join(',')).join('\n') +
    '\n';
}

const outDir = path.resolve(new URL('.', import.meta.url).pathname, 'out');
const outPath = args.out
  ? path.resolve(args.out)
  : path.join(outDir, `provider-invites-${args.touch}.${args.format === 'csv' ? 'csv' : 'jsonl'}`);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, output);
console.log(`wrote ${emails.length} emails -> ${outPath}`, JSON.stringify(stats));
