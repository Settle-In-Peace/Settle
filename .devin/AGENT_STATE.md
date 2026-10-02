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

- **MyFreeScoreNow sandbox activation**: set `MFSN_API_USER` (or `MFSN_API_EMAIL`) + `MFSN_API_PASSWORD` env vars on settle-api (values are in the MyFreeScoreNow affiliate dashboard → API section). Until set, `/credit-bureau/*` returns 503 "not configured" and the web UI shows a setup hint.
- **MyFreeScoreNow endpoint spec**: credit-pull paths (`/api/credit-snapshot`, `/api/funding-snapshot`, `/api/3b-reports`) and the login path are best-guess defaults — only the API-user+password→token exchange is publicly documented. Confirm real paths/payloads in the dashboard API docs and set `MFSN_LOGIN_PATH` / `MFSN_*_PATH` env vars accordingly (no code change needed).
- **MyFreeScoreNow production**: requires submitting verification documents in the affiliate dashboard (out of scope for the integration). Set `MFSN_ENV=production` once approved.

## Recently landed

- 2026-10-02 — **devin-settle-credit — MyFreeScoreNow credit integration hardening + web UI** (`175c8e2` API/provider/sdk, `5cc5b2f` web). Touched `settle-api/src/credit-bureau/**`, `settle-api/.env.example`, `packages/shared-sdk/src/api/index.ts`, `settle-web/src/lib/api.ts`, `settle-web/src/components/CreditReportsPanel.tsx` (new), `settle-web/src/app/collections/page.tsx` (creditReports tab JSX only).
- 2026-10-02 — **AGENT_STATE.md established** (adopting the Prime/Dexana multi-agent coordination convention).
