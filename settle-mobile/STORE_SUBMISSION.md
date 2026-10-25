# Settle In Peace — App Store Submission Runbook

Status as of 2026-10-25 (agent: devin-mobile-settle).

## Current config

| Field | Value |
|---|---|
| App name | Settle In Peace |
| Slug / EAS project | `settle-mobile` → `@notyced/settle-mobile` |
| EAS project ID | `dad6fd70-85a6-4533-be1b-af97a18eb887` |
| Bundle ID (iOS) | `com.settleinpeace.mobile` |
| Package (Android) | `com.settleinpeace.mobile` |
| Version / build | 1.0.0 / iOS buildNumber 1, Android versionCode 1 (EAS auto-increments) |
| Prod API | `https://api.settleinpeace.com` |
| Privacy policy URL | https://settleinpeace.com/privacy-app (live, verified 200) |
| Support URL | https://settleinpeace.com · support@settleinpeace.com |

> Bundle ID / package name are **immutable once published** — confirm
> `com.settleinpeace.mobile` is what you want before the first upload.

## Commands (run from `settle-mobile/`, nvm node on PATH)

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"

# --- iOS ---
npx eas-cli@latest credentials                 # one-time: Apple login, EAS manages certs
npx eas-cli@latest build -p ios -e production  # produces .ipa (requires Apple team)
npx eas-cli@latest submit -p ios -e production # needs ASC app record first

# --- Android ---
npx eas-cli@latest build -p android -e production   # produces .aab
npx eas-cli@latest submit -p android -e production  # needs Play service-account JSON at
                                                    # ./credentials/google-play-service-account.json

# --- Internal testing (no store records needed) ---
npx eas-cli@latest build -p android -e preview      # APK, side-loadable
npx eas-cli@latest build -p all -e preview          # internal distribution
```

## Blocking items (need owner/human)

1. **Apple Developer account / ASC app record** — no Apple creds on this box.
   Need: Apple ID with Developer Program membership ($99/yr), create app record
   "Settle In Peace" / `com.settleinpeace.mobile` in App Store Connect.
   `eas credentials` will prompt for Apple login to generate certs/profile.
2. **Google Play Console** — need: Play Developer account ($25 one-time),
   create app record `com.settleinpeace.mobile`, generate a service-account
   JSON (Play Console → Setup → API access) and drop it at
   `settle-mobile/credentials/google-play-service-account.json` (gitignored).
3. **Expo account choice** — project was created under `@notyced`
   (the only Expo login on this box; other orgs: prime-transit, dexana,
   favestate — no Settle org). If a dedicated `settle` org is wanted,
   create it on expo.dev then re-run `eas init --id`.
4. **EAS billing** — builds consume credits/minutes on the Expo plan.
   First `eas build` will fail non-interactively if the notyced plan has
   no remaining build capacity; check https://expo.dev/accounts/notyced/settings/billing.
5. **Screenshots + listing copy** — ASC needs 6.7" + 6.5" (and iPad if
   supportsTablet stays true) screenshots; Play needs phone + 7"/10" tablet,
   feature graphic 1024×500, hi-res icon 512×512 (have: assets/icon.png 1024²).
6. **SDK 57 decision** — expo-doctor flags a Hermes V1 memory regression
   in RN 0.85 (fixed in RN 0.86.2 / SDK 57 / expo@57.0.9+). Upgrading is
   recommended before or immediately after first submission, not mandatory.

## Store review checklist

### Apple App Store Connect
- [x] In-app account deletion (Profile → Delete Account → DELETE /auth/account)
- [x] Privacy policy URL: https://settleinpeace.com/privacy-app
- [x] Face ID usage description set (expo-local-authentication is bundled)
- [ ] App record created (needs Apple account)
- [ ] Screenshots: 6.7", 6.5", iPad 12.9" (supportsTablet: true)
- [ ] Age rating questionnaire (financial content → likely 4+/17+ per gambling/financial rules — none apply, expect 4+)
- [ ] Review notes: demo account for reviewer if login required
- [ ] Export compliance: standard HTTPS only → "no exempt encryption beyond standard" → ITSAppUsesNonExemptEncryption = false (can set via ios.infoPlist to skip the question)

#### App Privacy (nutrition labels) — answers
- **Collects data:** Yes
- Contact Info → Name, Email Address, Phone Number (optional) — linked to user, App Functionality
- Financial Info → Other Financial Info (debt balances, creditors, rates) — linked, App Functionality
- Identifiers → User ID — linked, App Functionality
- User Content → Other User Content (assessment chat text) — linked, App Functionality
- Sensitive Info → Sensitive Info (debt-relief context) — linked, App Functionality
- **Not collected:** location, contacts, photos, browsing history, diagnostics,
  health data, precise location. No third-party SDKs track users (axios +
  AsyncStorage + react-navigation only). **Tracking: No** → no ATT prompt needed.

### Google Play Console
- [x] Data-safety answers prepared (below)
- [ ] Play app record created (needs Play account)
- [ ] Service-account JSON for `eas submit`
- [ ] Content rating questionnaire (IARC)
- [ ] Target audience: adults (financial app — NOT for children; do not select 13 & under)
- [ ] News apps / declarations: N/A; Financial features declaration → debt-management app
- [ ] Data deletion: in-app (Profile → Delete Account) + web URL — set
      "account deletion URL" to https://settleinpeace.com/privacy-app or a
      dedicated deletion page if one is added

#### Data safety form — answers
- Data collected: Name, Email, Phone (optional), User IDs, Financial info
  (debt data), App activity in the form of user-entered assessment text.
- Shared with third parties: **No** (app only talks to api.settleinpeace.com;
  backend shares with relief providers only with explicit consent — see privacy policy).
- Encrypted in transit: **Yes** (HTTPS).
- Data can be deleted: **Yes** (in-app account deletion).
- Committed to Play Families Policy: No (adult financial app).
- Security practices: reviewed against OWASP MASVS → Yes (JWT auth, TLS,
  no PII in logs on mobile side).

## Known non-blocking issues

- `src/theme/colors.ts` has an uncommitted local tweak: `slateDark: '#fff'`
  (was `#334155`). Kept per instructions, but slateDark is used for muted
  text — white-on-white could render some text invisible. Verify on a real
  build before release; likely needs reverting.
- `@settle/shared-sdk` and `@react-navigation/stack` are declared but
  unused in code. Harmless; can prune later.
- Assessment chat is a local stub — replies are canned, nothing is sent to
  the API. Fine for v1; data-safety answers already cover it.
