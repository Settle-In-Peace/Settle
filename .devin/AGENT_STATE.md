# Agent State — shared worklog for concurrent agents

Multiple agents work on this repo at once. **Read this file before starting any task** and update it as you work so other agents don't collide with you.

## Protocol

1. **Before starting**: scan "Active" below for overlapping files/features. If someone claimed your area, pick non-overlapping files or wait.
2. **Claim your work**: add a line under "Active" — `[date] agent-name — task — files/dirs you're touching`.
3. **While working**: prefer small commits pushed frequently so others can `git pull` — long-lived uncommitted work is what causes collisions.
4. **When done**: move your line to "Recently landed" with the commit hash, and remove stale claims.
5. **Blockers that need the human**: put them in "Blocked on user" so any agent can surface them.

## Active

| Agent | Task | Files/areas |
|---|---|---|
| devin-settle | full audit + P0/P1 fixes | whole repo |
| devin-settle-payments | high-risk processor layer | settle-api/src/payment-processors/** (new), settle-api/src/entities/processor-payment.entity.ts (new), settle-api/src/migrations/1700000000034-* (new), settle-web/src/components/payments/** (new), settle-web collections page payments tab |

## Blocked on user

- **Dialer module wiring**: `DialerModule` + `DialerCall` entity need registering in `app.module.ts`/`data-source.ts`, and `CreateDialerCalls1700000000035` in `migrations/run-migration.ts` (snippets are commented at the top of `settle-api/src/dialer/dialer.module.ts`). Until wired, `/dialer/*` is not mounted.
- **Telnyx Call Control config**: `TELNYX_CONNECTION_ID` (Call Control app) is required for outbound calls; `TELNYX_PUBLIC_KEY` for webhook signature verification on `POST /dialer/webhooks/telnyx`; set `PUBLIC_API_URL` (or `TELNYX_CALL_WEBHOOK_URL`) so the provider knows where to send call events. Enable "record from answer" on the Call Control app for recordings.
- **ViciDial host/creds** (free/self-hosted dialer option): set `DIALER_PROVIDER=vicidial` + `VICIDIAL_BASE_URL`, `VICIDIAL_API_USER`, `VICIDIAL_API_PASS`, `VICIDIAL_AGENT_USER` (optionally `VICIDIAL_SOURCE`, `VICIDIAL_LIST_ID`, `VICIDIAL_PHONE_CODE`). ⚠️ The ViciDial adapter paths are UNTESTED against a live cluster — verify before production use.
- **MyFreeScoreNow sandbox activation**: set `MFSN_API_USER` (or `MFSN_API_EMAIL`) + `MFSN_API_PASSWORD` env vars on settle-api (values are in the MyFreeScoreNow affiliate dashboard → API section). Until set, `/credit-bureau/*` returns 503 "not configured" and the web UI shows a setup hint.
- **MyFreeScoreNow endpoint spec**: credit-pull paths (`/api/credit-snapshot`, `/api/funding-snapshot`, `/api/3b-reports`) and the login path are best-guess defaults — only the API-user+password→token exchange is publicly documented. Confirm real paths/payloads in the dashboard API docs and set `MFSN_LOGIN_PATH` / `MFSN_*_PATH` env vars accordingly (no code change needed).
- **MyFreeScoreNow production**: requires submitting verification documents in the affiliate dashboard (out of scope for the integration). Set `MFSN_ENV=production` once approved.
- **Lead vendor credentials**: no real vendor accounts yet. To enable a vendor (boberdoo / LeadsPedia / LeadProsper / etc.), set `LEADVENDOR_NAMES=<name>` plus `LEADVENDOR_<NAME>_PING_URL`/`_POST_URL`/`_ORDER_URL`/`_KEY` (auth style via `_AUTH`, wire format via `_FORMAT`) on settle-api — see `.env.example`. For inbound delivery, set `LEADVENDOR_<NAME>_WEBHOOK_SECRET` and point the vendor at `POST /lead-vendors/import/webhook?vendor=<name>` with `X-Lead-Vendor-Signature` (HMAC-SHA256 of raw body). Until configured, `/lead-vendors` shows "not configured" and purchase returns 503.

## Recently landed

- 2026-10-02 — **devin-settle-leads — lead-vendor/lead-purchase integration layer** (`eebdeb1` API+entities+migration+tests, web UI commit next). New dir `settle-api/src/lead-vendors/**` (provider interface, generic ping/post adapter, registry, HMAC webhook, CSV import, dedupe, scoring stub, assign-to-collections), new entities `lead_vendor_accounts`/`lead_import_batches`/`lead_purchases` + `leads` vendor columns, migration `1700000000033`, `settle-web/src/app/leads/**` + nav link. `LeadVendorsModule` registration snippet in `settle-api/src/lead-vendors/REGISTRATION.md` (app.module/data-source/main.ts edits are for the orchestrator).
- 2026-10-02 — **devin-settle-dialer — provider-agnostic dialer module** (`4b92246` API module+migration+specs, `927b278` web UI+env docs). Touched `settle-api/src/dialer/**` (new), `settle-api/src/migrations/1700000000035-CreateDialerCalls.ts` (new), `settle-api/.env.example` (append), `settle-web/src/lib/dialer.ts` (new), `settle-web/src/components/dialer/DialerPanel.tsx` (new), `settle-web/src/app/collections/page.tsx` (calls-tab JSX only). NOT wired into app.module/data-source/run-migration — see Blocked on user.
- 2026-10-02 — **devin-settle-credit — MyFreeScoreNow credit integration hardening + web UI** (`175c8e2` API/provider/sdk, `5cc5b2f` web). Touched `settle-api/src/credit-bureau/**`, `settle-api/.env.example`, `packages/shared-sdk/src/api/index.ts`, `settle-web/src/lib/api.ts`, `settle-web/src/components/CreditReportsPanel.tsx` (new), `settle-web/src/app/collections/page.tsx` (creditReports tab JSX only).
- 2026-10-02 — **AGENT_STATE.md established** (adopting the Prime/Dexana multi-agent coordination convention).
