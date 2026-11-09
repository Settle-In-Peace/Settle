// db.mjs — postgres.js pool + voice_calls store + compliance DB gates.
//
// Tables read (settle-api schema — verified live 2026-11-09):
//   crm_dnc_list        — "phoneNumber" (camelCase col), source, added_at
//   crm_consent_logs    — phone_number, consent_type='tcpa', granted,
//                         consent_timestamp, expires_at
//   leads               — phone, "tcpaConsent", "consentTimestamp"
//   skip_trace_lookups  — phones jsonb [{number}], litigator
//   debtor_profiles     — crm_client_id, do_not_call
// Table written: voice_calls (this service owns it; migration 52 in
// settle-api + CREATE TABLE IF NOT EXISTS here for first-boot).

import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || '';

export const dbConfigured = Boolean(DATABASE_URL);

let sql = null;
export function db() {
  if (!sql) {
    sql = postgres(DATABASE_URL, {
      ssl: 'require',
      prepare: false, // Supabase pooler-safe
      max: 4,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return sql;
}

export async function ensureSchema() {
  if (!dbConfigured) return false;
  await db()`CREATE TABLE IF NOT EXISTS voice_calls (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id uuid,
    contact_id uuid,
    collection_account_id uuid,
    agent_id uuid,
    org_id uuid,
    phone_number varchar(20) NOT NULL,
    from_number varchar(20),
    provider_call_id varchar(80),
    status varchar(24) NOT NULL DEFAULT 'queued',
    outcome varchar(32),
    disclosure_played boolean NOT NULL DEFAULT false,
    turns int NOT NULL DEFAULT 0,
    transcript jsonb NOT NULL DEFAULT '[]'::jsonb,
    summary text,
    consent_confirmed boolean NOT NULL DEFAULT false,
    consent_method varchar(32),
    si_provider varchar(80),
    error text,
    started_at timestamptz,
    answered_at timestamptz,
    ended_at timestamptz,
    duration_seconds int,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  await db()`CREATE INDEX IF NOT EXISTS idx_voice_calls_provider ON voice_calls (provider_call_id)`;
  await db()`CREATE INDEX IF NOT EXISTS idx_voice_calls_phone ON voice_calls (phone_number)`;
  await db()`CREATE INDEX IF NOT EXISTS idx_voice_calls_created ON voice_calls (created_at DESC)`;
  return true;
}

// ── Compliance gates (mirror dialer.service.ts assertDialable) ─────────────

/** E.164 normalizer — NANP default, same convention as DialerService. */
export function normalizeE164(phone) {
  if (!phone) return phone;
  let t = String(phone).trim().replace(/[\s().-]/g, '');
  if (!t.startsWith('+')) {
    if (/^1\d{10}$/.test(t)) t = '+' + t;
    else if (/^\d{10}$/.test(t)) t = '+1' + t;
    else t = '+' + t;
  }
  return t;
}

/** isRoutableNumber — same reserved-range screen as the dialer. */
export function isRoutableNumber(e164) {
  if (e164.startsWith('+1')) {
    if (!/^\+1[2-9]\d{2}[2-9]\d{6}$/.test(e164)) return false;
    if (/^\+1555\d{7}$/.test(e164)) return false;
    if (/^\+1\d{3}55501\d{2}$/.test(e164)) return false;
  }
  return true;
}

/** DNC list — always blocks. */
export async function onDncList(phone) {
  const rows = await db()`SELECT id FROM crm_dnc_list WHERE "phoneNumber" = ${phone} LIMIT 1`;
  return rows.length > 0;
}

/** Debtor-profile do-not-call flag for a linked crm client. */
export async function clientDoNotCall(contactId) {
  if (!contactId) return false;
  const rows = await db()`SELECT do_not_call FROM debtor_profiles WHERE crm_client_id = ${contactId} LIMIT 1`;
  return rows[0]?.do_not_call === true;
}

/** TCPA litigator scrub — same jsonb phones[] scan as the dialer. */
export async function isLitigator(phone) {
  const rows = await db()`SELECT 1 FROM skip_trace_lookups l
    WHERE l.litigator = true
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(l.phones) ph WHERE ph->>'number' = ${phone})
    LIMIT 1`;
  return rows.length > 0;
}

/**
 * Recorded opt-in — an unexpired TCPA consent log for the number (or the
 * linked client), or a lead row with tcpaConsent + consentTimestamp inside
 * the 12-month TCPA consent window. NEVER skip this check for AI calls.
 */
export async function hasRecordedConsent(phone, contactId) {
  const consentRows = await db()`SELECT consent_timestamp, expires_at FROM crm_consent_logs
    WHERE consent_type = 'tcpa' AND granted = true
      AND (phone_number = ${phone} ${contactId ? db`OR client_id = ${contactId}` : db``})
    ORDER BY consent_timestamp DESC NULLS LAST LIMIT 1`;
  const c = consentRows[0];
  if (c) {
    const now = Date.now();
    if (c.expires_at && new Date(c.expires_at).getTime() < now) return false;
    if (c.consent_timestamp && now - new Date(c.consent_timestamp).getTime() > 365 * 864e5) return false;
    return true;
  }
  const leadRows = await db()`SELECT "consentTimestamp" FROM leads
    WHERE phone = ${phone} AND "tcpaConsent" = true AND "consentTimestamp" IS NOT NULL
    ORDER BY "consentTimestamp" DESC LIMIT 1`;
  const ts = leadRows[0]?.consentTimestamp;
  if (ts && Date.now() - new Date(ts).getTime() <= 365 * 864e5) return true;
  return false;
}

/** Write a customer-request DNC row (opt-out keyword hit on a live call). */
export async function insertDnc(phone, notes) {
  await db()`INSERT INTO crm_dnc_list ("phoneNumber", source, added_at, notes)
    VALUES (${phone}, 'customer_request', now(), ${notes || 'voice-call opt-out'})
    ON CONFLICT DO NOTHING`;
}

// ── voice_calls rows ──────────────────────────────────────────────────────

export async function createCall(row) {
  const rows = await db()`INSERT INTO voice_calls (
      lead_id, contact_id, collection_account_id, agent_id, org_id,
      phone_number, from_number, status, consent_confirmed, consent_method,
      started_at
    ) VALUES (
      ${row.leadId || null}, ${row.contactId || null},
      ${row.collectionAccountId || null}, ${row.agentId || null},
      ${row.orgId || null}, ${row.phoneNumber}, ${row.fromNumber || null},
      'queued', ${row.consentConfirmed === true},
      ${row.consentMethod || null}, now()
    ) RETURNING *`;
  return rows[0];
}

export async function getCall(id) {
  const rows = await db()`SELECT * FROM voice_calls WHERE id = ${id} LIMIT 1`;
  return rows[0] || null;
}

export async function getCallByProviderId(providerCallId) {
  const rows = await db()`SELECT * FROM voice_calls WHERE provider_call_id = ${providerCallId} LIMIT 1`;
  return rows[0] || null;
}

export async function updateCall(id, patch) {
  const keys = Object.keys(patch);
  if (!keys.length) return getCall(id);
  // postgres.js — update with a patch object via sql(obj) helper
  const rows = await db()`UPDATE voice_calls SET ${db()(patch)} , updated_at = now() WHERE id = ${id} RETURNING *`;
  return rows[0] || null;
}

export async function appendTranscript(id, entry) {
  await db()`UPDATE voice_calls
    SET transcript = transcript || ${JSON.stringify([entry])}::jsonb,
        updated_at = now()
    WHERE id = ${id}`;
}

export async function listCalls(limit = 50) {
  return db()`SELECT id, phone_number, lead_id, contact_id, status, outcome,
      turns, consent_method, disclosure_played, duration_seconds,
      started_at, answered_at, ended_at, created_at
    FROM voice_calls ORDER BY created_at DESC LIMIT ${limit}`;
}
