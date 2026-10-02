/**
 * Normalization helpers for inbound vendor leads (webhook posts + CSV rows).
 * Pure functions — no NestJS/DB deps — so they are cheap to unit-test.
 */

export interface NormalizedLead {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string; // E.164
  state?: string;
  zipCode?: string;
  totalDebt?: number;
  debtTypes?: string[];
  tcpaConsent?: boolean;
  vendorLeadId?: string;
  /** Any extra vendor fields that didn't map — preserved for audit. */
  extra?: Record<string, unknown>;
}

/** Lower-cased alias → canonical field. Covers common vendor spellings. */
const FIELD_ALIASES: Record<string, keyof Omit<NormalizedLead, 'extra'>> = {
  firstname: 'firstName',
  first_name: 'firstName',
  fname: 'firstName',
  given_name: 'firstName',
  lastname: 'lastName',
  last_name: 'lastName',
  lname: 'lastName',
  surname: 'lastName',
  family_name: 'lastName',
  name: 'firstName', // handled specially — may contain "First Last"
  full_name: 'firstName',
  email: 'email',
  email_address: 'email',
  e_mail: 'email',
  phone: 'phone',
  phone_number: 'phone',
  primary_phone: 'phone',
  mobile: 'phone',
  phone1: 'phone',
  telephone: 'phone',
  state: 'state',
  st: 'state',
  zip: 'zipCode',
  zipcode: 'zipCode',
  zip_code: 'zipCode',
  postal: 'zipCode',
  postal_code: 'zipCode',
  totaldebt: 'totalDebt',
  total_debt: 'totalDebt',
  debt: 'totalDebt',
  debtamount: 'totalDebt',
  debt_amount: 'totalDebt',
  debtamountowed: 'totalDebt',
  amount: 'totalDebt',
  debttype: 'debtTypes',
  debt_type: 'debtTypes',
  debttypes: 'debtTypes',
  debt_types: 'debtTypes',
  unsecureddebt: 'totalDebt',
  tcpaconsent: 'tcpaConsent',
  tcpa_consent: 'tcpaConsent',
  consent: 'tcpaConsent',
  consented: 'tcpaConsent',
  optin: 'tcpaConsent',
  opt_in: 'tcpaConsent',
  leadid: 'vendorLeadId',
  lead_id: 'vendorLeadId',
  vendorleadid: 'vendorLeadId',
  vendor_lead_id: 'vendorLeadId',
  external_id: 'vendorLeadId',
  reference: 'vendorLeadId',
};

/** Normalize a US phone to E.164. Returns null when unusable. */
export function normalizePhone(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length >= 12 && digits.length <= 15) return `+${digits}`;
  return null;
}

/** Lower-cased, trimmed email — null when invalid or absent. */
export function normalizeEmail(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  const email = String(raw).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

const STATE_RE = /^[A-Za-z]{2}$/;

function asDebt(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const n = Number(String(raw).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function asDebtTypes(raw: unknown): string[] | undefined {
  if (Array.isArray(raw)) {
    const list = raw.map((v) => String(v).trim()).filter(Boolean);
    return list.length ? list : undefined;
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw
      .split(/[;|,]/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return undefined;
}

function asConsent(raw: unknown): boolean | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw === 'boolean') return raw;
  const s = String(raw).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'consented', 'opted_in'].includes(s)) return true;
  if (['false', '0', 'no', 'n'].includes(s)) return false;
  return undefined;
}

/**
 * Map an arbitrary vendor payload (webhook body, CSV row, order-line) to a
 * NormalizedLead. Keys are matched case-insensitively against FIELD_ALIASES;
 * unrecognized keys land in `extra`. Returns the lead plus a list of row
 * problems — a row is *invalid* when it has no usable phone AND no usable
 * email (can't be contacted or deduped).
 */
export function normalizeVendorLead(input: Record<string, unknown>): {
  lead: NormalizedLead;
  problems: string[];
} {
  const problems: string[] = [];
  const extra: Record<string, unknown> = {};
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input ?? {})) {
    const canonical = FIELD_ALIASES[key.trim().toLowerCase().replace(/[\s\-]+/g, '_')];
    if (canonical) {
      out[canonical] = value;
    } else if (value !== undefined && value !== null && value !== '') {
      extra[key] = value;
    }
  }

  // "name"/"full_name" may carry both parts — split on first space.
  let firstName = String(out.firstName ?? '').trim();
  let lastName = String(out.lastName ?? '').trim();
  if (firstName && !lastName && firstName.includes(' ')) {
    const idx = firstName.indexOf(' ');
    lastName = firstName.slice(idx + 1).trim();
    firstName = firstName.slice(0, idx).trim();
  }
  if (!firstName && !lastName) problems.push('missing name');

  const phone = normalizePhone(out.phone);
  const email = normalizeEmail(out.email);
  if (!phone && !email) problems.push('no usable phone or email');
  if (out.phone !== undefined && out.phone !== '' && !phone) {
    problems.push('unparseable phone');
  }

  const state = String(out.state ?? '').trim().toUpperCase();
  if (state && !STATE_RE.test(state)) problems.push('invalid state');

  const lead: NormalizedLead = {
    firstName: firstName || 'Unknown',
    lastName: lastName || 'Lead',
    email: email ?? undefined,
    phone: phone ?? undefined,
    state: STATE_RE.test(state) ? state : undefined,
    zipCode: String(out.zipCode ?? '').trim() || undefined,
    totalDebt: asDebt(out.totalDebt),
    debtTypes: asDebtTypes(out.debtTypes),
    tcpaConsent: asConsent(out.tcpaConsent),
    vendorLeadId: String(out.vendorLeadId ?? '').trim() || undefined,
    extra: Object.keys(extra).length ? extra : undefined,
  };

  return { lead, problems };
}

// ── Minimal RFC-4180-ish CSV parsing ─────────────────────────────────────

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

/**
 * Parse CSV text: handles quoted fields, embedded commas/quotes/newlines,
 * CRLF endings, and a UTF-8 BOM. Delimiter auto-detected (`,` or `\t`/`;`).
 */
export function parseCsv(text: string): ParsedCsv {
  const src = text.replace(/^﻿/, '');
  const delimiter = detectDelimiter(src);
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }

  const headers = (rows[0] ?? []).map((h) => h.trim());
  return { headers, rows: rows.slice(1) };
}

function detectDelimiter(text: string): string {
  const firstLine = text.slice(0, text.indexOf('\n') >>> 0 || text.length);
  const counts = { ',': 0, '\t': 0, ';': 0 };
  for (const c of firstLine) if (c in counts) counts[c as keyof typeof counts]++;
  if (counts['\t'] > counts[',']) return '\t';
  if (counts[';'] > counts[',']) return ';';
  return ',';
}

/** Map a parsed CSV row to a key→value record using the header row. */
export function csvRowToRecord(headers: string[], row: string[]): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((header, i) => {
    record[header] = row[i] ?? '';
  });
  return record;
}
