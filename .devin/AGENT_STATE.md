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

## Blocked on user

- **Dialer module wiring**: `DialerModule` + `DialerCall` entity need registering in `app.module.ts`/`data-source.ts`, and `CreateDialerCalls1700000000035` in `migrations/run-migration.ts` (snippets are commented at the top of `settle-api/src/dialer/dialer.module.ts`). Until wired, `/dialer/*` is not mounted.
- **Telnyx Call Control config**: `TELNYX_CONNECTION_ID` (Call Control app) is required for outbound calls; `TELNYX_PUBLIC_KEY` for webhook signature verification on `POST /dialer/webhooks/telnyx`; set `PUBLIC_API_URL` (or `TELNYX_CALL_WEBHOOK_URL`) so the provider knows where to send call events. Enable "record from answer" on the Call Control app for recordings.
- **ViciDial host/creds** (free/self-hosted dialer option): set `DIALER_PROVIDER=vicidial` + `VICIDIAL_BASE_URL`, `VICIDIAL_API_USER`, `VICIDIAL_API_PASS`, `VICIDIAL_AGENT_USER` (optionally `VICIDIAL_SOURCE`, `VICIDIAL_LIST_ID`, `VICIDIAL_PHONE_CODE`). ⚠️ The ViciDial adapter paths are UNTESTED against a live cluster — verify before production use.
- **Payment processor module wiring**: `PaymentProcessorsModule` landed (`adac6c2`) but is NOT registered — apply the snippets in `settle-api/src/payment-processors/README.md`: `PaymentProcessorsModule` + `ProcessorPayment` entity in `app.module.ts`, entity in `data-source.ts`, `CreateProcessorPaymentsTable1700000000034` in `migrations/run-migration.ts`, and `path.startsWith('/payment-processors/webhooks')` in `main.ts`'s `isRawBodyWebhookRoute` (required for NMI HMAC verification — it fails closed otherwise). Until wired, `/payment-processors/*` is not mounted.
- **NMI merchant account**: after wiring, set `NMI_SECURITY_KEY`, `NMI_PUBLIC_KEY` (Collect.js tokenization key), `NMI_WEBHOOK_SECRET` (Settings → Webhooks signing key) on settle-api; `NMI_ENV=sandbox` default (sandbox.nmi.com) / `production` → secure.nmi.com. Until set, the Take Payment panel shows "not configured" and charges return 503.
- **High-risk gateway boarding**: debt collection is a high-risk MCC — an acquiring-bank merchant account on the NMI (or AuthNet) gateway must be boarded via merchant services; not a code task. AuthNet adapter (`AUTHNET_API_LOGIN_ID`/`AUTHNET_TRANSACTION_KEY`/`AUTHNET_CLIENT_KEY`/`AUTHNET_SIGNATURE_KEY`) is implemented but UNTESTED against sandbox.authorize.net.
- **MyFreeScoreNow sandbox activation**: set `MFSN_API_USER` (or `MFSN_API_EMAIL`) + `MFSN_API_PASSWORD` env vars on settle-api (values are in the MyFreeScoreNow affiliate dashboard → API section). Until set, `/credit-bureau/*` returns 503 "not configured" and the web UI shows a setup hint.
- **MyFreeScoreNow endpoint spec**: credit-pull paths (`/api/credit-snapshot`, `/api/funding-snapshot`, `/api/3b-reports`) and the login path are best-guess defaults — only the API-user+password→token exchange is publicly documented. Confirm real paths/payloads in the dashboard API docs and set `MFSN_LOGIN_PATH` / `MFSN_*_PATH` env vars accordingly (no code change needed).
- **MyFreeScoreNow production**: requires submitting verification documents in the affiliate dashboard (out of scope for the integration). Set `MFSN_ENV=production` once approved.
- **Lead vendor credentials**: no real vendor accounts yet. To enable a vendor (boberdoo / LeadsPedia / LeadProsper / etc.), set `LEADVENDOR_NAMES=<name>` plus `LEADVENDOR_<NAME>_PING_URL`/`_POST_URL`/`_ORDER_URL`/`_KEY` (auth style via `_AUTH`, wire format via `_FORMAT`) on settle-api — see `.env.example`. For inbound delivery, set `LEADVENDOR_<NAME>_WEBHOOK_SECRET` and point the vendor at `POST /lead-vendors/import/webhook?vendor=<name>` with `X-Lead-Vendor-Signature` (HMAC-SHA256 of raw body). Until configured, `/lead-vendors` shows "not configured" and purchase returns 503.

## Recently landed

- 2026-10-02 — **devin-settle-payments — high-risk payment processor layer** (`adac6c2`). New: `settle-api/src/payment-processors/**` (provider iface, NMI provider + specs, AuthNet stub, Stripe fallback adapter, router service + specs, controller, module), `entities/processor-payment.entity.ts`, `migrations/1700000000034-CreateProcessorPaymentsTable.ts`, `settle-web/src/components/payments/TakePaymentPanel.tsx`. Touched: `settle-api/.env.example` (appended processor section), `settle-web/src/lib/api.ts` (appended section), `settle-web/src/app/collections/page.tsx` (payments tab JSX only). NOT wired into app.module/data-source/run-migration/main — see Blocked on user.
- 2026-10-02 — **devin-settle-leads — lead-vendor/lead-purchase integration layer** (`eebdeb1` API+entities+migration+tests, `5b6a299` web UI, `f63bca0` fixups). New dir `settle-api/src/lead-vendors/**` (provider interface, generic ping/post adapter, registry, HMAC webhook, CSV import, dedupe, scoring stub, assign-to-collections), new entities `lead_vendor_accounts`/`lead_import_batches`/`lead_purchases` + `leads` vendor columns, migration `1700000000033`, `settle-web/src/app/leads/**` + nav link. `LeadVendorsModule` registration snippet in `settle-api/src/lead-vendors/REGISTRATION.md` (app.module/data-source/main.ts edits are for the orchestrator).
- 2026-10-02 — **devin-settle-dialer — provider-agnostic dialer module** (`4b92246` API module+migration+specs, `927b278` web UI+env docs). Touched `settle-api/src/dialer/**` (new), `settle-api/src/migrations/1700000000035-CreateDialerCalls.ts` (new), `settle-api/.env.example` (append), `settle-web/src/lib/dialer.ts` (new), `settle-web/src/components/dialer/DialerPanel.tsx` (new), `settle-web/src/app/collections/page.tsx` (calls-tab JSX only). NOT wired into app.module/data-source/run-migration — see Blocked on user.
- 2026-10-02 — **devin-settle-credit — MyFreeScoreNow credit integration hardening + web UI** (`175c8e2` API/provider/sdk, `5cc5b2f` web). Touched `settle-api/src/credit-bureau/**`, `settle-api/.env.example`, `packages/shared-sdk/src/api/index.ts`, `settle-web/src/lib/api.ts`, `settle-web/src/components/CreditReportsPanel.tsx` (new), `settle-web/src/app/collections/page.tsx` (creditReports tab JSX only).
- 2026-10-02 — **AGENT_STATE.md established** (adopting the Prime/Dexana multi-agent coordination convention).
