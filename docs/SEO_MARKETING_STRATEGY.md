# SEO + Marketing Strategy — Settle In Peace

**Scope:** `settleinpeace.com` (Next.js 16 / OpenNext on Cloudflare Workers). Companion to `docs/16K_MONTHLY_GROWTH_PLAN.md` (revenue math + phase gates) — this doc owns **search posture and promotion channels**.
**Sweep date:** 2026-11-06.
**Domain context:** debt relief is **YMYL + regulated**. All copy rules from the growth plan §6 apply to SEO content: no guaranteed savings, no "government program" framing, no invented results, referral-compensation disclosure, CFPB/FTC-safe claims. When in doubt, blander is better.

---

## 1. Current SEO posture

### Fixed in this sweep
| Finding | Before | Fix |
|---|---|---|
| Root metadata | Title/description only; no `metadataBase`, OG, Twitter card | Root layout emits full OG + Twitter + robots defaults |
| OG image | **None existed** | Generated `public/og-image.png` (1200×630, brand mark on brand blue) |
| Page OG images | 7 pages set `openGraph` without `images` → og:image 404s/blank | `images: ['/og-image.png']` added to learn, learn/[slug], calculators, debt-snapshot, eligibility-checker, both debt-relief templates |
| Canonicals | Missing on attorneys, daas, disclosures, privacy, privacy-app, terms, refund, attorneys/[slug] | `alternates.canonical` added to all |
| Missing metadata | login, register, forgot-password, reset-password, attorneys/claim, collections, staff — all inherited bare root title | 7 `layout.tsx` wrappers: register + attorneys/claim indexable w/ canonical; auth/staff/ops routes `noindex` |
| robots.ts | Missing auth utility routes | Added `/login`, `/forgot-password`, `/reset-password` to disallow |
| JSON-LD | Only on tools/articles/city pages | Organization + WebSite site-wide via root layout |

### Verified good already
- **Programmatic SEO is the crown jewel:** 51 state + ~175 city `/debt-relief/*` pages — unique statute-of-limitations data, per-state keywords, FAQ JSON-LD, canonicals, AG/CFPB/211/NFCC outbound links. This is real E-E-A-T bait in a YMYL niche.
- 11 `/learn/*` articles with Article schema, canonicals, authors, OG.
- All private surfaces (`/dashboard`, `/portal`, `/crm`, `/debts`, `/settlement`, `/admin`, `/sales`, `/leads`, `/profile`, `/settings`, `/collections`) already noindex'd + robots-disallowed.
- Strict CSP in `_headers` (helps trust signal posture; allows inline JSON-LD via `unsafe-inline`).
- h1 per page ✓; all `<img>` have alt ✓; Bing verification file live (`public/5d361ea9d4bcfd256e3ef091f845d5d2.html`).

### Still open (backlog)
- **`questions/[id]`** is a client component → no per-question metadata; all detail pages canonical to `/questions` — UGC content won't rank individually. Fix = server wrapper + `generateMetadata` (not cheap; defer).
- **`/feed.xml`** exists (ƒ dynamic) — wire article content into it as RSS → niche feed directories.
- **No FAQ schema on `/questions` hub** — indexable Q&A with QAPage schema potential.
- **Attorney directory is thin** — pages exist (`/attorneys`, `/attorneys/[slug]` server-rendered) but listing coverage unknown; directory needs inventory before it ranks.
- **Core Web Vitals unmeasured** — run CrUX/Lighthouse on state+city templates once GSC is connected.
- **`sitemap` lacks `/attorneys` + `/attorneys/claim` + `/daas`** — indexable routes not listed (add when directory content is real).

---

## 2. Realistic keyword targets

Debt-relief head terms ("debt relief", "debt settlement") are owned by Bankrate/NerdWallet/CFPB + paid SERP features — **not winnable for a new domain**. The programmatic state/city pages + honest long-tail content are the wedge. Extend growth-plan priority list with winnability tiers:

