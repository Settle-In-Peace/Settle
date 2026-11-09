// settle-voice — SI-powered outbound AI lead caller for Settle In Peace.
//
// Plain Node, one dep (postgres.js). Runs as pm2 `settle-voice` on the
// oracle box (:4027). Reached internally by settle-api:
//   POST /calls                 — originate an AI call (x-voice-key auth)
//   GET  /calls                 — recent voice_calls rows (x-voice-key)
//   GET  /calls/:id             — one row (x-voice-key)
//   POST /internal/telnyx-event — Telnyx events forwarded by settle-api
//                                 (signature already verified there)
//   POST /webhooks/telnyx       — direct Telnyx webhook (self-verifies)
//   GET  /health                — config/store status
//
// Call loop (Telnyx Call Control):
//   originate → call.answered → speak(OPENING + first question)
//     + transcription_start (inbound track, Telnyx STT)
//     → call.transcription {transcription_data.transcript, is_final}
//       → opt-out?  → DNC row + OPTOUT_LINE + hangup
//       → human?    → HANDOFF_LINE + hangup (handoff_requested)
//       → else      → si-gateway chat → speak(reply) → loop
//     → max turns → CLOSING_LINE + hangup
//   call.machine.detection.ended(machine|fax) → hangup (voicemail)
//   call.speak.ended → hangup if a closing line was pending
//   call.hangup → finalize row
//
// Compliance: consent is verified in the DB before ANY call is originated
// (crm_consent_logs / leads.consentTimestamp) or an agent attestation rides
// in from settle-api — never cold-call. AI disclosure is the first thing
// said, every call. No debt-settlement advice — see compliance.mjs.

import './env.mjs'; // .env → process.env (must precede the module imports)
import { createServer } from 'node:http';
import {
  dbConfigured, ensureSchema,
  normalizeE164, isRoutableNumber,
  onDncList, clientDoNotCall, isLitigator, hasRecordedConsent, insertDnc,
  createCall, getCall, getCallByProviderId, updateCall, appendTranscript, listCalls,
} from './db.mjs';
import {
  telnyxConfigured, originateCall, speak, transcriptionStart, hangup,
  verifyWebhookSignature,
} from './telnyx.mjs';
import { siConfigured, chat } from './si.mjs';
import {
  OPENING_SCRIPT, HANDOFF_LINE, OPTOUT_LINE, CLOSING_LINE, DEGRADED_LINE,
  wantsHuman, wantsOptOut, buildSystemPrompt, sanitizeReply,
} from './compliance.mjs';

const PORT = Number(process.env.PORT || process.env.VOICE_PORT || 4027);
const VOICE_KEY = process.env.SETTLE_VOICE_KEY || '';
const WEBHOOK_URL = (process.env.VOICE_WEBHOOK_URL || '').replace(/\/$/, '');
const MAX_TURNS = Number(process.env.VOICE_MAX_TURNS || 6);
const E164_RE = /^\+[1-9]\d{6,14}$/;

const log = (...a) => console.log(`[settle-voice ${new Date().toISOString()}]`, ...a);
const warn = (...a) => console.warn(`[settle-voice ${new Date().toISOString()}]`, ...a);

// ── In-call conversation state (rebuilt from DB when possible) ─────────────
// providerCallId → { voiceCallId, messages[], turns, reprompts, done }
const sessions = new Map();

function session(ccid, voiceCallId) {
  let s = sessions.get(ccid);
  if (!s) {
    s = {
      voiceCallId, messages: [], turns: 0, done: false, started: false,
      closing: false, closingTimer: null, busy: false, pendingText: null,
    };
    sessions.set(ccid, s);
  }
  if (voiceCallId && !s.voiceCallId) s.voiceCallId = voiceCallId;
  return s;
}

// ── Webhook dedup — Telnyx retries delivery + fires on both the per-call
//    webhook_url and the connection-level webhook, so every event arrives
//    2-3×. Bounded seen-set by event id.
const seenEvents = new Map(); // id → ts
function seenBefore(id) {
  if (!id) return false;
  if (seenEvents.has(id)) return true;
  seenEvents.set(id, Date.now());
  if (seenEvents.size > 2000) {
    const cutoff = Date.now() - 10 * 60e3;
    for (const [k, t] of seenEvents) if (t < cutoff) seenEvents.delete(k);
  }
  return false;
}

function decodeClientState(cs) {
  if (!cs || typeof cs !== 'string') return {};
  try { return JSON.parse(Buffer.from(cs, 'base64').toString('utf8')) || {}; }
  catch { return {}; }
}

