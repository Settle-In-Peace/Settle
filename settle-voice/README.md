# settle-voice

SI-powered outbound AI lead caller for Settle In Peace. Lean plain-Node
service (one dep: `postgres`) — runs as pm2 `settle-voice` on the oracle
box and is only reachable internally (settle-api proxies to it).

## Pipeline

```
admin dialer UI → POST /dialer/voice-call (JWT, DialerAccessGuard)
  → settle-api gates: E.164 + routable + DNC + do-not-call + litigator
    scrub + consent (stored consent log or agent attestation)
  → POST settle-voice /calls (x-voice-key)
    → re-runs every gate against the DB (defense in depth)
    → Telnyx originate (webhook_url → settle-api /dialer/webhooks/voice-telnyx)
    → call.answered → speak (AI disclosure + first question)
      + transcription_start (inbound track, Telnyx STT engine)
    → call.transcription {transcription_data.transcript, is_final}
        → opt-out keywords  → crm_dnc_list row + ack + hangup
        → handoff keywords  → specialist-callback line + hangup
        → else              → si-gateway chat → speak(reply) → loop
    → call.speak.ended → hangup after a closing line finishes playing
    → call.hangup → voice_calls row finalized
```

STT uses Telnyx `transcription_start` (built-in `Telnyx` engine on the call
leg, inbound track only). Set `VOICE_STT_ENGINE=Google` to switch engines.

### TTS — `VOICE_TTS_MODE` (default `hybrid`)

| Mode | How it sounds |
|---|---|
| `neural` | Telnyx premium `speak` — AWS Polly `*-Neural` voice + SSML pacing. Instant, carrier-rendered. |
| `kokoro` | Every line rendered by prime-voice (Kokoro ONNX) → file → `playback_start`. Best quality, needs local CPU headroom. |
| `hybrid` | Kokoro file for already-cached static lines (disclosure/closers pre-rendered at boot), neural speak for dynamic replies. **Default.** |
| `basic` | Legacy free `speak` voice `female` — debugging only. |

Every mode falls back down the chain on failure — never dead air.
Rendered files live in `settle-voice/audio/{cache,tmp}/` (gitignored); tmp
files are swept after 30 min. settle-api exposes them to Telnyx at
`GET /dialer/voice-audio/<name>` (unguessable names, strict regex).

## Compliance (debt relief is regulated)

- **Consent-gated only — never cold-call.** `crm_consent_logs` (TCPA,
  unexpired, <12mo) or `leads.tcpaConsent`+`consentTimestamp`, or an agent
  attestation recorded on the call row.
- **AI disclosure first** — every answered call opens with a hardcoded
  "automated assistant calling on behalf of Settle In Peace" line.
- **Human handoff** — "agent/person/human/…" ends the AI turn; the call is
  flagged `handoff_requested`.
- **Opt-out** — "do not call/stop calling/…" writes `crm_dnc_list`
  (source `customer_request`) so every dialer path blocks the number.
- **No advice** — the SI prompt is intro + qualification + "a specialist
  will call you back" only. No settlement terms, savings, or legal advice.

## Env (oracle `~/apps/Settle/settle-voice/.env`)

| Var | Source |
|---|---|
| `PORT` | `4027` |
| `DATABASE_URL` | same as settle-api |
| `TELNYX_API_KEY` / `TELNYX_FROM_NUMBER` / `TELNYX_CONNECTION_ID` / `TELNYX_PUBLIC_KEY` | same as settle-api |
| `VOICE_WEBHOOK_URL` | `https://api.settleinpeace.com/dialer/webhooks/voice-telnyx` |
| `SETTLE_VOICE_KEY` | shared with settle-api (`x-voice-key`) |
| `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` | si-gateway (`http://localhost:4030/v1`, `si`) |
| `TELNYX_SPEAK_VOICE` | optional, default `Polly.Joanna-Neural` (premium neural) |
| `TELNYX_SPEAK_LEVEL` | optional, default `premium` |
| `VOICE_TTS_MODE` | optional, default `hybrid` (`neural`/`kokoro`/`basic`) |
| `PRIME_VOICE_URL` | optional, default `http://127.0.0.1:4020` (Kokoro engine) |
| `PRIME_VOICE_ENGINE_KEY` | X-Engine-Key for prime-voice |
| `KOKORO_VOICE` | optional, default `af_heart` |
| `VOICE_TTS_TIMEOUT_MS` | optional Kokoro render budget, default `25000` |
| `VOICE_AUDIO_PUBLIC_BASE` | `https://api.settleinpeace.com/dialer/voice-audio` |
| `VOICE_STT_ENGINE` | optional, default `Telnyx` (`Google` fallback) |
| `VOICE_MAX_TURNS` | optional, default `6` |
| `VOICE_AMD` | optional, default `detect` |

settle-api side needs `SETTLE_VOICE_URL=http://localhost:4027` +
`SETTLE_VOICE_KEY=<same>`.

## Local dev

```bash
pnpm --filter settle-voice install
cd settle-voice && PORT=4027 node server.mjs
curl localhost:4027/health
```

## Deploy (oracle)

```bash
rsync -az settle-voice/ oracle:~/apps/Settle/settle-voice/ \
  --exclude node_modules
ssh oracle 'export PATH=/home/opc/runtime/node/bin:$PATH;
  cd ~/apps/Settle/settle-voice && pnpm install --prod &&
  pm2 start server.mjs --name settle-voice && pm2 save'
```