| Tier | Target queries | Surface | Realism |
|---|---|---|---|
| **Geo long-tail** | "debt relief programs in [state]", "statute of limitations credit card debt [state]", "debt collectors laws [city]" | `/debt-relief/[state]`, `/[state]/[city]` | **High** — thin local SERPs, unique data pages |
| **Comparison/decision** | "debt settlement vs consolidation", "is debt settlement worth it", "debt management plan vs settlement" | `/learn/*`, `/compare` | **Medium** — competitive but long-tail variants winnable |
| **Tool queries** | "debt payoff calculator", "DTI calculator", "debt settlement calculator", "am I eligible for debt relief" | `/calculators`, `/tools/eligibility-checker`, `/debt-snapshot` | **Medium-high** — tool pages rank on utility + earn links |
| **DIY/negotiation** | "how to negotiate with creditors", "debt settlement letter template", "pay for delete letter" | `/learn/*` expansion | **Medium** — big SERP players present, but specific-script queries convert |
| **Bankruptcy adjacency** | "chapter 7 vs debt settlement", "bankruptcy attorney [city]" | `/learn/*`, `/attorneys/*` | **Medium** — drives attorney-directory value |
| **Brand** | "settle in peace", "settleinpeace reviews" | `/`, Org schema | **High** — claim entity early |
| **B2B** | "buy debt leads", "debt settlement leads for sale", "TCPA compliant dialer" | `/providers`, `/daas`, `/leads` | **Medium-high** — low-volume, high-value; LinkedIn/outreach converts better than SEO here |

**Copy rule for all keyword pages:** "may", "options", "compare", "learn how it works" — never "eliminate", "guaranteed", "reduce by X%".

---

## 3. Page/program plan (extends growth-plan Phase 2.5)

| Priority | Program | Notes |
|---|---|---|
| 1 | **State/city expansion depth** — each state page gains county-level statute table + local NFCC/211 links | Existing templates support it; fills thin-content risk on city pages |
| 2 | **Tool cluster** — add settlement-savings + snowball/avalanche calculators to `/calculators` | Growth plan 2.3; calculator queries are the most linkable asset in the niche |
| 3 | **Learn cadence: 2–3/week** — DIY negotiation scripts, "what happens if you stop paying [creditor type]", credit-rebuild series | Pillars already defined in growth plan; each article ends at `/assessment` |
| 4 | **Attorney directory fill** — seed free listings state-by-state (bar-association public data, clearly labeled), then claim-listing outreach | `/attorneys/claim` is now indexable; directory adds a second monetizable vertical (see ATTORNEY_DIRECTORY_PLAN) |
| 5 | **Questions hub → QAPage schema + server-side per-question metadata** | Anonymous Q&A is unique UGC — long-tail gold if indexable per-question |
| 6 | **Case-study format (compliance-safe)** — anonymized "how a typical settlement program works" explainers, NOT invented results | Trust content for YMYL; label as illustrative, not testimonial |

---

## 4. Promotions strategy

Model: **two-sided marketplace** — consumer side (assessment → lead → $19 priority-match fee → provider match) + provider side (seats, placement, lead purchases) + adjacent B2B (DaaS dialer, attorney directory, lead-vendor tools).

### Consumer channels
| Channel | Play | Fit |
|---|---|---|
| **SEO/programmatic** | State+city+tools+learn cluster (above) | Primary — already shipped |
| **Anonymous Q&A seeding** | Answer real questions on `/questions`; syndicate prompts from Reddit r/debt, r/personalfinance (link only when genuinely helpful; never astroturf) | Free, builds UGC index |
| **Short-form video** | "what debt collectors can/can't do" 30–60s clips → `/tools/eligibility-checker` CTA | Needs social creds (growth-plan 2.2 blocker) |
| **Email nurture** | Assessment → SI close-flow (already live: score → checkout link → day-0/1/3 nurture) + free 7-day debt course (debt-snapshot) | **Live** — feed it traffic |
| **Community nonprofits** | NFCC agencies, 211 operators, legal-aid — resource-page links to our free tools | High-trust backlinks for YMYL |
| **HARO/journalist requests** | "debt industry trends" source pitches | DR-building; monthly task |