// ── Origination ────────────────────────────────────────────────────────────

async function originate(body) {
  const to = normalizeE164(body.to || '');
  if (!E164_RE.test(to)) return { status: 400, error: 'invalid_destination' };
  if (!isRoutableNumber(to)) return { status: 400, error: 'unroutable_number' };
  if (!telnyxConfigured) return { status: 503, error: 'telnyx_not_configured' };
  if (!dbConfigured) return { status: 503, error: 'db_not_configured' };

  // ── Compliance gates — defense in depth. settle-api runs these too, but
  //    the voice service re-verifies before it ever touches Telnyx.
  if (await onDncList(to)) return { status: 403, error: 'dnc_listed' };
  if (body.contactId && await clientDoNotCall(body.contactId)) {
    return { status: 403, error: 'contact_do_not_call' };
  }
  if (await isLitigator(to)) return { status: 403, error: 'tcpa_litigator' };
  const recorded = await hasRecordedConsent(to, body.contactId);
  const attested = body.consentConfirmed === true;
  if (!recorded && !attested) return { status: 403, error: 'no_consent' };

  const row = await createCall({
    leadId: body.leadId, contactId: body.contactId,
    collectionAccountId: body.collectionAccountId,
    agentId: body.agentId, orgId: body.orgId,
    phoneNumber: to,
    fromNumber: process.env.TELNYX_FROM_NUMBER,
    consentConfirmed: recorded || attested,
    consentMethod: recorded ? 'stored' : 'agent_attested',
  });

  let ccid;
  try {
    ccid = await originateCall({
      to,
      clientState: { voiceCallId: row.id, contactId: body.contactId || null },
      webhookUrl: WEBHOOK_URL || undefined,
    });
  } catch (e) {
    await updateCall(row.id, { status: 'failed', outcome: 'failed', error: e.message, ended_at: new Date().toISOString() });
    return { status: 502, error: 'telnyx_originate_failed' };
  }

  await updateCall(row.id, { provider_call_id: ccid, status: 'dialing' });
  return { status: 201, call: { id: row.id, provider_call_id: ccid, status: 'dialing', phone_number: to } };
}

// ── Conversation loop ──────────────────────────────────────────────────────

/**
 * Speak a closing line then hang up — the hangup is deferred to the
 * call.speak.ended webhook (with a time-based fallback) so the line isn't
 * clipped mid-word.
 */
async function endCall(call, s, ccid, line, outcome) {
  s.done = true;
  s.closing = true;
  const finish = async () => {
    try { await hangup(ccid); } catch (e) { warn('hangup failed', e.message); }
  };
  if (line) {
    try {
      await speak(ccid, line);
      // Fallback if call.speak.ended never arrives (~16 chars/sec TTS + pad).
      const ms = Math.min(12_000, Math.max(3000, Math.round((line.length / 16) * 1000) + 1500));
      s.closingTimer = setTimeout(() => { s.closingTimer = null; void finish(); }, ms);
      s.closingFinish = finish;
    } catch (e) {
      warn('closing speak failed', e.message);
      await finish();
    }
  } else {
    await finish();
  }
  await updateCall(call.id, { outcome, status: 'completed', ended_at: new Date().toISOString() });
}

async function onAnswered(call, s, ccid) {
  const nameQ = call.lead_id || call.contact_id ? 'Am I speaking with the person who requested the call?' : 'Is this a good time?';
  const opener = `${OPENING_SCRIPT} I'm following up on the debt-relief request that came in through our website. ${nameQ}`;
  s.messages = [{ role: 'system', content: buildSystemPrompt({ leadName: null }) }, { role: 'assistant', content: opener }];
  s.started = true;
  try {
    await speak(ccid, opener);
  } catch (e) {
    warn('opening speak failed', e.message);
    await endCall(call, s, ccid, null, 'degraded');
    return;
  }
  await updateCall(call.id, {
    status: 'answered', disclosure_played: true,
    answered_at: new Date().toISOString(),
  });
  await appendTranscript(call.id, { role: 'agent', text: opener, at: new Date().toISOString() });
  try {
    await transcriptionStart(ccid, { webhookUrl: WEBHOOK_URL || undefined });
  } catch (e) {
    warn('transcription_start failed', e.message);
    await endCall(call, s, ccid, DEGRADED_LINE, 'degraded');
  }
}

