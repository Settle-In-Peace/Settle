// telnyx.mjs — Telnyx Call Control client (fetch-based, no SDK dep).
//
// Flow used by settle-voice:
//   POST /calls                        — originate (webhook_url per call)
//   POST /calls/{id}/actions/speak     — TTS a line into the call
//   POST /calls/{id}/actions/transcription_start
//                                      — real-time STT on the call leg;
//                                        utterances arrive on the
//                                        call.transcription webhook
//   POST /calls/{id}/actions/hangup
//
// Env: TELNYX_API_KEY (Bearer), TELNYX_FROM_NUMBER (E.164),
//      TELNYX_CONNECTION_ID (Call Control app), TELNYX_PUBLIC_KEY
//      (Ed25519 webhook verification), TELNYX_SPEAK_VOICE (default 'female'),
//      VOICE_WEBHOOK_URL (public webhook target — settle-api proxies to us).
// The API key is never logged.

import crypto from 'node:crypto';

const API_BASE = (process.env.TELNYX_API_BASE_URL || 'https://api.telnyx.com/v2').replace(/\/$/, '');
const TIMEOUT_MS = Number(process.env.TELNYX_TIMEOUT_MS || 15000);

export const telnyxConfigured = Boolean(
  process.env.TELNYX_API_KEY && process.env.TELNYX_FROM_NUMBER && process.env.TELNYX_CONNECTION_ID,
);

async function request(path, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.TELNYX_API_KEY || ''}`,
        ...(init.headers || {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Telnyx ${init.method || 'GET'} ${path} → ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json().catch(() => ({}));
}

/**
 * Originate an outbound AI call.
 * clientState is echoed back on every webhook for this call.
 */
export async function originateCall({ to, clientState, webhookUrl }) {
  const body = {
    connection_id: process.env.TELNYX_CONNECTION_ID,
    to,
    from: process.env.TELNYX_FROM_NUMBER,
    client_state: Buffer.from(JSON.stringify(clientState || {})).toString('base64'),
    // Machine detection — lets us hang up on voicemail fast instead of
    // talking to a machine. 'detect' is the free heuristic tier.
    answering_machine_detection: process.env.VOICE_AMD || 'detect',
  };
  if (webhookUrl) body.webhook_url = webhookUrl;
  const data = await request('/calls', { method: 'POST', body: JSON.stringify(body) });
  return data?.data?.call_control_id || null;
}

const VOICE = process.env.TELNYX_SPEAK_VOICE || 'female';
const LANGUAGE = process.env.TELNYX_SPEAK_LANGUAGE || 'en-US';

// NOTE: call_control_id is used verbatim in the path (contains 'v3:…').
// Do NOT encodeURIComponent it — Telnyx resolves the raw form (matches
// settle-api's TelnyxDialerProvider).

/** Speak a line into the call (openers, replies, closings). */
export async function speak(callControlId, text) {
  return request(`/calls/${callControlId}/actions/speak`, {
    method: 'POST',
    body: JSON.stringify({
      payload: text,
      payload_type: 'text',
      voice: VOICE,
      language: LANGUAGE,
    }),
  });
}

/**
 * Start real-time speech-to-text on the caller's audio track. Each finished
 * utterance arrives on the `call.transcription` webhook at
 * payload.transcription_data.{transcript,is_final,confidence}.
 *
 * Engine: 'Telnyx' = Telnyx's built-in STT (no external key, billed with the
 * call). 'Google' is the fallback (Telnyx-hosted Google STT). 'inbound' track
 * only so our own TTS is never transcribed back into the loop.
 */
const STT_ENGINE = process.env.VOICE_STT_ENGINE || 'Telnyx';

export async function transcriptionStart(callControlId, { webhookUrl } = {}) {
  const body = {
    transcription_engine: STT_ENGINE,
    language: 'en',
    transcription_tracks: 'inbound',
    interim_results: false,
  };
  if (webhookUrl) body.webhook_url = webhookUrl;
  return request(`/calls/${callControlId}/actions/transcription_start`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function hangup(callControlId) {
  return request(`/calls/${callControlId}/actions/hangup`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

/**
 * Verify a Telnyx Ed25519 webhook signature (mirrors
 * settle-api TelnyxDialerProvider.verifyWebhookSignature). Fail-closed when
 * TELNYX_PUBLIC_KEY is set; when unset (direct-webhook mode isn't used in
 * prod anyway — events arrive pre-verified from settle-api) we reject too.
 */
export function verifyWebhookSignature(rawBody, headers) {
  const publicKey = process.env.TELNYX_PUBLIC_KEY || '';
  const get = (n) => {
    const v = headers[n] ?? headers[n.toLowerCase()];
    return Array.isArray(v) ? v[0] : v;
  };
  const sig = get('telnyx-signature-ed25519');
  const ts = get('telnyx-timestamp-ed25519') ?? get('telnyx-timestamp');
  if (!sig || !ts || !publicKey) return false;
  if (!Number.isFinite(Number(ts)) || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  try {
    const keyBytes = publicKey.includes('BEGIN')
      ? null
      : Buffer.from(publicKey, 'base64');
    const keyObject = publicKey.includes('BEGIN')
      ? crypto.createPublicKey(publicKey)
      : crypto.createPublicKey({
          key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), keyBytes]),
          format: 'der',
          type: 'spki',
        });
    return crypto.verify(
      null,
      Buffer.from(`${ts}|${rawBody}`, 'utf8'),
      keyObject,
      Buffer.from(sig, 'base64'),
    );
  } catch {
    return false;
  }
}
