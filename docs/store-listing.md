# Play Store listing — Settle In Peace (`com.settleinpeace.mobile`)

- **Title (≤30):** Settle In Peace
- **Short description (≤80):** Debt relief marketplace — compare options, track your path out.
- **Category:** Finance
- **Price:** Free
- **Privacy policy URL:** https://settleinpeace.com/privacy (route live; worker
  intermittently 503s on cold start — recheck at submit; mobile-framed variant
  at /privacy-app)
- **Contact:** support@settleinpeace.com · https://settleinpeace.com
- **Developer:** Reid Technology

## Full description
Settle In Peace helps you understand your debt and compare real relief options.

Take a guided assessment, see which providers and programs fit your situation, and track every balance on the way down.

• Guided debt assessment — answer a few questions, get matched to options
• Provider marketplace — compare licensed attorneys and relief programs
• My Debts dashboard — balances, interest, and progress in one place
• Budgets, goals, and payoff questions answered by SI-powered guidance
• Biometric and passkey sign-in for quick, secure access

Free to join. You choose which provider to work with — every engagement is between you and the provider.

## Data-safety notes (draft)
Collects: name, email, phone (optional), user IDs, financial info (debt
data), user-entered assessment text — all App Functionality, linked to
user. Not shared with third parties (backend shares with relief providers
only with explicit consent). Encrypted in transit. Deletable in-app
(Profile → Delete Account). Adults only — do not select 13 & under.

## App Store (ASC) metadata

- **Subtitle (≤30):** Debt relief, made clear
- **Keywords (≤100, comma-separated, no spaces needed):**
  `debt,debt relief,debt settlement,budget,credit card debt,payoff,debt calculator,bankruptcy,debt free` (100 chars)

## Screenshots (devin-settle-shots, 2026-11-23)

Real UI captured from `expo export --platform web` at exact store sizes via
`settle-mobile/scripts/capture-store-shots.mjs` (Playwright + Brave; authed
shots seeded with the applereview@ reviewer login — real dashboard/debt/
attorney data from prod API).

| Dir | Device class | Size | Notes |
|---|---|---|---|
| `settle-mobile/screenshots/ios/` | iPhone 6.7" (IPHONE_67) | 1290×2796 | 12 shots: onboarding×3, login, register, dashboard, debts, assessment, attorneys, coaching, learn, calculators |
| `settle-mobile/screenshots/ios-6.5/` | iPhone 6.5" (IPHONE_65) | 1242×2688 | same 12 |
| `settle-mobile/screenshots/ipad/` | iPad 12.9" (IPAD_13) | 2048×2732 | same 12 |
| `settle-mobile/screenshots/play/` | Android phone | 1080×2400 | same 12 |
| `settle-mobile/screenshots/play-tablet/` | Android tablet | 1600×2560 | same 12 |

Upload: ASC → `node settle-mobile/scripts/asc-screenshot.mjs IPHONE_67 screenshots/ios/*.png`
(IPHONE_65 / IPAD_13 likewise); Play → Play Console listing image picker or
`eas-play-submit` images API. Feature graphic + hi-res icon already at
`settle-mobile/assets/play-feature-1024x500.png` / `play-icon-512.png`.