/** One finalized caller utterance → compliance gates → SI reply → speak. */
async function onCallerSpeech(call, s, ccid, speechText) {
  if (s.done || s.closing) return;
  speechText = (speechText || '').trim();
  if (!speechText) return;

  // If a reply is already in flight, keep only the latest utterance.
  if (s.busy) { s.pendingText = speechText; return; }
  s.busy = true;
  try {
    while (speechText) {
      await appendTranscript(call.id, { role: 'caller', text: speechText, at: new Date().toISOString() });

      // ── Compliance gates on every caller turn ──
      if (wantsOptOut(speechText)) {
        try { await insertDnc(call.phone_number, `voice-call opt-out ${call.id}`); }
        catch (e) { warn('dnc insert failed', e.message); }
        await endCall(call, s, ccid, OPTOUT_LINE, 'opt_out');
        return;
      }
      if (wantsHuman(speechText)) {
        await endCall(call, s, ccid, HANDOFF_LINE, 'handoff_requested');
        return;
      }

      s.turns += 1;
      await updateCall(call.id, { turns: s.turns, status: 'in_conversation' });
      if (s.turns > MAX_TURNS) {
        await endCall(call, s, ccid, CLOSING_LINE, 'qualified');
        return;
      }

      // ── SI turn — degrade to the polite close if the gateway is down ──
      s.messages.push({ role: 'user', content: speechText });
      const reply = await chat(s.messages);
      if (!reply) {
        await endCall(call, s, ccid, DEGRADED_LINE, 'degraded');
        return;
      }
      const spoken = sanitizeReply(reply.content);
      if (!spoken) {
        await endCall(call, s, ccid, CLOSING_LINE, 'qualified');
        return;
      }
      s.messages.push({ role: 'assistant', content: spoken });
      await appendTranscript(call.id, { role: 'agent', text: spoken, at: new Date().toISOString() });
      await updateCall(call.id, { si_provider: reply.provider });
      try {
        await speak(ccid, spoken);
      } catch (e) {
        warn('reply speak failed', e.message);
        await endCall(call, s, ccid, null, 'degraded');
        return;
      }
      speechText = s.pendingText;
      s.pendingText = null;
    }
  } finally {
    s.busy = false;
  }
}

async function onHangup(call, s, payload) {
  s.done = true;
  if (s.closingTimer) { clearTimeout(s.closingTimer); s.closingTimer = null; }
  sessions.delete(payload?.call_control_id);
  const answeredAt = call.answered_at ? new Date(call.answered_at) : null;
  const dur = answeredAt ? Math.max(0, Math.round((Date.now() - answeredAt.getTime()) / 1000)) : null;
  await updateCall(call.id, {
    status: 'completed',
    outcome: call.outcome || (answeredAt ? 'completed' : (payload?.hangup_cause === 'busy' ? 'busy' : 'no_answer')),
    ended_at: new Date().toISOString(),
    duration_seconds: dur,
  });
}

/** Route one normalized Telnyx event. */
async function handleEvent(body) {
  const data = body?.data;
  const type = data?.event_type || '';
  const payload = data?.payload || {};
  const ccid = payload.call_control_id;
  if (!ccid) return;
  if (seenBefore(data?.id)) return; // duplicate delivery — drop

  const cs = decodeClientState(payload.client_state);
  let call = cs.voiceCallId ? await getCall(cs.voiceCallId) : null;
  if (!call) call = await getCallByProviderId(ccid);
  if (!call) { warn(`event ${type} matched no voice_call (ccid=${ccid})`); return; }
  const s = session(ccid, call.id);
  log(`event ${type} call=${call.id}`);

  try {
    switch (type) {
      case 'call.initiated':
        await updateCall(call.id, { status: 'dialing', provider_call_id: ccid });
        break;
      case 'call.answered':
        if (!s.started) await onAnswered(call, s, ccid);
        break;
      case 'call.machine.detection.ended': {
        const r = payload.result || '';
        if ((r === 'machine' || r === 'fax') && !s.done) {
          s.done = true;
          if (s.closingTimer) { clearTimeout(s.closingTimer); s.closingTimer = null; }
          try { await hangup(ccid); } catch {}
          await updateCall(call.id, { status: 'completed', outcome: 'voicemail', ended_at: new Date().toISOString() });
        }
        break;
      }
      case 'call.transcription': {
        const td = payload.transcription_data || {};
        if (td.is_final && td.transcript) {
          await onCallerSpeech(call, s, ccid, td.transcript);
        }
        break;
      }
      case 'call.speak.ended': {
        // A closing line finished playing → now hang up.
        if (s.closing && s.closingFinish) {
          if (s.closingTimer) { clearTimeout(s.closingTimer); s.closingTimer = null; }
          const f = s.closingFinish;
          s.closingFinish = null;
          try { await f(); } catch {}
        }
        break;
      }
      case 'call.hangup':
        await onHangup(call, s, payload);
        break;
      default:
        break; // speak.ended, playback, bridging — informational only
    }
  } catch (e) {
    warn(`handler error on ${type}:`, e.message);
    await updateCall(call.id, { error: e.message }).catch(() => {});
  }
}

