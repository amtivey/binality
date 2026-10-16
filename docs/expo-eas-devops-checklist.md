# Expo / EAS devops prerequisites (checklist)

Companion to docs/expo-migration.md (section 7 and open questions Q1-Q3, Q6).
No credentials belong in git. Everything below is created or entered by the owner.

## 1. Current pipeline state (verified 2026-10-16)

- The repo had no CI at all (no .github/, no other CI config) on master, dev or the rollback branch.
- After the rollback there is no build step: the site is static files served as-is. No package.json, no lockfile.
- Added in this PR: .github/workflows/ci.yml running scripts/ci-check.sh (JS syntax, manifest JSON, programs/*.xml well-formed, no leftover native-wrapper files or references).
- Not configured: GitHub Pages, repo secrets (none exist), any deploy job. How www.virtualarenas.com/binality is deployed today is unknown (Q3).

## 2. Accounts the owner must have

[ ] Expo account (free tier works; paid plan only for priority builds/more build minutes). Create an organization or use a personal account, and decide the owner slug.
[ ] Apple Developer Program, $99/yr, individual or organization. Required for any iOS device build, TestFlight and the App Store. No Mac is needed, since EAS builds in the cloud (Q2).
[ ] Google Play Console, $25 one-time, if not already held (Q1).
[ ] GitHub repo admin on amtivey/binality, to add secrets and enable Actions.
[ ] Web hosting decision (Q3): keep virtualarenas.com/binality, GitHub Pages, or EAS Hosting.

## 3. Android signing and Play (decision needed first: Q1)

[ ] Find out whether com.virtualarenas.binality is still live on Play, and its last versionCode.
[ ] If yes: locate the original keystore (.jks/.keystore, alias, store and key passwords), or confirm Play App Signing is enabled (then only the upload key is needed, and it can be reset through Play support if lost).
[ ] If the key is lost and Play App Signing is off, the listing cannot be updated and a new application id and listing are needed.
[ ] Import the keystore into EAS with `eas credentials` (stored by EAS, not in git), or let EAS generate a new upload key for a new listing.
[ ] Create a Google Cloud service account with the Play Android Developer API enabled, grant it release permissions in Play Console, and download its JSON key (used for `eas submit`).
[ ] First upload to a new Play listing must be done by hand in the Console. Fill in the Data Safety form (no data collected), the content rating and the privacy policy URL (privacypolicy.html exists in the repo).

## 4. iOS signing and App Store

[ ] Register the bundle id (plan: com.virtualarenas.binality, plus a .dev variant for dev clients) in the Apple Developer portal.
[ ] Create the app record in App Store Connect and note the numeric ascAppId (goes in eas.json submit config, not secret).
[ ] Create an App Store Connect API key (Users and Access, Integrations; role App Manager). Keep the .p8 file, Key ID and Issuer ID. Used by `eas submit` and by EAS credential management.
[ ] Distribution certificate and provisioning profile: generated and stored by EAS (`eas credentials`). Needs Apple login, with 2FA, once.
[ ] Ad hoc testing on physical devices: `eas device:create` per device, or use TestFlight internal testing (no device UDIDs).
[ ] Review risk R5: "Pain Relief" and "Universal Healing" program names and health claims. Prepare the disclaimer and a privacy label of "data not collected" (Q8).

## 5. Secrets and where they live

Never committed. Set via `eas secret:create` or GitHub repo Settings, Secrets and variables, Actions.

  Name                          Where                 What it is
  EXPO_TOKEN                    GitHub Actions        Expo robot/access token for `eas build`, `eas update` and `eas submit` in CI
  Android keystore + passwords  EAS credentials       Stored in EAS via `eas credentials`, not in GitHub
  Play service-account JSON     EAS credentials       Android submit key (or a file secret, referenced by path in eas.json)
  ASC API key (.p8, id, issuer) EAS credentials       iOS submit key
  Web deploy credential         GitHub Actions        Depends on Q3: SSH key or FTP login for virtualarenas.com; nothing needed for GitHub Pages (uses GITHUB_TOKEN with pages:write); EXPO_TOKEN for EAS Hosting

Rules: use GitHub environments (preview, production) with required reviewers on production. Do not echo secrets in logs. Fork PRs must not receive secrets.

## 6. Pipeline work to do later (all belong to Expo task E8, not this PR)

Nothing is stubbed in the repo on purpose. There is no Expo project yet, so an eas.json or an EAS workflow would be unverifiable and could break the current static site. When E2 scaffolds the app:

[ ] eas.json with profiles development, preview and production, channels, `appVersionSource: remote` and fingerprint runtimeVersion (shape in expo-migration.md section 7). `eas init` and `eas build:configure` generate it.
[ ] Set the starting version above the legacy versionCode (`eas build:version:set`).
[ ] CI job on PR: install, lint, tsc, jest, `npx expo export -p web`. This replaces or extends scripts/ci-check.sh once the legacy files move to legacy-web/.
[ ] Web deploy job on merge to master: upload dist/ per the Q3 choice. If hosted under /binality, set `experiments.baseUrl` to /binality.
[ ] `eas update --channel preview` on merge to master; manual or tag-triggered production update.
[ ] Tag v* triggers `eas build --profile production` followed by `eas submit`. Use `--non-interactive`.
[ ] Enable branch protection on master requiring the CI check.

## 7. Questions the owner must answer before E8

Q1 (Play listing, keystore, last versionCode), Q2 (Apple account, bundle id), Q3 (web host and current deploy method), Q6 (PR target branch: master or dev).
