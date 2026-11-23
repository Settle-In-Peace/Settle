# Founding Provider Terms — Settle In Peace

> **STATUS: DRAFT — pending counsel review.**
> This document is a REVIEW ARTIFACT. It is **not** a live Terms of Service,
> must not be published as consumer- or provider-facing legal text, and must
> not be attached to any checkout or enrollment flow until counsel signs off.
> All pricing below is quoted verbatim from the codebase and the live Stripe
> catalog — nothing was invented for this draft. Prepared 2026-12-28 from the
> sources cited inline.

---

## 1. Parties and scope

- **"Platform"**: Settle In Peace (settleinpeace.com), operated by
  **[TBD — legal entity name for the contracting party; counsel to confirm
  whether Reid Technology or another entity signs]**.
- **"Provider"**: the debt-relief company enrolling in the provider
  marketplace.
- The Platform is a **lead marketplace and referral service**. It does not
  provide debt settlement, debt adjustment, debt management, credit repair,
  or legal services, and it does not charge consumers any fee for settlement
  services. (Posture per repo `AGENTS.md` and portfolio legal rules —
  "Settle refers consumers to providers; it does not settle debts itself.")
- Providers are **independent companies**. The Platform does not employ,
  endorse, certify, or warrant any provider. Directory and marketplace
  surfaces describe providers as independent — this draft assumes that
  disclaimer remains mandatory on every listing surface.

## 2. Founding-provider offer (as defined in the codebase today)

The codebase defines exactly one "founding" commercial item:

- **Founding Featured directory placement — $75/month**, flat-rate.
  Live staff/provider copy describes it as "first 5 per state, locked 12 mo."
  - Source: `DIRECTORY_TIERS` in
    `settle-api/src/stripe/stripe.service.ts` (`id: 'founding'`,
    `priceMonthly: 75`, `priceEnvVar: 'STRIPE_PRICE_DIRECTORY_FOUNDING'`);
    display copy in `settle-web/src/app/portal/listing/page.tsx`.
  - This is **advertising placement only** — a flat monthly rate for a
    labeled featured position in the directory. It is not per-lead and not
    contingent on referrals or closings.

Outreach copy additionally promises the founding cohort "founding rates
locked for 12 months, first pick on lead volume in your states, and a
direct line to the team building the matching engine"
(`tools/provider-invite/generate_invite_emails.mjs`).

> **PRICE-CLAIM VERIFIED (2026-11-23):** the $99/month founding Marketplace
> Seat advertised in `/providers` copy is copy-true. Code tier
> `marketplace_seat_founding` (`priceMonthly: 99` → env
> `STRIPE_PRICE_PROVIDER_SEAT_FOUNDING`) resolves on oracle to Stripe
> price `price_1UevJlGzFIOqs48PS219Riit` = $99/mo recurring. Standard seat
> is $199/mo (`price_1UaTH3GzFIOqs48PWnXJ4wv6`). Earlier flag claiming no
> $99 price existed was incorrect — resolved in NEEDS_HUMAN.

- **[TBD — counsel/owner]**: "first pick on lead volume" is a priority-
  routing promise. Confirm it is deliverable and contract-safe before it
  becomes a written term; today it exists only as marketing copy.
- **[TBD — counsel/owner]**: confirm whether the "first 5 per state" cap is
  a contractual limit or marketing scarcity language only.

## 3. Standard pricing catalog (context — already defined, not new terms)

Quoted from `settle-api/src/stripe/stripe.service.ts` and
`settle-api/src/leads/leads.service.ts`; public site copy at
`settle-web/src/app/providers/page.tsx` matches.

| Item | Price | Source |
|---|---|---|
| Marketplace Seat | $199/mo (1 seat; 30-day trial in checkout) | `PROVIDER_SUBSCRIPTION_TIERS`, `STRIPE_PRICE_PROVIDER_SEAT` |
| Starter | $500/mo (5 seats) | same |
| Growth | $1,000/mo (15 seats) | same |
| Scale | $2,500/mo (50 seats) | same |
| Directory — Featured | $149/mo flat | `DIRECTORY_TIERS` |
| Directory — Founding Featured | $75/mo flat | `DIRECTORY_TIERS` |
| Directory — City Exclusive | $299/mo flat | `DIRECTORY_TIERS` |
| Lead credits | $50/500 · $90/1,000 · $200/2,500 · $350/5,000 | `CREDIT_PACKAGES` |
| Exclusive lead purchase | $75–$300/lead tiered by consumer total debt: $75 (<$10k), $100 (≥$10k), $150 (≥$15k), $200 (≥$25k), $300 (≥$50k) | `calculateLeadPrice` in `leads.service.ts` + `stripe.service.ts` |

