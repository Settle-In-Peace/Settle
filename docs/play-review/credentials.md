# Google Play — reviewer credentials & app-access declaration

# 2026-11-09 · devin-play-preflight

`com.settleinpeace.mobile` — internal track committed (AAB vc5, 2026-11-04).
App-access ("Sign in details") declaration still needs creds — pending console
session (Google 2SV blocked, tracked in Prime `.devin/NEEDS_HUMAN.md`).

## Verified reviewer accounts (login verified live → JWT, 2026-11-09)

| Account | Password | Notes |
|---|---|---|
| applereview@settleinpeace.com | Review2026! | canonical demo — seeded assessment; lands on populated dashboard |
| play.review.settle@settleinpeace.com | PlayReview!2026 | backup; email_verified flipped true in prod DB 2026-11-09 |

## ⚠ GATE — email OTP on unverified accounts

`AuthService.login` returns `requiresVerification` (email OTP) for any
customer account with `email_verified=false`. A reviewer creating a NEW
account hits an email-OTP wall — always declare one of the accounts above
(both `email_verified=true`). Providers (`role=provider`) skip the OTP gate.

## Reviewer path

- Sign in → populated dashboard (applereview@ has a completed assessment +
  program data seeded). No guest mode.
- Gates: email-OTP on unverified accounts only (covered — both demo accounts
  verified). No invite code, no geo-gate, no paywall, no IAP.

## Suggested Play declaration text

> Sign in with Email + Password: applereview@settleinpeace.com /
> Review2026! (backup: play.review.settle@settleinpeace.com /
> PlayReview!2026). The demo accounts are email-verified — new
> self-registered accounts require email OTP, so please use the provided
> account.
