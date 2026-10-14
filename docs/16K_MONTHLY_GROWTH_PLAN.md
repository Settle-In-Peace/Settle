# Settle — $16,000/Month Revenue Growth Plan

> **Model:** Debt-relief **marketplace / affiliate-referral** business. Settle does **not** settle debt directly. We earn when we match financially distressed consumers with vetted, licensed third-party debt relief, consolidation, and financial-coaching providers.
> **Resources:** bootstrap only — agents + organic acquisition (SEO, social, outreach). No ad spend assumed; paid search/social becomes an optional accelerator only after organic channels show converting traffic.
> **Last verified:** 2026-10-21 (live probes, not assumptions)

---

## 0. Status Snapshot — verified live state

| Piece | State | Evidence |
|---|---|---|
| Web (Cloudflare Worker `settleinpeace`) | ✅ `settleinpeace.com` → 200 | live probe |
| API (Render `settle-api`) | ✅ `api.settleinpeace.com/health` → 200 | live probe |
| Sitemap | ✅ `/sitemap.xml` → 200 | live probe; includes 51 state pages + learn hub |
| SEO content surface | ✅ 51 state debt-relief pages, statute-of-limitations data, FAQ JSON-LD, AG/CFPB/211/NFCC links, `/learn/*` fixed (was hard-404ing — `dynamicParams` removed) | landed Oct 20 |
| Social autoposter | ⚠️ Built + seeded, **not publishing** — platform secrets missing (X/Bluesky/LinkedIn/FB/Mastodon/Reddit) | workflow exists, creds absent |
| Affiliate/referral pipeline | ⚠️ **CuraDebt**: logged in, payout terms live ($50/debt PPL + 2.5% CPA; $45/tax lead + $500/FPC), widget pages + creative submitted → **In Review**, account still TEST mode. **SmartCredit/PartnerHub**: link live (`?PID=57216`), contract gated on Stripe Connect KYC (user DOB/SSN/bank needed). **FlexOffers**: waiting on user's email passcode | AGENT_STATE 2026-10-13 |
| Stripe checkout | ✅ subscriptions + provider billing built | `settle-api` Stripe module |
| Lead scoring + matching | ⚠️ partial | checklist §5 |
| Render deploys | 🔴 **Build minutes exhausted** — deploys frozen until workspace plan/limit raised | AGENT_STATE 2026-10-11 |
| Revenue baseline | ~$0 (no settled affiliate payout or subscription verified) | no Stripe/affiliate settlements on record |

**One-line read:** the traffic + content engine is shipped; the money side (affiliate accounts exiting TEST mode, provider seats selling) is gated almost entirely on user actions, not code.

---

## 1. Revenue Goal & Current Gap

| Item | Value |
|------|-------|
| Target monthly revenue | **$16,000** |
| Current baseline | **~$0** |
| Gap | **$16,000** |
| First $16k horizon | 90–120 days *after* affiliate programs exit review and the first lead sells |
| Primary driver | Qualified consumer leads sold to providers + recurring provider seats + coaching subs |

We do **not** need 10,000 customers. We need ~80–120 qualified leads/month, a handful of provider seats, and a few dozen coaching subs.

---

## 2. Monetization Streams & Unit Economics (build status tagged)

| Stream | Model | Price | Status |
|--------|-------|-------|--------|
| **PPL referrals** | Affiliate fee per qualified consumer lead | $50–$150/lead; target **$75–$125 avg** | **[NEEDS-CREDS]** — CuraDebt pipeline built, exits TEST only after user completes approval steps; SmartCredit link live but payout gated on Stripe KYC |
| **Provider marketplace seats** | Monthly SaaS for providers to access lead pipeline | $500–$2,500/mo; target **$1,000** | **[BUILT]** — Stripe seat billing exists; needs sales motion |
| **Premium provider placement** | Featured listing / category boost | $200–$500/mo | **[BUILT-ish]** — trivial once seats exist |
| **Coaching subscription** | Consumer DIY tools + education | $49/mo (intro $1 first month) | **[BUILT]** — Stripe checkout exists; needs funnel traffic |
| **Phase 4: direct settlement share** | 15–25% of enrolled debt | — | **[NOT-BUILT]** — requires licensing; do not execute |

### Math to $16,000/month

**Primary mix (target: month 4)**

| Stream | Volume | Price | Monthly revenue |
|--------|--------|-------|-----------------|
| PPL referrals | 80 leads | $125 | $10,000 |
| Provider seats | 3 | $1,000 | $3,000 |
| Premium placement | 2 | $250 | $500 |
| Coaching subs | 50 | $49 | $2,450 |
| **Total** | | | **$15,950** |

