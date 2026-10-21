
## Owner Identity (mandatory for all outbound communications)

- The owner's name is **Obdul Reid** — spelled O-B-D-U-L. Never "Abdul", never any other variant.
- Any email, letter, signature, or message signed on behalf of the owner MUST use "Obdul Reid". Verify the spelling before sending.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## SMS / Phone Authentication Providers

**Never use Twilio.**

### Direct SMS
- Use the Telnyx API (`https://api.telnyx.com/v2/messages`) for direct SMS/MMS.
- Env vars: `TELNYX_API_KEY`, `TELNYX_FROM_NUMBER`

### Phone OTP / Verification
- Telnyx remains the default backend-driven OTP provider.
- **Firebase Phone Authentication** may be used as an alternative for phone verification (especially when Telnyx is cost-prohibitive). It handles SMS delivery and reCAPTCHA client-side and is verified server-side with `firebase-admin`.
- Backend env var: `FIREBASE_SERVICE_ACCOUNT` (single-line service-account JSON)
- Frontend env vars: `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`

## Multi-Agent Coordination (mandatory)

- **Before starting any task, read `.devin/AGENT_STATE.md`** — active claims, recent landings, blockers.
- **Check `.devin/OWNER_FLAGS.md` + `.devin/OWNER_TASKS.md`** — the owner posts live issues and assigns tasks there from the command center (`opsbox`); treat new lines as priority work. FLAGS is read-only (sync overwrites — record actions in AGENT_STATE.md); for TASKS mark done lines `- [x]` so the sync reports completion.
- **Human-blocked?** append one line to `.devin/NEEDS_HUMAN.md` (`- <date> | <blocked> | needs: <action> | ref:`) — the owner's command center surfaces these as an action inbox; completed items get `[x]` on sync.

# Project Standardization

This project follows the standardization patterns defined in `docs/STANDARDIZATION_GUIDE.md` based on the Prime project architecture.

## Package Manager: pnpm

This project uses **pnpm** as the package manager (NOT npm or yarn).

**Requirements:**
- Node.js >= 22.0.0
- pnpm >= 9.0.0 (prefer 9.15.5)

**Always use pnpm commands:**
- `pnpm install` - Install dependencies
- `pnpm run dev` - Run development
- `pnpm run build` - Build project
- `pnpm add <package>` - Add dependency
- `pnpm add -D <package>` - Add dev dependency

**Never use npm or yarn commands.**

## Deployment Architecture

The project uses **Cloudflare Workers** for the frontend and **Render** for the backend API.

### Frontend: Cloudflare Workers (OpenNext)
- **Frontend** (`settle-web`) deploys to Cloudflare Workers via OpenNext (`@opennextjs/cloudflare`)
- **Account:** Settleinpeacenow@gmail.com (`23b969235059f30399650fc6ae16b77a`)
- **Worker:** `settleinpeace` — serves `https://settleinpeace.settleinpeace.workers.dev`
- **workers.dev subdomain:** `settleinpeace`
- **Runtime:** `nodejs_compat`, compatibility date `2025-01-01`
- **Deploy commands:** `cd settle-web && pnpm cf:build && pnpm cf:deploy`
- **Config files:** `wrangler.jsonc`, `open-next.config.ts`, `scripts/cf-build.sh`
- **OpenNext adapter:** `@opennextjs/cloudflare` (replaces deprecated `@cloudflare/next-on-pages`)
- **Next.js version:** 16.3.5 (required by OpenNext adapter >=16.3.3)
- **Worker secrets:** Firebase env vars set via Cloudflare API (`PUT /accounts/.../workers/scripts/settleinpeace/secrets`)
- **API token:** Stored in env var `CLOUDFLARE_API_TOKEN` for deploy (never commit)

### Backend: Render (API)
- **API service** — built from `settle-api/`, configured in `render.yaml`
- **Database** — external PostgreSQL (e.g., Supabase), connected via `DATABASE_URL` set in the Render dashboard

### Alternative: Railway (backend API)
- **API service** — built from `settle-api/`, uses `railway.toml` at repo root with the repo-level `Dockerfile`
- The database is the same external PostgreSQL instance configured via `DATABASE_URL`

### Legacy: Cloudflare Pages static export (not used)
- Set `CF_PAGES=1` or `OUTPUT_EXPORT=1` during the build to enable static export (`output: "export"` in `settle-web/next.config.ts`)
- Use `public/_redirects` and `public/_headers` for redirects and headers
- Superseded by the OpenNext Workers deployment above

## Port Assignments

**Development Port Assignments:**
- **Frontend (settle-web)**: Port 3025
- **Backend (settle-api)**: Port 4025

**Production URLs:**
- **Frontend**: `https://settleinpeace.settleinpeace.workers.dev` (or custom domain)
- **Backend**: `https://api.settleinpeace.com` (Render)

**Environment Variables:**
- `NEXT_PUBLIC_API_URL`: Backend API URL for frontend
- `DATABASE_URL`: PostgreSQL connection string for backend
- `JWT_SECRET`: JWT secret for token generation
- `JWT_REFRESH_SECRET`: JWT refresh token secret

## Key Patterns

1. **Shared SDK**: Use `@settle/shared-sdk` for authentication, API clients, and types
2. **Authentication**: Follow the flows documented in `docs/FLOWS.md`
3. **API Responses**: Profile responses are flat (not nested under `user` object)
4. **Token Storage**: Web uses localStorage, mobile uses AsyncStorage
5. **Health Endpoints**: `/health` and `/` for Railway health checks
6. **File Storage**: Use Railway-compatible storage solutions (local volumes, S3-compatible services)

## Critical Files to Read Before Changes

- `docs/FLOWS.md` - Authentication flows, API shapes, critical gotchas
- `docs/STANDARDIZATION_GUIDE.md` - Standard patterns across projects
- `docs/DATABASE_STORAGE_ARCHITECTURE.md` - Database and storage architecture
- `packages/shared-sdk/` - Shared authentication and API utilities

## macOS Metadata Files Prevention

This project has comprehensive, permanent protection against macOS metadata files (._*):

### Prevention Layers

1. **Git hooks**: Multiple hooks prevent ._ files from being committed or pushed
2. **Auto-cleanup**: Hooks automatically clean ._ files on commit, checkout, and merge
3. **Git ignores**: All .gitignore files exclude ._ patterns and other macOS metadata
4. **Cleanup command**: Run `pnpm run clean:mac-files` to manually clean
5. **macOS config**: Run `./scripts/configure-macos.sh` to reduce ._ file creation at system level

### Git Hooks

- **pre-commit**: Blocks ._ files from being committed and auto-cleans them
- **post-commit**: Auto-cleans ._ files after commit
- **post-checkout**: Auto-cleans ._ files after checkout
- **post-merge**: Auto-cleans ._ files after merge
- **pre-push**: Blocks ._ files from being pushed

### System Configuration

Run `./scripts/configure-macos.sh` to configure macOS to prevent ._ file creation:
- Disables ._ files on network volumes
- Disables ._ files on USB drives
- Disables ._ files on external drives
- Disables Spotlight indexing for external drives

### Manual Cleanup

If you encounter ._ files, run:
```bash
pnpm run clean:mac-files
```

The git hooks will automatically prevent them from being committed and clean them on every git operation.

## Browser Automation (mandatory)

- **Brave only — never Chrome/Chromium.** Playwright/Puppeteer must launch `executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'` (no Chrome channel/Chrome-for-Testing). Clone the Brave profile to a temp dir for sessions; never use the live profile while Brave is running; delete clones after use.
