// tts.mjs — everything the caller hears, in priority order.
//
// Four modes (VOICE_TTS_MODE, default 'hybrid'):
//   'neural' — Telnyx premium `speak` (AWS Polly *-Neural voice + SSML
//              pacing). Rendered carrier-side: zero local CPU, near-zero
//              added latency. This is the human-sounding default — the
//              oracle box is a 1-vCPU micro running swap, so local neural
//              TTS can't render inside a conversational beat.
//   'kokoro' — render every line through prime-voice (Kokoro ONNX,
//              POST /v1/audio/speech), write to audio/tmp/, hand Telnyx a
//              public URL via `playback_start`. Best voice quality when the
//              box can afford it.
//   'hybrid' — Kokoro file playback for anything already rendered+cached
//              (the fixed compliance lines are pre-rendered in the
//              background at boot), premium neural speak for dynamic
//              replies. On a saturated box the opener still lands Kokoro
//              while conversation stays responsive.
//   'basic'  — legacy free `speak` (voice 'female'), debugging only.
//
// Fallback chain in every mode: Kokoro render/playback fails → premium
// neural speak → (that fails) basic speak. Never dead air.
//
// Files live under settle-voice/audio/:
//   cache/<sha1>.wav — static lines, kept across restarts
//   tmp/<rand>.wav   — dynamic renders, swept after VOICE_AUDIO_TTL_MS
// settle-voice serves them on GET /audio/<name> (localhost); settle-api
// exposes them publicly at /dialer/voice-audio/<name> for Telnyx to fetch.
//
// Env:
//   VOICE_TTS_MODE            hybrid|neural|kokoro|basic  (default hybrid)
//   PRIME_VOICE_URL           Kokoro engine (default http://127.0.0.1:4020)
//   PRIME_VOICE_ENGINE_KEY    X-Engine-Key for prime-voice
//   KOKORO_VOICE              Kokoro voice id (default af_heart)
//   VOICE_TTS_TIMEOUT_MS      Kokoro render budget (default 25000)
//   VOICE_AUDIO_PUBLIC_BASE   public URL prefix Telnyx can fetch
//                             (https://api.settleinpeace.com/dialer/voice-audio)
//   VOICE_AUDIO_TTL_MS        tmp-file TTL (default 30min)
//   TELNYX_SPEAK_VOICE        speak voice (default Polly.Joanna-Neural)
//   TELNYX_SPEAK_LEVEL        speak service_level (default premium)

import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync, renameSync, createReadStream, readdirSync, statSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { speak, playbackStart } from './telnyx.mjs';

const dir = dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = join(dir, 'audio');
const CACHE_DIR = join(AUDIO_DIR, 'cache');
const TMP_DIR = join(AUDIO_DIR, 'tmp');

const MODE = (process.env.VOICE_TTS_MODE || 'hybrid').toLowerCase();
const PV_URL = (process.env.PRIME_VOICE_URL || 'http://127.0.0.1:4020').replace(/\/+$/, '');
const PV_KEY = process.env.PRIME_VOICE_ENGINE_KEY || '';
const KOKORO_VOICE = process.env.KOKORO_VOICE || 'af_heart';
const RENDER_TIMEOUT_MS = Number(process.env.VOICE_TTS_TIMEOUT_MS || 25000);
const PUBLIC_BASE = (process.env.VOICE_AUDIO_PUBLIC_BASE || '').replace(/\/+$/, '');
const TMP_TTL_MS = Number(process.env.VOICE_AUDIO_TTL_MS || 30 * 60e3);

const log = (...a) => console.log(`[settle-voice ${new Date().toISOString()}]`, ...a);
const warn = (...a) => console.warn(`[settle-voice ${new Date().toISOString()}]`, ...a);

for (const d of [AUDIO_DIR, CACHE_DIR, TMP_DIR]) {
  try { mkdirSync(d, { recursive: true }); } catch { /* fine */ }
}

export const ttsConfigured = MODE === 'basic' || MODE === 'neural' || PUBLIC_BASE.length > 0;

// ── Kokoro render (prime-voice, OpenAI contract) ──────────────────────────

const pending = new Map(); // textKey → Promise<path|null>

function keyFor(text) {
  return createHash('sha1').update(`${KOKORO_VOICE}${text}`).digest('hex') + '.wav';
}