- **[TBD — verify before contracting]**: the public providers page advertises
  Marketplace Seat benefits "20% discount on all lead purchases" and
  "dedicated account manager." Confirm these are actually implemented in
  billing before they appear in any signed terms.
- **Stale-doc warning**: `docs/marketing/provider-outreach.md` still shows an
  older pricing sheet ($100–$150/lead, $1,000/mo seat, $300/mo placement).
  The code/Stripe catalog above is authoritative; the outreach doc should be
  corrected when this ships.

## 4. Lead-match obligations

**Platform obligations:**
- Score and route consumer assessment leads according to the provider's
  stated filters (state, debt type, minimum debt amount).
- Deliver matched leads exclusively — a purchased lead is sold once and is
  not resold. Unpurchased leads are shown masked (PII withheld) until
  purchase. (Mirrors `leads.service.ts` masking + `purchaseLead`.)
- Deliver full consumer contact details only after purchase/checkout
  completes.

**Provider obligations:**
- Maintain all licenses/registrations required for its activity in each
  state it accepts leads for (debt settlement, debt adjustment, credit
  services organization, or lending as applicable).
- Comply with TCPA, the Telemarketing Sales Rule, state DNC registries, and
  all applicable consumer-protection laws when contacting consumers.
- Honor consumer opt-outs and cease contact on request.
- Use consumer data solely to respond to that consumer's inquiry — no
  resale, no sharing with third parties, no unrelated marketing.
- **[TBD]**: contact-time expectation (e.g., attempt contact within N
  business days) and lead rejection/return window — define with counsel.

## 5. Payment and dispute terms

- All billing runs through Stripe Checkout. Subscriptions auto-renew
  monthly until cancelled; providers cancel via the Stripe billing portal
  (platform exposes `POST /stripe/provider-billing-portal`-equivalent —
  `createProviderBillingPortalSession`).
- Directory placements bill monthly; cancellation takes effect at the end
  of the current paid period (matches live `/portal/listing` copy: "placement
  stays active through the paid period").
- One-time lead purchases and credit packs are **final upon delivery** of
  the consumer contact record. **[TBD — counsel]**: credit/refund policy
  for leads with disconnected numbers or wrong-party contact data is a
  commercial decision that needs a written rule.
- Disputes and chargebacks: **[TBD — counsel]**: standard Stripe dispute
  flow; whether platform may suspend accounts with open chargebacks.

## 6. Term and termination

- Month-to-month; either party may cancel subscription billing at any time,
  effective at the end of the current paid period.
- Founding rate lock: the $75/month Founding Featured rate holds for 12
  months from first paid enrollment; after the lock it converts to the
  then-current Featured rate. **[TBD — confirm conversion mechanics.]**
- The Platform may suspend or terminate a provider immediately for:
  operating without required licensure; TCPA/DNC/TSR violations in
  contacting consumers; misuse or resale of consumer data; fraudulent or
  abusive platform use.
- Either party may terminate for material breach with
  **[TBD: e.g. 30] days'** written notice if the breach is uncured.
- Survival: confidentiality, consumer-data restrictions, accrued payment
  obligations, and indemnities survive termination.

## 7. Compliance representations

- Provider represents it is duly licensed in every jurisdiction where it
  accepts leads, and that its own consumer agreements and fee practices
  comply with applicable law (including state fee caps and TSR advance-fee
  rules — the Platform charges consumers nothing for settlement).
- Paid placements are publicly labeled advertising ("Featured"/"Sponsored")
  in line with FTC 16 CFR 255 — providers may not describe placement as an
  endorsement.
- The Platform is not a party to any provider–consumer agreement and makes
  no representation about settlement outcomes.
- **[TBD — counsel]**: indemnification, limitation of liability, governing
  law/venue, arbitration, and data-protection terms (consumer financial
  data — GLBA-adjacent handling) all need counsel-drafted language.

## 8. Open items for counsel — do not ship until resolved

1. Contracting entity legal name.
2. Lead-generation posture under TSR: per-lead pricing is the live revenue
   model — counsel to confirm the marketplace's obligations/position.
3. Written refund/credit rule for invalid-contact leads.
4. Whether founding caps ("first 5 per state", "first pick on volume") are
   contractual.
5. Indemnity, liability cap, governing law, dispute resolution.
6. Data-use terms for consumer financial/PII data delivered with leads.
