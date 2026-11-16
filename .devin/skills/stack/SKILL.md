---
name: stack
description: Settle architecture and deployment truth — Next.js/OpenNext web on Cloudflare Workers + API on the Oracle box behind a Cloudflare tunnel + external Postgres + Firebase phone auth option. Use for ANY settle-web or settle-api task before writing code or deploying — deploy commands, health-check path quirks, and the retired-platform warnings.
triggers:
  - user
  - model
---

# Settle Stack — what actually runs where

Monorepo: `settle-web` (Next.js **16.3.5** — breaking changes vs. training data; read `node_modules/next/dist/docs/` before coding), `settle-api`. **pnpm >= 9** only (prefer 9.15.5), Node >= 22.

## Web — Cloudflare Workers (OpenNext)

- Worker `settleinpeace` serves `https://settleinpeace.settleinpeace.workers.dev` (+ zone). CF account `23b969235059f30399650fc6ae16b77a` (Settleinpeacenow@gmail.com); workers.dev subdomain `settleinpeace`.
- Runtime: `nodejs_compat`, compat date `2025-01-01`. Config: `wrangler.jsonc`, `open-next.config.ts`, `scripts/cf-build.sh`.
- Deploy: `cd settle-web && pnpm cf:build && pnpm cf:deploy` (needs `CLOUDFLARE_API_TOKEN` env — never commit it).
- Worker secrets (Firebase vars) set via CF API: `PUT /accounts/.../workers/scripts/settleinpeace/secrets`.

## API — Oracle box behind Cloudflare tunnel

- `api.settleinpeace.com` → cloudflared tunnel `a202a286-ecde-43a3-89d3-64f481763d43` → `localhost:4025` → pm2 `settle-api`.
- Host: `ssh oracle`; app dir `/home/opc/apps/Settle/settle-api`; env in `.env` **on the box** (NOT local repo `.env`).
- Deploy: `cd settle-api && pnpm build` → `rsync -az --delete dist/ oracle:/home/opc/apps/Settle/settle-api/dist/` → `ssh oracle 'export PATH=/home/opc/runtime/node/bin:/usr/bin:/bin:/usr/sbin:/sbin && pm2 restart settle-api'`. **Never `pm2 restart --update-env`** — it clobbers PATH.
- **Health check is `/health` on :4025** (returns `db: connected`) — `/api/health` 404s, don't be fooled.
- Migrations auto-run at boot — build + restart applies them.
- Database: external PostgreSQL via `DATABASE_URL` in the oracle `.env`.
- **opsbox is RETIRED as API host** (oracle live since 2026-11-04). **Render + Railway RETIRED** — configs removed; never redeploy them.

## Auth/SMS providers

- SMS: **Telnyx only** (`TELNYX_API_KEY`, `TELNYX_FROM_NUMBER`). Never Twilio.
- Phone OTP alternative: **Firebase Phone Auth** allowed — `FIREBASE_SERVICE_ACCOUNT` server-side, `NEXT_PUBLIC_FIREBASE_*` client-side.

## Verification checklist before claiming done

- API: rsync + pm2 restart → `ssh oracle 'curl -s localhost:4025/health'` → 200 `db: connected`, then `https://api.settleinpeace.com/health` through the tunnel + exercise the changed endpoint.
- Web: cf:build + cf:deploy → record worker version → 200 on the real URL + spot-check changed route.
