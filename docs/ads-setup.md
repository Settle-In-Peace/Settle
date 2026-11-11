# Ads & Conversion Tracking Setup — Settle In Peace

**Tracking first, spend second** — this doc covers the plumbing only. No ad
spend and no ad-account creation has been done on the owner's behalf.

## Tags (all env-gated — nothing loads when unset)

| Tag | Env var | Loader |
|---|---|---|
| GTM container (`GTM-XXXX`) **or** GA4/Google Ads tag (`G-`/`AW-`) | `NEXT_PUBLIC_GTM_ID` | `settle-web/src/components/AdTracking.tsx` |
| Microsoft Advertising UET | `NEXT_PUBLIC_MS_UET_ID` | same component |

- Mounted once in `settle-web/src/app/layout.tsx` (`<AdTracking />` before `</body>`).
- The component returns `null` and emits zero script tags when both env vars
  are unset — set them as Cloudflare Worker env vars (or `.env.local` in dev).
- A `GTM-` prefix loads `gtm.js` (container); a `G-`/`AW-` id loads `gtag.js`.

## Conversion events fired

| Event | File | Trigger |
|---|---|---|
| `sign_up` | `src/app/register/page.tsx` | account created — password path and passkey-registration path |
| `login` | `src/app/login/page.tsx` | password, OTP, and passkey sign-in success |
| `begin_checkout` | `src/app/credits/page.tsx`, `src/app/portal/billing/page.tsx` | Stripe checkout session created (before redirect) |

`trackEvent()` in `src/lib/ads.ts` pushes `{event: name, ...}` to
`window.dataLayer` (consumed by GTM), calls `window.gtag('event', …)` when
gtag.js is loaded, and pushes a UET custom event when UET is loaded. All
no-ops until tags exist.

## What the owner must create (agents must NOT create accounts or spend)

1. **Google Ads** — <https://ads.google.com> → **Expert Mode** → "Create an
   account without a campaign". **Tools → Conversions → New conversion action
   → Website**: `sign_up` and `begin_checkout` (or import from GA4). API
   uploads later: **Tools → Setup → API Center** → request a developer token
   (basic access, no spend required). Put the tag id in `NEXT_PUBLIC_GTM_ID`.
2. **Microsoft Ads** — <https://ads.microsoft.com> → account →
   **Tools → UET tag → Create UET tag** → tag id into `NEXT_PUBLIC_MS_UET_ID`.
   **Tools → Conversion goals** — custom-event goals matching `sign_up` /
   `login` / `begin_checkout`.
3. **Meta pixel** (optional, later) — Meta Events Manager → Web data source →
   add snippet to `AdTracking.tsx` behind `NEXT_PUBLIC_META_PIXEL_ID`.

## UTM convention (all campaigns)

- `utm_source` — network: `google`, `bing`, `meta`, `x`, `newsletter`
- `utm_medium` — `cpc`, `paid_social`, `email`, `referral`
- `utm_campaign` — `settle-<goal>-<yyyymm>` (e.g. `settle-assessment-202612`)
- `utm_content` — creative/ad-variant slug
- `utm_term` — keyword or audience label (paid search only)

## Privacy

Cookie-based ad measurement disclosure lives in `src/app/privacy/page.tsx`
§10 ("Cookies Policy") — required before pixels go live.