### Provider/B2B channels
| Channel | Play | Fit |
|---|---|---|
| **Direct outreach** | `docs/marketing/provider-outreach.md` 3-touch sequence — 50 providers/quarter | Primary B2B motion |
| **Lead aggregators** | boberdoo/LeadProsper/PX buyer networks — plug into lead-vendors module | Fastest distribution per the pack |
| **Attorney claim outreach** | "Claim your free listing" email to bar-listed bankruptcy attorneys | Directory flywheel: content + claimed listings → paid placement |
| **DaaS landing → demo** | `/daas` page is SEO'd; pitch to collections agencies via LinkedIn | Separate revenue line |
| **Affiliate programs** | Finish CuraDebt review + SmartCredit KYC + FlexOffers passcode (all blocked on user per growth plan §7) | First real PPL revenue |

### Promotions to run
- **$19 priority-match fee** (live via close-flow): the assessment funnel's first consumer transaction — promotes match speed, **not** outcomes. Copy: "priority matching", never "guaranteed approval".
- **$1 first-month coaching** intro (already built) → 30-day credit-rebuild email series.
- **Provider launch pricing:** first 3 seats at $500/mo founding rate with case-study rights.
- **Free listing → featured placement** upgrade path on attorney directory.

### Never-do (regulated)
- No "guaranteed debt relief/elimination", no percentage-savings claims, no fake testimonials/ratings, no "government program" framing, no cold SMS without TCPA consent (Telnyx only), no bought links, no doorway-page city stuffing beyond real data.

---

## 5. Conversion paths

```
Consumer: search → /debt-relief/[state] or /learn/* or /calculators
        → /tools/eligibility-checker or /debt-snapshot (lead magnet)
        → /assessment (2-min) → SI score → $19 priority-match checkout
        → provider match → referral payout   [revenue: PPL + match fee]
        → non-qualifying → /coaching $1 intro → $49/mo sub

Provider: /providers or outreach → /portal seat signup → lead purchases
Attorney: /attorneys/[slug] → /attorneys/claim → verified listing → paid placement
Agency:  /daas → contact → seat billing
```

**Instrumentation:** track assessment start→complete, match-fee checkout conversion, nurture-sequence paid flips (`/close-flow/pipeline`), article→assessment CTR. UTM on all outreach/social.

---

## 6. 30 / 60 / 90-day list

**30 days**
- [x] SEO quick wins landed (this sweep — OG/Twitter/canonicals/JSON-LD/metadata gaps/robots)
- [ ] GSC + Bing WMT verified → submit sitemap (growth plan 2.1/§7.8 — needs user or vault creds)
- [ ] Add `/attorneys`, `/attorneys/claim`, `/daas` to sitemap once directory has real inventory
- [ ] 4–6 learn articles targeting tier-2/3 keywords (settlement-letter templates, DTI explainers)
- [ ] Unblock social creds → autoposter daily (§7.7)
- [ ] 50 provider outreach touches (provider-outreach.md sequence)

**60 days**
- [ ] Calculator cluster complete (snowball/avalanche + settlement-savings) — link magnet outreach to personal-finance bloggers
- [ ] `questions/[id]` server-side metadata + QAPage schema
- [ ] Attorney directory: seed 200+ free listings across top-10 states; first claim-email batch
- [ ] First claimed/featured attorney placements
- [ ] RSS `/feed.xml` populated with learn articles → feed directories

**90 days**
- [ ] GSC: state pages ranking for "debt relief [state]" variants (target: 10 states page-2 or better)
- [ ] ≥6,000 monthly targeted visitors → 80+ qualified leads (growth-plan math)
- [ ] First provider seat closed; CuraDebt/SmartCredit payouts flowing (still user-gated — escalate)
- [ ] Keep/kill channel review per KPI scorecard; paid-search test only if organic conversion proven AND compliance review of ad copy done