**Lead-only bridge (if seats/coaching lag):** 130 qualified leads × $125 = $16,250.

To produce 80–130 qualified leads/month organically:
- ~6,000–8,000 targeted visitors/month at ~2% lead conversion.
- The 51 state pages + learn hub are the traffic surface; assessment funnel is the capture.

**Unit economics (assumed):**

| Metric | Value |
|--------|-------|
| Lead payout | $75–$300 (CuraDebt: $50 debt / $45 tax — mid-market) |
| Assessment start → completed lead | 20–30% |
| Completed lead → provider purchase | 50–70% |
| Effective visitor value | ~$4–$8 per targeted visitor |

---

## 3. Phase-Gated Execution Plan

### Phase 0 — Unblock & verify (this week)
**Exit gate: a consumer can complete the assessment end-to-end and the lead lands in the system; a provider could buy it tomorrow.**

| # | Task | Where |
|---|------|-------|
| 0.1 | Raise Render build-pipeline limit / upgrade plan — **all settle-api deploys frozen** | Render dashboard (user) |
| 0.2 | Verify Render repo connection survived the `obdulr/Settle → Settle-In-Peace` org rename | Render dashboard (user) |
| 0.3 | Set Render AI env (`AI_BASE_URL=https://models.github.ai/inference`, `AI_API_KEY=<fine-grained PAT>`, `AI_MODEL=openai/gpt-4o-mini`) | Render dashboard (user) |
| 0.4 | Paste MFSN creds (`MFSN_API_EMAIL/PASSWORD/BASE_URL`, `MFSN_ENV=production`) | Render dashboard (user) |
| 0.5 | E2E test: mobile `/assessment` → lead record → scoring → match stub fires | Playwright |

### Phase 1 — Money plumbing live
**Exit gate: first real referral payout path is active; coaching checkout completes in prod.**

| # | Task |
|---|------|
| 1.1 | **CuraDebt**: get creative approved → install widget on approved pages → exit TEST mode; request API key + funnel_ids (user action) |
| 1.2 | **SmartCredit**: complete Stripe Connect onboarding (user DOB/SSN/bank) → sign partnership contract → activate `?PID=57216` link on money pages |
| 1.3 | **FlexOffers**: user submits the 6-digit email passcode → apply Freedom Debt Relief ($14.40/lead) + top-5 debt merchants |
| 1.4 | ✅ Server postback receiver landed (`65b881e`): `GET/POST /affiliates/postback` (token or HMAC auth), `affiliate_conversions` table + admin list/summary. Remaining: set `AFFILIATE_<NAME>_POSTBACK_SECRET` env vars and hand each network its postback URL; add path to `isRawBodyWebhookRoute` in main.ts for byte-exact HMAC (token mode works today) |
| 1.5 | Affiliate disclosure in footer + assessment results page (compliance gate, §7) |
| 1.6 | Verify Stripe webhooks fire in prod for coaching subs + seat billing |

### Phase 2 — Acquisition engine
**Exit gate: sitemaps indexed, ≥1 social channel posting daily, first 50 outreach contacts sent.**

| # | Task |
|---|------|
| 2.1 | Submit `settleinpeace.com/sitemap.xml` in Google Search Console + Bing WMT (user grants access) |
| 2.2 | Activate social poster: create X + LinkedIn + Facebook app creds → workflow secrets; poster already exits non-zero on zero-published |
| 2.3 | Add calculator pages (`/calculators`): settlement-savings, payoff snowball/avalanche, DTI — each ends at `/assessment` CTA |
| 2.4 | Provider outreach: `sales-outreach` skill → 50 debt-relief/consolidation providers, "intent-verified leads in your states" pitch + one-pager |
| 2.5 | 2–3 learn articles/week targeting the keyword table below; internal-link to state pages + `/assessment` |
| 2.6 | `refer-a-friend` credit loop (code exists in other portfolio projects — port the pattern) |

**Priority keywords:** debt relief options (40.5k), debt settlement companies (27.1k), consolidation vs settlement (12.1k), best debt relief companies (8.1k), how to settle debt yourself (6.6k), debt settlement calculator (5.4k), credit card debt relief (4.4k+).

**Content pillars:** comparison guides, calculator/tool pages, state-law guides (✅ shipped), DIY negotiation scripts, credit-recovery content, anonymized case studies. 2–3 articles/week for 90 days, each linking `/assessment`, CFPB/FTC disclaimers above the fold, FAQ/HowTo/FinancialProduct schema.

### Phase 3 — Conversion & retention
**Exit gate: assessment completion ≥25%, lead→purchased ≥50%, coaching trial→paid ≥40%.**

