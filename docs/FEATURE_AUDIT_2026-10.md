# Feature Audit — Missing / Incomplete Surfaces

> Date: 2026-10-25 · Agent: devin-feature-audit · Builds on funnel audit `43cd492`/`047232c` (lead capture, client portal, coaching billing — not re-audited).
> Method: every UI route + nav/sidebar item traced to an API endpoint; live probes against `settleinpeace.com` + `api.settleinpeace.com`.

## Verdict

Every nav/sidebar/portal link resolves to a real page, and every page's data calls resolve to a real API route — **no 404 links or dead-end nav items exist**. The gaps are deeper: API-complete features with **no UI** (seat checkout, deposits, DNC, payment portal), **cosmetic gating** (coaching), and one **prod-dead path** (AI chat upstream).

## Feature matrix

| Surface | Route(s) | Backend | State |
|---|---|---|---|
| Marketing home / SEO | `/`, `/debt-relief/**`, `/learn/**`, `/tools/eligibility-checker` | n/a | ✅ live (174 city + 51 state + learn verified earlier) |
| Assessment funnel | `/assessment` | `POST /leads/assessment` | ✅ verified 201 in prod (funnel audit) |
| AI chat assessment | `/assessment/chat` | `POST /ai/chat` → `POST /leads/assessment` | ⚠️ **wired but prod-broken** — LLM upstream fails (gap #1) |
| Debt snapshot + nurture | `/debt-snapshot` | `POST /nurture/subscribe`, `GET /nurture/unsubscribe` | ✅ |
| Calculators | `/calculators` | (client-side math) | ✅ — `POST /coaching/calculators/*` API exists but is dead code |
| Compare / contact | `/compare` | `GET /providers`, `POST /matching/request-contact` | ✅ |
| Provider marketing/signup | `/providers` | `POST /providers/signup` (pending → admin approve) | ✅ page works; ⚠️ price copy vs tier mismatch (gap #2) |
| Community | `/questions`, `/roadmap`, FeedbackWidget | `/questions*`, `/feedback*` | ✅ live (200 probes) |
| Auth | `/login` `/register` `/forgot-password` `/reset-password` `/staff/login` | `/auth/*`, passkeys, OTP | ✅ Resend email OTP + Telnyx SMS OTP + Firebase alt |
| Consumer dashboard | `/dashboard` | `/auth/profile`, `/debts/progress`, `/activities` | ✅ — "Recent Activity" was a dead placeholder; **wired this audit** |
| Debts | `/debts` | `/debts` CRUD + `/debts/summary` | ✅ |
| Settings | `/settings` | `/auth/profile`, passkeys, sessions, phone OTP, delete acct, notification prefs | ✅ |
| Coaching | `/coaching` | `/coaching/dashboard` + budgets/goals CRUD + Stripe checkout/portal | ⚠️ **works end-to-end but NOT subscription-gated** (gap #3) |
| Client portal | `/settlement` | `GET /crm/portal/me/overview` + esign | ✅ deployed (401 unauth live) |
| Provider portal | `/portal` | `/providers/portal/stats`, `/matching/matched-leads`, `/leads/my-leads`, purchase/decline | ✅ |
| Provider billing | `/portal/billing` | `/stripe/checkout` (credits), `/stripe/billing-portal` | ⚠️ billing-history was a lying placeholder (fixed); **no seat checkout, no deposit UI** (gaps #2/#5) |
| Provider settings | `/portal/settings` | `GET /providers/:id`, `PUT /providers/profile` | ✅ |
| Admin | `/admin` | `/admin/{users,providers,leads,matches,sales-agents}` + `/billing/admin/deposits` | ✅ except no "create manual deposit" UI (gap #5) |
| Admin CRM | `/admin/crm` | `/crm/{pipeline,leads,clients,deals}` | ✅ |
| Admin sales | `/admin/sales`, `/admin/sales-agents` | `/admin/sales-agents`, `/admin/users`, assign endpoints | ✅ |
| CRM center | `/crm` | `/crm/dashboard`, `/crm/leads*` | ✅ (admin/lender/referral_manager) |
| Sales CRM | `/sales` | `/sales/leads*`, inbox, calendar, `/sales/leads/:id/{email,dial,call-log}` | ✅ Telnyx dial/email wired |
| Lead vendors | `/leads` | `/lead-vendors*` (import CSV, purchase, assign) | ✅ |
| Collections | `/collections` | `/collections*`, `/portfolios*`, `/payment-plans`, `/dialer*`, `/credit-bureau*`, `/payment-processors*`, `/collection-ai*` | ✅ except DNC registry UI (gap #7) |
| Debtor payment portal | — none — | `/portal/pay/:token` (+options/plan/payment/history) | 🔴 **fully orphaned** (gap #4) |

## Ranked gap list

### P1 — revenue-blocking / promised-but-broken

1. **AI assessment chat is dead in prod.** `POST /ai/chat` live-returns the upstream-error fallback ("I'm having trouble connecting…"). Code is fine — `LlmClientService` is OpenAI-compatible and fail-closed; the box's LLM just isn't reachable. Repo `.env` hints `AI_BASE_URL=http://localhost:11434/v1` + `AI_MODEL=qwen3:8b` (Ollama) — either Ollama isn't running on `Obduls-MBP` or the deployed env differs. **Alternatives (pick one):** (a) run Ollama + `qwen3:8b` on the Mac box as a pm2/launchd service — free, private, but RAM-heavy; (b) `AI_API_KEY` → OpenRouter (cheap, many models); (c) GitHub Models PAT (free gpt-4o-mini — commented option already in `.env`); (d) OpenAI key. Every chat turn also costs tokens — consider whether the marketing funnel justifies always-on LLM vs the standard 7-step form which already converts.
2. **Provider marketplace seat checkout has no UI.** `POST /stripe/provider-subscription` is complete (tiers starter $500/5 seats, growth $1,000/15, scale $2,500/50; 30-day trial; webhook + cancel/payment-failed emails; billing portal handles it) and `createProviderSubscriptionSession()` exists in `lib/api.ts` — **zero callers**. Compounding: `/providers` markets a "**$199/month** Marketplace Seat" (deliberate owner price cut, commit `7c0d4b4`) that matches **no Stripe tier**. Needs: a $199 price + tier in Stripe (or reprice copy), then a plan-picker → checkout UI in `/portal/billing` or post-signup onboarding.
3. **Coaching subscription is cosmetic gating.** `/coaching` budgets/goals/dashboard CRUD work for **any authenticated user** — `CoachingController` is `@UseGuards(JwtAuthGuard)` only, no subscription check, and the page renders the tools regardless of `subscription.status` (the paywall is just a CTA card). $49/mo buys nothing extra in-app. **Product decision needed:** add a subscription guard to budgets/goals/dashboard, or accept these as free tools and sell coaching on something else (human sessions? content?). Flag to owner — do NOT gate unilaterally.
4. **Debtor payment portal is fully orphaned.** `PaymentPortalModule` (`/portal/pay/:token` — account summary, payment options, create plan, one-time payment, history) is registered and live, but `customFields.portalAccessToken` is **never written anywhere in the codebase**, and no web page renders the token URL. Nothing can ever reach it. Either build token issuance (collections → SMS/email link via Telnyx/Resend) + a `/pay/[token]` page, or drop the module.

### P2 — API exists, no UI

5. **Provider deposit flow is half-built.** `POST /billing/deposits` (provider submits a deposit) + `GET /billing/deposits` (history) exist — no provider UI calls them. Admin side: approve/reject UI exists in `/admin`, but `POST /billing/admin/deposits` (manual deposit) has no UI either. Today only the banking webhook (`/billing/webhooks/banking`) can create a deposit.
6. **Provider billing history / credit ledger doesn't exist.** No endpoint lists credit purchases; `/portal/billing` previously hard-claimed "No transactions yet" — copy fixed this audit to point at Stripe receipts instead. Real fix needs a transactions endpoint (lead_purchase + deposit + checkout session data).
7. **DNC registry has no UI.** `GET/POST/DELETE /crm/debt-settlement/dnc*` + `dnc/check/:phone` exist; `/collections` only *displays* a `customFields.dnc` flag from imports — agents cannot add/remove numbers, and the dialer doesn't check the registry. TCPA-compliance gap.
8. **`smsNotifications` preference is write-only.** Stored on the user (`/settings` toggles it, auth persists it) but nothing sends account/notification SMS — Telnyx sends OTP codes and dialer calls only.

### P3 — dead code / copy drift

9. `POST /coaching/calculators/{debt-payoff,dti}` — uncalled (the `/calculators` page is client-side). Dead API surface behind JWT.
10. `POST /ai/recommendation` — uncalled by any web code. Dead until a recommendation UI exists.
11. `/providers` marketing price vs Stripe tiers (see gap #2) — also the "20% discount on lead purchases" seat perk claim is not implemented anywhere in lead pricing.
12. `GET /activities` had zero callers until this audit wired `/dashboard` → it. `POST /billing/admin/run-renewals` needs no UI (daily in-process scheduler exists).

### Confirmed NOT gaps

- Email sends for real: Resend `EmailService` backs auth OTP, lead-match notifications (provider), purchase confirmations, coaching welcome/cancel, payment-failed, nurture 7-email drip. SMS: Telnyx only (OTP + sales/collections click-to-dial). No Twilio anywhere.
- `POST /matching/request-contact` is public but covered by the global throttler.
- All auth surfaces incl. WebAuthn/passkeys, session revocation, account deletion are wired.
- `/crm/portal/me/overview` (funnel audit's fix) is live — 401 unauth, not 404.

## Fixes committed this audit

- `settle-web/src/app/dashboard/page.tsx` — "Recent Activity" dead placeholder → wired to `GET /activities` (auth already records login/register/profile events server-side).
- `settle-web/src/app/portal/billing/page.tsx` — replaced lying "No transactions yet" placeholder with honest copy pointing to Stripe receipts + support.
- Deleted `settle-api/src/probe-lead.ts` — diagnostic stub the funnel audit left behind (untracked).

## Not touched (other agents' work)

- Uncommitted settle-api changes in `ai/`, `matching`, `nurture`, `providers`, `telnyx` (devin-settle's in-flight hardening), `settle-mobile` colors, `scripts/mfsn/`.