// ── HTTP surface ───────────────────────────────────────────────────────────

function json(res, code, obj) {
  const b = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) });
  res.end(b);
}

const authed = (req) => VOICE_KEY && req.headers['x-voice-key'] === VOICE_KEY;

async function readBody(req) {
  let raw = '';
  for await (const c of req) raw += c;
  return raw;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;

  if (path === '/health' && req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      service: 'settle-voice',
      telnyx: telnyxConfigured ? 'configured' : 'missing_env',
      si: siConfigured ? 'configured' : 'missing_env',
      db: dbConfigured ? 'configured' : 'missing_env',
      stt: `telnyx-transcription_start(${process.env.VOICE_STT_ENGINE || 'Telnyx'})`,
      tts: 'telnyx-speak',
      webhook: WEBHOOK_URL || 'unset',
      port: PORT,
    });
  }

  // ── internal API (x-voice-key) ──
  if (path === '/calls' && req.method === 'POST') {
    if (!authed(req)) return json(res, 401, { error: 'unauthorized' });
    let body = {};
    try { body = JSON.parse(await readBody(req) || '{}'); } catch { return json(res, 400, { error: 'bad_json' }); }
    try {
      const r = await originate(body);
      return json(res, r.status, r);
    } catch (e) {
      warn('originate failed:', e.message);
      return json(res, 500, { error: 'internal_error' });
    }
  }
  if (path === '/calls' && req.method === 'GET') {
    if (!authed(req)) return json(res, 401, { error: 'unauthorized' });
    return json(res, 200, { calls: await listCalls(50) });
  }
  const callMatch = path.match(/^\/calls\/([0-9a-f-]{36})$/);
  if (callMatch && req.method === 'GET') {
    if (!authed(req)) return json(res, 401, { error: 'unauthorized' });
    const row = await getCall(callMatch[1]);
    return row ? json(res, 200, { call: row }) : json(res, 404, { error: 'not_found' });
  }
  // Operator hangup (dashboard cancel button)
  if (callMatch && req.method === 'DELETE') {
    if (!authed(req)) return json(res, 401, { error: 'unauthorized' });
    const row = await getCall(callMatch[1]);
    if (!row?.provider_call_id) return json(res, 400, { error: 'no_provider_call' });
    try { await hangup(row.provider_call_id); } catch (e) { return json(res, 502, { error: e.message }); }
    return json(res, 200, { ok: true });
  }

  // ── pre-verified event forwarded by settle-api ──
  if (path === '/internal/telnyx-event' && req.method === 'POST') {
    if (!authed(req)) return json(res, 401, { error: 'unauthorized' });
    let body = null;
    try { body = JSON.parse(await readBody(req) || 'null'); } catch { /* fallthrough */ }
    if (body) void handleEvent(body); // ack fast — Telnyx retries on slowness
    return json(res, 200, { received: true });
  }

  // ── direct webhook mode (self-verify) ──
  if (path === '/webhooks/telnyx' && req.method === 'POST') {
    const raw = await readBody(req);
    if (!verifyWebhookSignature(raw, req.headers)) {
      return json(res, 401, { error: 'invalid_signature' });
    }
    let body = null;
    try { body = JSON.parse(raw); } catch { /* fallthrough */ }
    if (body) void handleEvent(body);
    return json(res, 200, { received: true });
  }

  return json(res, 404, { error: 'not_found' });
});

server.listen(PORT, '127.0.0.1', async () => {
  log(`listening on 127.0.0.1:${PORT}`);
  log(`telnyx=${telnyxConfigured ? 'on' : 'OFF'} si=${siConfigured ? 'on' : 'OFF'} db=${dbConfigured ? 'on' : 'OFF'} voice_key=${VOICE_KEY ? 'set' : 'UNSET'}`);
  if (dbConfigured) {
    try { await ensureSchema(); log('voice_calls schema ok'); }
    catch (e) { warn('schema bootstrap failed:', e.message); }
  }
});