| # | Task |
|---|------|
| 3.1 | Assessment funnel audit: progress bar, minimal fields, mobile-first — measure start→complete |
| 3.2 | Lead-quality scoring live (debt amount, state, employment, credit tier, months behind) → route premium leads to highest bidder |
| 3.3 | Email sequences A (new lead), B (non-qualifying → DIY + coaching), C (provider prospects) via Resend |
| 3.4 | Exit-intent / save-the-lead capture on assessment abandonment |
| 3.5 | Provider churn + complaint tracking in CRM |

### Phase 4 — Scale to $16K and beyond
- 80–120 leads/mo sold; 8–12 provider seats; 150–300 coaching subs
- Optional paid accelerator ONLY after organic shows converting traffic (Google Ads high-intent phrase match; Meta retargeting) — **not in the bootstrap baseline**
- HARO/guest-post backlink engine (5–10/month)
- Optional Phase 4 (direct settlement revenue share) only after legal review + $50k licensing budget — **do not execute now**

---

## 4. Weekly KPI Scorecard

| Metric | Month 1 | Month 3 | Month 6 |
|--------|---------|---------|---------|
| Targeted visitors | 3,000 | 20,000 | 60,000 |
| Assessment starts | 600 | 5,000 | 15,000 |
| Completed leads | 150 | 1,200 | 4,000 |
| Leads sold | 30 | 350 | 1,200 |
| PPL revenue | $3,750 | $43,750 | $150,000 |
| Provider seats | 2 | 8 | 15 |
| Coaching subs | 25 | 200 | 500 |

**North star:** qualified leads sold × avg payout. Review weekly (revenue-standup skill): leads generated/sold, traffic by source, funnel conversion, affiliate payout settlements, provider pipeline, coaching churn, compliance opt-outs.

---

## 5. API & Integration Access Checklist

| Integration | Status | Action needed |
|-------------|--------|---------------|
| CuraDebt | In Review | User: approve creative, install widget, exit TEST |
| SmartCredit/PartnerHub | Link live | User: complete Stripe Connect KYC + sign contract |
| FlexOffers | Blocked | User: submit email passcode |
| Boberdoo/LeadsPedia/LeadProsper | Not configured | Sign up; set `LEADVENDOR_*` env |
| Lead-vendor webhook | Partial | `LEADVENDOR_<NAME>_WEBHOOK_SECRET` + raw-body in main.ts |
| MFSN credit data | Local verified | User: paste env to Render |
| Resend | Partial | Confirm domain verified; production key |
| Telnyx SMS | OTP works | Optional: `TELNYX_CONNECTION_ID/PUBLIC_KEY` for calls |
| Stripe | Built | Verify prod webhooks |
| NMI/AuthNet | Not boarded | High-risk MCC; only if direct processing needed later |
| Social platform apps | Missing | User: create X/LinkedIn/FB apps, add secrets |
| Google Search Console | Not verified | User: verify domain, submit sitemap |

---

## 6. Compliance Guardrails (non-negotiable)

1. **Affiliate/referral disclosure** on every page footer + assessment results: *"Settle may receive referral compensation from vetted providers. We are not a government agency."*
2. **TCPA**: express written consent before sharing phone numbers; timestamp + language on `Lead` record; opt-outs honored <24h.
3. **CFPB/FTC**: no promised dollar savings, no guaranteed reduction, no "government/official" programs, disclose credit-score + tax impacts, no upfront consumer fees.
4. **Provider vetting**: AFCC/IAPDA membership, state license where required, BBB ≥ B, contractual no-upfront-fees.
5. **Data privacy**: share PII only with consumer-selected/consented providers; deletion requests honored.
6. **No direct settlement** until licensed — we are a marketplace, not a provider.

---

## 7. Blocked on user (the honest list)

| # | Action | Unlocks |
|---|--------|---------|
| 1 | Render dashboard: raise build-pipeline minutes | All settle-api deploys |
| 2 | Render dashboard: verify repo connection post-org-rename | Deploys |
| 3 | Render env: AI + MFSN vars (from `settle-api/.env`) | AI features, credit data |
| 4 | FlexOffers: submit the 6-digit email passcode | Freedom Debt Relief + thousands of merchants |
| 5 | SmartCredit: complete Stripe Connect KYC (phone/DOB/SSN/bank) + sign contract | Live $-per-lead payouts |
| 6 | CuraDebt: confirm creative approval, then we install widget | First real PPL revenue |
| 7 | Create X + LinkedIn + FB developer apps → secrets | Daily social distribution |
| 8 | Verify domain in Google Search Console → submit sitemap | Indexation of 51 state pages |
