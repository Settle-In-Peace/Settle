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
    → call.answered → gather_using_speech (AI disclosure + first question)
    → call.gather.ended {speech.result}
        → opt-out keywords  → crm_dnc_list row + ack + hangup
        → handoff keywords  → specialist-callback line + hangup
        → else              → si-gateway chat → gather_using_speech(reply)
    → call.hangup → voice_calls row finalized
```

STT/TTS use Telnyx's built-in `gather_using_speech` + `speak` — no Deepgram
or separate TTS key required. (A `DEEPGRAM_API_KEY` media-fork pipeline is
a possible future upgrade; the current loop needs zero extra providers.)

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
| `TELNYX_SPEAK_VOICE` | optional, default `female` |
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
