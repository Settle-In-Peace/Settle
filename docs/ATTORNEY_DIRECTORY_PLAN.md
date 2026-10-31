# Attorney Directory — featured-placement plan (SIP)

Owner ask: bankruptcy attorneys as a paid directory vertical on settleinpeace.com —
"charge them to be listed." 2026-10-31.

## Compliance frame (hard rules — read before building)

- **Flat-rate advertising only.** Attorneys cannot pay per-lead, per-signup, or % of
  revenue (ABA Model Rule 7.2(b); CA Rules Prof. Conduct 7.2). Featured listing =
  advertising = legal everywhere. Per-lead billing to attorneys = fee-splitting = barred.
- **No payment to attorneys either.** Attorneys can't receive referral fees — the
  "affiliate" channel is non-cash reciprocity (they refer settlement-fit consumers to
  SIP free; we surface them for BK-fit consumers). Optional: free featured placement
  for co-marketing (logo/backlink on their site).
- Per-lead pricing stays for **debt-relief providers only** (not lawyers — no bar issue).
- Directory copy must mark paid placements as **Sponsored/Featured — advertising**, never
  "recommended"/"certified." No outcome promises adjacent to listings.
- Verify target-state bar ad opinions before billing (CA/TX/FL all allow flat-fee
  directories; this is the safe lane — stay in it).

## Data model (providers table already carries most of this)

`providers` entity has: name, contact_name, email, phone, website, specialties[],
states[], fee_structure, plan_interest, stripe columns, email_verified,
password_setup_token.

Add via one migration:

- `provider_type` varchar default `'debt_relief'` — new value `'bankruptcy_attorney'`
- `bar_number` varchar nullable, `bar_states` simple-array (license display)
- `featured_tier` varchar nullable — `null` | `'founding'` | `'featured'` | `'exclusive'`
- `featured_regions` simple-array — zips/cities the tier covers
- `featured_until` timestamp nullable — expiry for the placement
- `listing_active` boolean default false — gates public directory display

`leads`/`matches`: add `match_reason` varchar nullable (`'settlement_fit'`,
`'bk_candidate'`) so attorney matches are auditable separately.

## API (settle-api)

- `GET /providers/directory?type=attorney&state=&city=` — public, returns
  `listing_active` providers; featured_tier sorted first, then rating/recency
- `GET /providers/attorneys/:slug` — public profile page data (add `slug` if missing —
  providers already have `email` unique; use `slug` column for clean URLs)
- `POST /providers/directory/claim` — attorney claims listing (email verification →
  password_setup_token flow that already exists)
- `POST /stripe/directory-checkout` — featured-tier checkout session (flat monthly,
  reuse `createProviderSubscriptionSession` shape with a directory price product)
- `GET /providers/portal/listing-stats` — views/clicks/matched-leads for renewal proof
- Track `directory_views` + `directory_clicks` (simple counter table or columns)

## Assessment → attorney routing

`/assessment` already scores consumers. Add a **bk_candidate branch**:

- Signals: unsecured debt > ~$40k, wage garnishment/judgment, behind on mortgage+unsecured,
  prior settlement failure, income too low for program payment math
- These leads route to the attorney directory instead of debt-relief matching —
  surfaced as "Talk to a bankruptcy attorney" result card → directory CTA
- Attorney sees the consumer's county/state only; consumer initiates contact
  (avoids being a referral service — we're an ad venue, they reach out or not)

## Web surface (settle-web)

- `/attorneys` — directory index (searchable by state/city, sponsored-first ordering,
  "Featured" badge on paid, "Listed" on free)
- `/attorneys/[slug]` — attorney profile: firm, bar #, states, practice areas, contact CTA
- `/providers` — add "For attorneys" section → claim listing → checkout for featured tier
- Provider portal: new "Listing" tab — stats, tier, upgrade button
- `/compare` unchanged (providers comparison stays debt-relief)

## Pricing (flat subscriptions only)

| Tier | Price | What |
|---|---|---|
| Listed | free | name/firm/city, claimable, contact via form |
| Featured | $149/mo | sponsored badge, top-of-state ordering, full profile, stats |
| Founding Featured | $75/mo for 12 mo | same, early cohort, limited to 5/state |
| City Exclusive | $299/mo | only featured attorney shown for that city |

Stripe product: `SIP Attorney Directory` — monthly prices only, no usage billing.
Founding cohort manually comped via `featured_until` is fine pre-Stripe.

## Build order

1. **Schema**: migration (provider_type, bar fields, featured_*, listing_active, slug)
2. **API**: directory endpoints + claim flow (reuse password_setup pattern)
3. **Web**: `/attorneys` index + profile + "For attorneys" section on /providers
4. **Assessment**: bk_candidate branch + attorney CTA card
5. **Billing**: Stripe directory product + portal Listing tab
6. **Seed**: 20–30 free listings (CA bar scrape → enrich → insert as unclaimed)
   so the directory isn't empty when outreach starts
7. **Outreach**: `settle-attorneys` LeadOps project config — state bar + NACBA lists,
   sequence: "your listing is live (free), claim it" → featured upsell

## What NOT to build

- No per-lead/per-client attorney billing (fee-splitting)
- No "matched attorney" claims that imply endorsement
- No attorney-side referral payouts — reciprocity is traffic, not money
- Skip reviews/ratings on attorney profiles for now (bar ad rules on testimonials vary)