/** POST to prime-voice. Returns audio Buffer or throws. */
async function synth(text) {
  const res = await fetch(`${PV_URL}/v1/audio/speech`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Engine-Key': PV_KEY,
    },
    body: JSON.stringify({ input: text, voice: KOKORO_VOICE, response_format: 'wav' }),
    signal: AbortSignal.timeout(RENDER_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`prime-voice ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100) throw new Error('prime-voice empty audio');
  return buf;
}

function atomicWrite(path, buf) {
  const tmp = path + '.part';
  writeFileSync(tmp, buf);
  renameSync(tmp, path);
}

/**
 * Render text into audio/cache/<sha>.wav — returns the filename on success,
 * null on any failure. Dedupes concurrent renders of the same line.
 */
export function renderToCache(text) {
  const name = keyFor(text);
  const path = join(CACHE_DIR, name);
  if (existsSync(path)) return Promise.resolve(name);
  if (pending.has(name)) return pending.get(name);
  const p = (async () => {
    try {
      const t0 = Date.now();
      const buf = await synth(text);
      atomicWrite(path, buf);
      log(`kokoro cache render ${name} ${buf.length}B in ${Date.now() - t0}ms`);
      return name;
    } catch (e) {
      warn(`kokoro render failed (${e.message})`);
      return null;
    } finally {
      pending.delete(name);
    }
  })();
  pending.set(name, p);
  return p;
}

/** Render text into audio/tmp/<rand>.wav — for one-shot dynamic lines. */
async function renderToTmp(text) {
  const buf = await synth(text);
  const name = `t-${randomBytes(12).toString('hex')}.wav`;
  atomicWrite(join(TMP_DIR, name), buf);
  return name;
}

// ── SSML for premium speak ────────────────────────────────────────────────
// Punctuation already carries the rhythm; we only widen the pauses a touch
// and slow the overall rate 2% so it breathes like a person on the phone.

export function toSsml(text) {
  const esc = String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const paced = esc
    .replace(/\s*(?:—|–|-{2,})\s*/g, ' <break time="300ms"/> ')
    .replace(/(?:\.\.\.|…)/g, ' <break time="350ms"/> ')
    .replace(/,\s+/g, ', <break time="160ms"/> ')
    .replace(/\?\s+/g, '? <break time="260ms"/> ')
    .replace(/\.\s+/g, '. <break time="220ms"/> ');
  return `<speak><prosody rate="98%">${paced.trim()}</prosody></speak>`;
}

// ── The one entry point the call loop uses ────────────────────────────────

/**
 * Say `text` into the call. Returns the engine actually used
 * ('kokoro' | 'neural' | 'basic'). Throws only if EVERY path failed —
 * callers already treat a throw as a degraded call.
 */
export async function say(ccid, text, { cacheable = false } = {}) {
  // ── Kokoro mode → always render + playback_start (blocking; the whole
  //    point of the mode. Timeout inside synth keeps the wait bounded). ──
  if (MODE === 'kokoro') {
    try {
      const t0 = Date.now();
      const name = cacheable ? await renderToCache(text) : await renderToTmp(text);
      if (name && PUBLIC_BASE) {
        await playbackStart(ccid, `${PUBLIC_BASE}/${name}`);
        log(`tts kokoro(${name}) ${Date.now() - t0}ms`);
        return 'kokoro';
      }
      warn('kokoro render produced no file or PUBLIC_BASE unset — falling back');
    } catch (e) {
      warn(`kokoro path failed, falling back to speak (${e.message})`);
    }
  }

  // ── Hybrid mode → Kokoro ONLY if this line is already cached (never
  //    block the call on a render); queue the background render so the
  //    next call plays the file. ──
  if (MODE === 'hybrid' && cacheable) {
    const name = keyFor(text);
    if (PUBLIC_BASE && existsSync(join(CACHE_DIR, name))) {
      try {
        await playbackStart(ccid, `${PUBLIC_BASE}/${name}`);
        log(`tts kokoro-cache(${name})`);
        return 'kokoro';
      } catch (e) {
        warn(`playback_start failed, falling back to speak (${e.message})`);
      }
    } else {
      void renderToCache(text); // background — next call gets Kokoro
    }
  }

  // ── Premium neural speak (default + fallback) ──
  if (MODE !== 'basic') {
    try {
      const t0 = Date.now();
      await speak(ccid, toSsml(text), { payloadType: 'ssml', serviceLevel: 'premium' });
      log(`tts neural ${Date.now() - t0}ms`);
      return 'neural';
    } catch (e) {
      warn(`premium speak failed, trying basic (${e.message})`);
    }
  }

  // ── Legacy basic speak — last resort, never dead air. Basic level only
  //    takes the built-in female/male voices, not Polly.* names. ──
  await speak(ccid, text, {
    serviceLevel: 'basic',
    voice: process.env.TELNYX_BASIC_VOICE || 'female',
    payloadType: 'text',
  });
  return 'basic';
}

/** Queue background renders for the fixed compliance/opener lines. */
export function prewarm(staticLines) {
  if (MODE !== 'hybrid' && MODE !== 'kokoro') return;
  log(`tts prewarm: ${staticLines.length} static lines → kokoro cache`);
  void (async () => {
    for (const line of staticLines) {
      try { await renderToCache(line); } catch { /* logged inside */ }
    }
    log('tts prewarm complete');
  })();
}

// ── Local file serving (settle-api proxies this publicly) ─────────────────

const NAME_RE = /^[a-zA-Z0-9-]{6,80}\.(wav|mp3|m4a)$/;

export function serveAudioFile(name, res) {
  if (!NAME_RE.test(name) || name.includes('..')) return false;
  for (const base of [TMP_DIR, CACHE_DIR]) {
    const p = join(base, name);
    try {
      const st = statSync(p);
      if (!st.isFile()) continue;
      res.writeHead(200, {
        'Content-Type': name.endsWith('.mp3') ? 'audio/mpeg'
          : name.endsWith('.m4a') ? 'audio/mp4' : 'audio/wav',
        'Content-Length': st.size,
        'Cache-Control': 'private, max-age=60',
      });
      createReadStream(p).pipe(res);
      return true;
    } catch { /* try next dir */ }
  }
  return false;
}

/** Drop tmp files older than the TTL. Called on a timer from server.mjs. */
export function sweepTmp() {
  try {
    const cutoff = Date.now() - TMP_TTL_MS;
    for (const f of readdirSync(TMP_DIR)) {
      try { if (statSync(join(TMP_DIR, f)).mtimeMs < cutoff) unlinkSync(join(TMP_DIR, f)); }
      catch { /* gone */ }
    }
  } catch { /* dir missing */ }
}
