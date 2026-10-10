# Settle Provider Outreach Pack

> Goal: first provider seat ($500–$1,500/mo) or first lead-purchase agreement ($75–$300/qualified lead).
> Compliance: we are a **lead marketplace / referral partner** — never imply we settle debt. All claims must be about lead quality, volume, and exclusivity — never settlement outcomes.
> Prereq: `api.settleinpeace.com` must be live — providers will click through before signing. (See AGENT_STATE blocker: Render repo reconnect.)

## Target profile

Companies that already buy consumer debt leads:

- Licensed debt-settlement / debt-adjustment companies (state-by-state registries)
- Credit counseling agencies (NFCC/FCAA members — note: many are nonprofit, prefer debt *management* leads)
- Debt-consolidation loan originators (lenders buy leads too — often higher $/lead)
- Lead aggregators that resell (boberdoo buyer networks, LeadProsper, PX/Veritone marketplace)

## Prospect list starter (verify + enrich before sending)

| Segment | Example targets | Angle |
|---|---|---|
| Debt settlement cos | National Debt Relief, Freedom Debt Relief, Accredited Debt Relief, Pacific Debt, CountryWide | They run massive affiliate/PPL programs — join as lead supplier OR sell excess leads |
| Debt-consolidation lenders | Happy Money, Achieve, LendingClub partners | High-intent personal-loan leads, $150+/lead typical |
| Credit counseling | Money Management International, GreenPath, Cambridge Credit | Warm-transfer inbound leads for DMP enrollments |
| Aggregator networks | boberdoo, LeadProsper, PX | Plug our `lead-vendors` module in — fastest technical path, lower $/lead but instant distribution |

## 3-touch sequence (plain text, CAN-SPAM footer required)

**Touch 1 — intro (≤100 words)**

Subject: Qualified debt-relief leads — California launch

Hi {first_name},

We run Settle In Peace (settleinpeace.com), a consumer debt-assessment platform. Consumers complete a guided assessment — debt amount, type, state, employment — and we score and route qualified leads to a small number of partner providers.

We're opening {N} partner slots for {state/vertical} this month. Leads are exclusive (not resold), delivered in real time with full assessment data attached.

Is lead acquisition something your team handles, or is there a better person to ask?

{signature}
{COMPANY_MAILING_ADDRESS} · unsubscribe: {link}

**Touch 2 — value (day +3)**

Hi {first_name},

Quick follow-up. Two things partners usually care about:

1. **Qualification before you pay** — we only charge for leads meeting your filters (debt ≥ $X, state, debt type). Leads you reject don't bill.
2. **Real-time delivery** — ping/post or direct webhook into your CRM; no batch files.

Happy to send a sample (anonymized) lead record so you can see the data quality. Worth 15 minutes?

{signature}

**Touch 3 — breakup (day +7)**

Hi {first_name},

Last note — we're capping {state} at {N} providers so leads stay exclusive. If lead gen isn't a priority right now, no worries; I'll check back next quarter.

If it is, one reply gets you the sample lead + pricing sheet.

{signature}

## Pricing sheet (send on reply)

- Pay-per-lead: $100–$150/qualified lead (filters: debt amount ≥$7,500, employed, in-state, expressed intent). Rejected leads don't bill.
- Marketplace seat: $1,000/mo — dedicated lead stream + dashboard + priority routing.
- Premium placement: $300/mo add-on — featured provider position in match results.
- Pilot offer: first 5 leads free to prove quality; then month-to-month.

## Tracking

Log every send/reply in the `crm/` module (settle-web has a CRM surface). Source-of-truth sheet: `provider-prospects.csv` (create on first real send — columns: company, contact, email, segment, sent_at, reply, status).
