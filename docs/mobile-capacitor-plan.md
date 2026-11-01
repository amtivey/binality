# Binality mobile (Capacitor) plan

Consolidated plan for shipping Binality to Google Play and the App Store as a
Capacitor 8 app. Kanban t_6a311b6a (root request t_8ed4721f). Base: `origin/dev`
at 84ee5d4 (v2 UI, after PRs #22 and #24); rebased onto e3f3a63 on 2026-11-01.

This is the single plan. Three reference documents hold the detail and are
cited by section number. Where they disagree with this file, this file wins.

- `docs/mobile-capacitor-feasibility-audit.md` ("Audit"), from t_592e7261: code facts, risks R1-R10, canvas performance, plugins, project structure.
- `docs/mobile-ux-requirements.md` ("UX"), from t_277c9e2a: MUX-* requirements with pass/fail checks, mockups, store assets, device matrix.
- `docs/mobile-release-pipeline.md` ("Pipeline"), from t_23743c2c: toolchains, local builds, signing, versioning, CI outlines, store accounts, secrets.

Status: plan only. No part of it has been executed. The host used by the agents
has no JDK, Android SDK, Xcode, Mac or physical device, so every step that
needs a real device is marked as an owner step.

Progress snapshot (2026-11-01, dev at cb05ecd). This doc was rebased onto that
commit. Decisions and phases below are unchanged. Since this snapshot the
Status paragraph above is partly out of date: the Phase 0 scaffold and most of
Phase 1 are now code on dev. Device and simulator steps still have not been run.

- On dev: #54 privacy policy rewrite (M3.4 text, owner approval still
  pending), #55 M0.1 ci-check unlock + Node 22, #59 M1.1 web hardening, #71
  privacy policy font sentence. PR #56 M0.2 Capacitor 8 scaffold + platform
  shim, which brought #57 M0.3 mobile-build.yml and #58 M0.4 Android
  ForegroundAudio service. PR #64 (stacked) brought M1.2, M1.3, M1.4, M1.5 and
  the M1.6 P0 fixes #65, #66, #67, #69.
- Already on dev but still open: PRs #61 M1.2, #62 M1.3 and #63 M1.4. Their
  only commits not on dev are merge commits, so they can be closed. The same
  goes for issues #33, #34 and #35.
- Still open: #60 M2.5 icons/splash, #70 privacy contact address. #68 M1.6
  (>= 900 px touch windows) targets wt/t_21b576a2, which is now merged; retarget
  it to dev.
- Not yet verified: M0.3's first green mobile-build.yml run on dev (throwaway
  #74 is closed), the M0.4 device go/no-go and the M0.5 iPhone spike. These are
  owner steps on real hardware.
- Gate G1 (#25) was answered on 2026-11-01 (section 0.1). Gate G2 (#26) is
  still open, so the section 0.2 defaults apply.
- PR #72 (pipeline doc) is superseded by this branch: the same refreshed text
  is in `docs/mobile-release-pipeline.md`.

---

## 0. Open questions and costs for the owner

Engineering can start without answers. Phase 0 and Phase 1 are not blocked.
Each question has a default the team will use until you say otherwise. Two
gate cards collect the answers (see section 5). G1 is answered (0.1); G2 is
still open (0.2).

### 0.1 Questions (gate G1: engineering scope, card t_b17af878, issue #25)

| # | Question | Default if unanswered | Blocks | Owner answer (2026-11-01) |
|---|---|---|---|---|
| Q1 | Do you have a Mac with Xcode 26 and an iPhone for testing? Background audio on iOS can only be proven on a physical iPhone. A free Apple ID is enough for 7-day on-device installs from Xcode. | No. iOS stays CI simulator-only until the Apple account exists. | M0.5, M2.2, M2.4b | **No** (no Mac, no iPhone). Default applies: iOS is CI simulator-only. M0.5, M2.2 and M2.4b stay blocked until the Apple account exists (G2, Q6) and an iPhone tester is available, e.g. via TestFlight. |
| Q2 | Which physical Android phone(s) can you run test builds on (model, Android version)? Agents can only use emulators. | Your own phone, one device. | Acceptance of M0.4, M2.1, M2.6 | **Pixel 9 and Samsung Galaxy A72** (two devices; Android versions to be confirmed on the cards, expected Android 16 on the Pixel 9 and Android 14 / One UI 6.1 on the A72). Pixel 9 = UX device A (reference, gesture nav). A72 = the lower-power device for M2.6 profiling and Samsung battery-optimisation checks. |
| Q3 | iPad and tablet layout in 1.0? | No. iOS ships iPhone-only (no iPad screenshots). Android tablets get the Medium layout. The Expanded layout (MUX-LAYOUT-5) moves to 1.1. | M1.4, M4.1 | Default accepted. |
| Q4 | Optional 1.0 features: "Keep screen on while playing" (MUX-LIFE-8), "Sleep dim" (MUX-LIFE-9), haptics. | Keep-awake and haptics are in. Sleep dim is deferred to 1.1. | M2.3 | Default accepted. |
| Q5 | Capacitor is the path again (PR #5 removed it in favour of Expo; Expo was dropped in PR #21). Is there anything about the June 2026 wrapper (23856cf) you did not like that this plan should avoid? | Your request on t_8ed4721f is taken as approval. The 23856cf native code is reused. | Nothing | Default accepted. |

### 0.2 Questions (gate G2: accounts and store, card t_1213d078, issue #26)

| # | Question | Default if unanswered | Blocks |
|---|---|---|---|
| Q6 | Apple Developer Program: when will you enrol, and as an individual (seller name "Mat Tivey") or an organisation (needs a legal entity and D-U-N-S, takes weeks)? | Individual, enrolled once Android is in closed testing. | M3.3, M3.5b, M4.3 |
| Q7 | Google Play: (a) Was the developer account created before 2023-11-13? It published the 2014 app, so it should be, which exempts it from the "12 testers for 14 days" closed-test rule. Please confirm. (b) Is `com.virtualarenas.binality` already enrolled in Play App Signing? (c) Are you ready to export the 2017 key for Play App Signing if it is not? | (a) Yes, exempt. (b) Not enrolled. Enrol on the first AAB upload (section 2, D12). | M3.1, M3.5a |
| Q8 | Store name: is "Binality" free on the App Store? (Play already has the listing.) | "Binality", with "Binality: Binaural Beats" as the fallback. | M4.1, M4.3 |
| Q9 | Support email and support URL for both listings, and the copyright/seller line (README says "(c) 2014 Alexis Matthew Tivey"). | support@virtualarenas.com, https://binality.virtualarenas.com/, "(c) 2014-2026 Alexis Matthew Tivey". | M3.4, M4.1 |
| Q10 | Beta testers: Gmail addresses for Play closed testing, and Apple IDs for TestFlight. | You plus 2-5 friends. 12 or more if Q7a turns out to be "no". | M3.5a, M3.5b |
| Q11 | Does the repo stay public, and does the app stay free with no ads or in-app purchases? | Yes to both. Public repo means free macOS CI minutes. Free with no SDKs means the "no data collected" privacy answers hold. | M3.2, M3.3, M4.x |

### 0.3 Costs and lead times

| Item | Cost | Lead time | Notes |
|---|---|---|---|
| Apple Developer Program | USD 99 per year | Days (individual) to weeks (organisation) | Needed for TestFlight, App Store and CI signing. |
| Google Play Console | Already paid | None | The existing account and the unpublished `com.virtualarenas.binality` listing are reused. |
| Play closed test | Free | 14 days, only if Q7a is "no" | The longest calendar item if it applies. Start it as soon as M3.2 is green. |
| CI (GitHub Actions) | Free while the repo is public | None | macOS minutes are billed at 10x if the repo goes private. |
| Mac and iPhone | Optional hardware | None | Makes iOS debugging faster. Not required for the pipeline. |
| Everything else | Free | | Capacitor, plugins and fastlane are open source. |

---

## 1. Scope and target

- One codebase. The repo root stays the static website deployed to https://binality.virtualarenas.com/. Capacitor is added next to it (Audit section 7), and the native apps bundle a copy of the site.
- Platforms: Android (minSdk 24, target/compile SDK 36) and iOS (deployment target 15.0, iPhone only for 1.0 per Q3).
- Test hardware (G1): Android on the owner's Pixel 9 and Samsung Galaxy A72 (Q2). No Mac or iPhone (Q1), so iOS is proven in CI (simulator) until the Apple account exists and a TestFlight tester runs the device steps.
- Version: 3.0.0 (Pipeline section 4). Android versionCode starts at 48 or higher, because the last published build was 47 (versionName 2.27, 2017).
- 1.0 feature set: everything in the web app, plus background/screen-off playback, interruption handling, lock-screen controls, the native share sheet, a back-button handler, safe areas, and the touch/layout requirements marked P0 in UX. P1 UX items are in 1.0 unless deferred in section 2. P2 items are 1.1 or later.
- Out of 1.0: deep links for `#preset=` (Audit section 8 task 12), "Open in Binality" XML import (MUX-IN-8 native part), sleep dim, home-screen widgets and shortcuts, the Expanded tablet layout, the iPad build, and a 30 fps battery-saver toggle.

---

## 2. Decisions (conflicts and gaps resolved)

These are settled for implementers. Card bodies repeat the ones they depend on.

| # | Topic | Decision | Why / source |
|---|---|---|---|
| D1 | Build base | `dev` (v2 UI). | UX 0.2 assumed v2 was not on `dev`. It is now (PRs #22 and #24), so that open decision is closed. |
| D2 | Wrapper | Capacitor 8.5.x, Node 22, JDK 21, Xcode 26, SPM (no CocoaPods). | Audit section 6, Pipeline 1.1. |
| D3 | Project layout | Repo root = web app. New: `package.json`, `capacitor.config.json`, `scripts/copy-www.mjs`, `js/platform.js`, committed `android/` and `ios/`, gitignored `www/`, source art in `assets/`. | Audit section 7. UX says `assets/`, Audit says `resources/`: `assets/` wins, with the UX 10.1 file names, which `@capacitor/assets` reads. |
| D4 | `www/` allowlist | index.html, privacypolicy.html, manifest.webmanifest, favicon.ico, apple-touch-icon-precomposed.png, css/, js/, images/, programs/, fonts/. Not `sw.js`, 404.html, robots.txt, humans.txt, crossdomain.xml, docs/, scripts/. | Audit and Pipeline disagreed on `sw.js`. It is excluded because it is never registered on native (D6). |
| D5 | IDs | appId `com.virtualarenas.binality`, appName "Binality". Debug builds use `applicationIdSuffix ".dev"`. Keep `server.androidScheme` = https and hostname = localhost forever, and never set `server.url`. | G1/G2 answers (issues #7, #8). Audit R9: changing the origin wipes stored data. |
| D6 | Native detection | `js/platform.js` exposes `window.BinalityPlatform` from `window.Capacitor`, with no imports and no bundler. On native it skips `initPwaServiceWorker()` and hides the install, update and "offline PWA" UI. | Audit 5.1 and R3, MUX-NATIVE-3. |
| D7 | Background audio | Android: port `AudioForegroundService` + `ForegroundAudioPlugin` from 23856cf (FGS type mediaPlayback, partial wake lock, ongoing notification with a Stop action). iOS: `UIBackgroundModes` audio, `AVAudioSession` category `.playback`, non-mixing, set in `AppDelegate`, plus `navigator.audioSession.type = 'playback'`. Fallback if WKWebView still suspends: a looping silent `<audio>` keep-alive. Android is accepted on both owner phones (Pixel 9, Galaxy A72; the A72 also checks Samsung's "sleeping apps" battery limits). The iOS part is unproven until a physical iPhone is available (G1 Q1 = no). | Audit R1, MUX-LIFE-1. The G1 answer to Q7 was "ignore the silent switch". The UX doc recommends non-mixing. G1 2026-11-01: Q1 no, Q2 two Android phones. |
| D8 | Timers | The sleep timer, program end and fades are scheduled on the audio clock (`osc.stop(t)`, gain ramps). The UI is re-synced from `context.currentTime` on resume. Tick counting is not allowed. | Audit R2, MUX-LIFE-2. |
| D9 | Orientation | No lock on any device. iPhone: portrait plus both landscapes. Android: `screenOrientation="fullUser"` and the `configChanges` set from 23856cf. No screen-orientation plugin. No iPad orientation keys in 1.0 (iPhone-only, Q3). | UX 4. G1 2026-11-01 confirmed the Q3 default. Audit listed the plugin as "only if UX locks", and UX does not lock. |
| D10 | Lock-screen controls | In 1.0, after background audio works. Android: MediaSession in the FGS notification. iOS: `MPNowPlayingInfoCenter` + `MPRemoteCommandCenter`. Play/pause only, no seek. Required for store submission, not for beta. Android is verified on both owner phones. The iOS part (M2.4b) waits for a physical iPhone (G1 Q1 = no). | UX made this P0 (MUX-LIFE-6). Audit made it P2. Resolved toward the UX doc because it supports the App Store 4.2 review argument. |
| D11 | Fonts | Self-host Outfit, Plus Jakarta Sans and JetBrains Mono as woff2 in `fonts/`, drop the Google Fonts links, and update `sw.js` precache. This benefits the web build too. | All three docs. It is required for "Data Not Collected". |
| D12 | Android signing | Reuse the owner's 2017 key. If the app is not in Play App Signing, enrol on the first AAB upload using that key as the app signing key (PEPK export, owner only). Then create a new upload key for CI. Never generate a different app-signing key, because that would orphan the listing. The original key never goes into CI or chat. `BUILD_OFFSET` is set so the first versionCode is 48 or higher. | G2 answer. Supersedes Pipeline 3.2, which assumed a fresh account. |
| D13 | iOS signing | fastlane `match` with a private `amtivey/binality-certs` repo, bootstrapped from a manual macOS workflow. No Mac required. | Pipeline 5.4. |
| D14 | CI | `ci.yml` stays for static checks. `scripts/ci-check.sh`'s anti-Capacitor guard is inverted (www/ and node_modules/ must be untracked, capacitor.config.json must be valid JSON). New `mobile-build.yml` (debug, no secrets) and `mobile-release.yml` (tag `mobile-v*`, `mobile-release` environment, owner as required reviewer). Runners pinned to ubuntu-24.04 and macos-26. | Pipeline 5, Audit 5.6. |
| D15 | Versioning | `package.json` `version` is the marketing version (3.0.0). The build number is the release workflow run_number plus `BUILD_OFFSET`, shared by both platforms. | Pipeline 4. |
| D16 | Program names | Keep "Pain Relief" and "Universal Healing" with the existing disclaimer, shown in the app and at the top of both store descriptions. Rename only if a reviewer rejects them. | G2 answer to Q8. |
| D17 | Category, rating, audience | Health & Fitness on both stores. Expected rating 4+ / Everyone. Play target audience 13+. | UX 10.4, Pipeline 6.1. |
| D18 | Privacy | Rewrite `privacypolicy.html` to describe what the app actually does (offline, no accounts, no analytics, localStorage only) and publish it at https://binality.virtualarenas.com/privacypolicy.html. That URL currently returns 404, while the site root returns 200 (checked 2026-10-19). Store answers: "Data Not Collected" (Apple) and "no data collected or shared" (Play). | All three docs, G2 Q3 answer. |
| D19 | Layout classes | Compact under 600 px, Medium 600-899 px, Expanded 900 px and up, plus a "short" modifier below 500 px height. They replace the existing 640/600 px breakpoints. Expanded is deferred (Q3). | UX 3. PR #24's mobile declutter is the starting point. |
| D20 | Canvas | Fix the fractional-DPR realloc bug (`Math.floor`, as `renderStudioPreview` already does), cap DPR at 2, skip `chart.replot()` when hidden or not the active view, and reduce `shadowBlur` on low-power devices. | Audit section 4, MUX-LAYOUT-3. |
| D21 | Dev timer option | Hide the "10s Test" timer entries (index.html:311, :543) in native release builds. | UX 10.5. |
| D22 | Base frequency range | 20-1500 Hz, clamped on blur with an inline message. | Owner answer to issue #7 Q4. UX MUX-IN-10 said 100-1000; the owner's answer wins. |

---

## 3. Phased plan

Sizes: S is half a day or less, M is 1-2 days, L is 3-5 days. Owners are
board profiles. "Owner" means the human owner (amtivey).

Hotspot: `js/index.js` (5.1k lines) and `css/index.css` are touched by almost
every web card. The software-engineer-webdev cards are chained in one serial
lane (M0.2, M0.4, M1.1 ... M1.5, M2.1, M2.3, M2.4a, M2.6) so they never run in
parallel against the same files. Each card is a separate PR against `dev`.

### Phase 0: Capacitor scaffold, running in an emulator/simulator

Goal: an Android debug APK that runs offline in an emulator, an iOS simulator
build that compiles in CI, and a go/no-go on background audio.

- M0.1 CI unlock (devops, S). Invert the guard in `scripts/ci-check.sh`, move `ci.yml` to Node 22, and add the `.gitignore` entries from Pipeline section 2. Done when CI is green on `dev` with a placeholder `capacitor.config.json` and fails if `www/` or `node_modules/` is committed.
- M0.2 Capacitor scaffold (software-engineer-webdev, M; after M0.1). Add `package.json` with Capacitor 8.5.x and scripts (build, sync, android, ios, cap:doctor), `capacitor.config.json` (D5), `scripts/copy-www.mjs` (D4, ported from 23856cf), `npx cap add android` and `npx cap add ios` (SPM), `js/platform.js` (D6) and the SW/PWA suppression, SystemBars light style on #070314, and a temporary splash and icon. Done when `npm run build && npx cap sync` is clean, `./gradlew assembleDebug` produces an APK that runs in an API 36 emulator in airplane mode (program loads, chart draws, audio plays), there is no install/update toast on native, and the web build is unchanged.
- M0.3 Debug CI workflow (devops, S-M; after M0.2). Add `mobile-build.yml`: an Android debug APK artifact on ubuntu-24.04, and an iOS simulator `xcodebuild ... CODE_SIGNING_ALLOWED=NO` on macos-26, gated to native-touching PRs. Done when both jobs are green on a PR and the APK is downloadable. This is the first proof that the iOS project builds.
- M0.4 Android background audio (go/no-go) (software-engineer-webdev, S-M; after M0.2). Port the FGS and plugin from 23856cf, add the POST_NOTIFICATIONS prompt at first Start with a pre-prompt, and wire `BinalityPlatform.keepAlive.start/stop` into `start()`/`stop()`. Done when an emulator run passes 10 minutes with the screen off, and the owner runs the debug APK on both phones (Q2: Pixel 9 and Galaxy A72) for 30 minutes screen-off with no dropout, and the result per device (model, Android version) is recorded on the card. On the A72, test with the default Samsung battery settings first.
- M0.5 iOS background audio spike (software-engineer-webdev, M; after M0.2 and G1; blocked until the Apple account (G2, Q6) and an iPhone tester exist, because G1 Q1 = no). Add `UIBackgroundModes` audio, `AVAudioSession .playback` in `AppDelegate.swift` and `navigator.audioSession`. Run on a physical iPhone with iOS 17 or later: 30 minutes locked, the silent switch on, an app switch, and a call interruption. If it fails, try the silent-`<audio>` keep-alive. Done when the result is recorded as go, go-with-fallback or no-go. A no-go stops the iOS track and is escalated to the owner.

### Phase 1: touch controls and layout (web code, testable in browser device emulation)

All Phase 1 work also improves the PWA. Requirement IDs refer to the UX doc.

- M1.1 Web hardening (software-engineer-webdev, M; after M0.2). Self-host fonts (D11), the DPR fix, cap and redraw gating (D20), `context.suspend()` on stop (Audit R10), and `@media (hover: hover)` around hover rules (MUX-TAP-5). Done when the first launch in airplane mode looks identical (MUX-VIS-4), canvas width stays stable across frames at DPR 2.625 in DevTools, and there are no Google Fonts requests in the network log.
- M1.2 Timers and lifecycle (software-engineer-webdev, M; after M1.1). Audio-clock sleep timer and program end (D8), `onstatechange`/`visibilitychange` handling, pausing rAF and DOM writes while hidden (MUX-LIFE-3), re-syncing on resume, persisting position (MUX-LIFE-7), and the 3 s fade-in and 300 ms fade-out (MUX-LIFE-10). Done when a 10-minute timer in a backgrounded Chrome tab ends within 2 s, a suspended context never shows "stop", and a cold start restores program and position without autoplay.
- M1.3 Touch input and tap targets (software-engineer-webdev, M; after M1.2). Pointer-event chart scrub and tap-to-seek (MUX-IN-1..3), `touch-action` and scroll containment (MUX-IN-6), visible close buttons (MUX-IN-5), input sizing (MUX-IN-10), all MUX-TAP-* items, and the hit-area extensions for header, scope and Studio controls (MUX-STU-1). Done when UX acceptance script steps 6 and 10 pass in Chrome device emulation at 360x800.
- M1.4 Responsive layout and safe areas (software-engineer-webdev, L; after M1.3). Width classes (D19), MUX-LAYOUT-1..4, 6, 7, MUX-SAFE-1..4, 6, 7, full-screen sheets on Compact and Medium, and the short-landscape layout B. The Expanded layout is deferred (Q3). Done when every size in MUX-LAYOUT-4 renders without clipping or horizontal scroll and survives 200% font scale.
- M1.5 HUD, accessibility and first-run (software-engineer-webdev, M; after M1.4). The UX section 7 HUD table, MUX-HUD-1..6, the program quick-switch sheet (MUX-IN-7), the MUX-VIS-* items including reduced motion and screen-reader labels, the first-run notice and disclaimer access (MUX-LIFE-10, 12), and hiding the 10s test timer on native (D21). Done when the 320x568 header has no overflow, there is no title-only information, and VoiceOver/TalkBack can complete a session in emulators.
- M1.6 UX QA pass in emulators (tech-artist, M; after M1.5 and M0.3). Run UX section 11 steps 1, 5, 6, 9, 10 and 12 on emulators/simulators (devices A-H where they can be emulated), file defects as comments or child cards, and capture reference screenshots. Done when there are no open P0 layout or touch defects.

### Phase 2: native polish, plugins and performance

- M2.1 Android native integration (software-engineer-webdev, M; after M0.4, M1.2, M1.5). Audio focus (transient loss pauses, permanent loss stops), `ACTION_AUDIO_BECOMING_NOISY` stops with a toast, all routed through the same `start()`/`stop()` paths (MUX-LIFE-4); back-button priority (MUX-IN-4); manifest orientation and `singleTask` (D9, MUX-NATIVE-5); edge-to-edge bars (MUX-SAFE-5); and a monochrome notification icon. Done when UX steps 3, 4, 5 and 7 pass on an emulator and on both owner phones (Pixel 9, Galaxy A72).
- M2.2 iOS native audio session and interruptions (software-engineer-webdev, M; after M0.5 and M1.2). Interruption and route-change observers bridged to the web layer (MUX-LIFE-4), status bar style, orientation plist keys (MUX-ORI-1), iPhone-only device family, and `ITSAppUsesNonExemptEncryption=false`. Done when UX steps 2, 3, 4 and 8 pass on a physical iPhone. G1 Q1 = no, so it needs the Apple account plus an iPhone tester.
- M2.3 Cross-platform plugins (software-engineer-webdev, M; after M2.1). `@capacitor/browser` for external links (MUX-NATIVE-4); Filesystem + Share for XML export and preset links with the canonical `https://binality.virtualarenas.com/#preset=` base (Audit R5, MUX-IN-9); a Preferences mirror of `binalityCustomPresets` (Audit R9); splash hidden after first paint (MUX-NATIVE-1); keep-awake setting (MUX-LIFE-8, Q4); haptics (MUX-TAP-8). Done when export, share and links work on the Android emulator and the iOS simulator, and presets survive clearing WebView data.
- M2.4a Android lock-screen controls (software-engineer-webdev, M; after M2.3). MediaSession on the FGS notification with title, artwork, and play/pause/stop, plus headset button support (D10). Done when lock-screen and Bluetooth play/pause work on both owner phones (Pixel 9, Galaxy A72) and the UI state matches.
- M2.4b iOS Now Playing (software-engineer-webdev, M; after M2.2). `MPNowPlayingInfoCenter` and `MPRemoteCommandCenter` play/pause (D10). Done when the lock screen and Control Center show the program and the controls work on a physical iPhone (needs the Apple account plus a tester, G1 Q1 = no).
- M2.5 App icon, splash and notification art (tech-artist, M; after M0.2). Masters from UX 10.1 in `assets/`, generated with `@capacitor/assets`, a notification small icon, a regenerated 180 px apple-touch-icon, and the Play 512 px icon. Done when no Capacitor placeholder art is left, the adaptive and themed icons look right on API 33 or later, and the iOS icon is 1024 px with no alpha channel.
- M2.6 Performance and battery pass (software-engineer-webdev, M; after M2.4a). A `.native-lowpower` class (Audit 4.6), `shadowBlur` reduction (Audit 4.3), and profiling on the Galaxy A72 (the lower-power owner phone). Done when the scope holds 50 fps or more on the Galaxy A72, and a 60-minute screen-off run uses 6% battery per hour or less on both the Pixel 9 and the Galaxy A72 (MUX-LIFE-1, -3).

### Phase 3: CI builds, signing and beta testing

- M3.1 Android release signing and versioning (devops, M; after M0.3 and G2). Gradle signing from env/`keystore.properties`, version env vars, `BUILD_OFFSET` giving a versionCode of 48 or higher, and the D12 key procedure with the owner. Done when `apksigner verify` passes with the upload key, the owner has uploaded the first AAB to internal testing by hand, and Play App Signing is confirmed.
- M3.2 Release workflow and Play internal upload (devops, M; after M3.1). `mobile-release.yml` Android job, fastlane `internal` lane, Play service account, the `mobile-release` environment with the owner as reviewer, and tag protection. Done when tag `mobile-v3.0.0-rc1` lands a build in Play internal testing with no manual steps.
- M3.3 iOS signing and TestFlight (devops, M; after M0.3 and G2, once Apple enrolment is done). Bundle ID and App Store Connect app record (owner), API key, `match` bootstrap, the fastlane `beta` lane, and the iOS job in `mobile-release.yml`. Done when a tagged build is processed in TestFlight.
- M3.4 Privacy policy (software-engineer-webdev, S; no dependencies). Rewrite `privacypolicy.html` (D18) and add the safety content from Pipeline 6.3. The owner approves and publishes it at the stable URL. Done when the URL returns 200 with the new text and the Data Safety and App Privacy draft answers are attached to the card.
- M3.5a Android beta and device QA (tech-artist, M plus calendar time; after M3.2, M2.6, M2.5, M1.6, M3.4). Fill in the Play app-content forms needed for closed testing, run the closed track with Q10 testers (14 days with 12 testers only if Q7a is "no"), run the full UX section 11 script on the owner's Pixel 9 (device A) and Galaxy A72 (stands in for device B; use an emulator for B's 360 px width and 3-button nav), and triage feedback. Done when there are no P0 defects open and the tester feedback summary is posted on the card.
- M3.5b iOS beta and device QA (tech-artist, M; after M3.3, M2.4b, M2.5, M1.6, M3.4). Internal TestFlight, then external TestFlight (Beta App Review), and UX section 11 on devices C and D. Done when there are no P0 defects open.

### Phase 4: store submission

- M4.1 Store listing assets and copy (tech-artist, M; after M1.6 and M2.5). The six-scene screenshot set (UX 10.3) for Android phones and the 6.9-inch iPhone, the 1024x500 feature graphic, short and full descriptions with the disclaimer at the top (D16), and review notes. No medical claims in captions. Done when the assets are attached to the card and the owner has approved the copy.
- M4.2 Google Play production submission (devops, M; after M3.5a, M4.1, M3.4). Data safety, IARC rating, target audience, health-apps declaration, the FGS mediaPlayback declaration with a demo video, the listing upload, and production with a staged rollout. Form answers are the owner's legal statements, so devops prepares them and the owner confirms. Done when 3.0.0 is live in production, starting with a staged rollout.
- M4.3 App Store submission (devops, M; after M3.5b, M4.1, M3.4). App Privacy label, age rating, screenshots, review notes (offline, native background audio, not a medical device; the 4.2 and 1.4.1 arguments from Pipeline 6.2), and submit with a phased release. Done when the app is approved and released.

### Critical path

    Android:  M0.1 -> M0.2 -> M0.4 -> M1.1..M1.5 -> M2.1 -> M2.3 -> M2.4a -> M2.6 -> M3.5a -> M4.2
              M0.3 -> M3.1 (G2) -> M3.2 --------------------------------------^
    iOS:      M0.2 -> M0.5 (G1) -> M2.2 -> M2.4b -> M3.5b -> M4.3
              M3.3 (G2, Apple enrolment) ---------------^
    Parallel: M3.4 (now), M2.5 (after M0.2), M1.6, M4.1

The Android track finishes first. The iOS track is limited by Q6 (Q1 is "no"), not by
engineering. Engineering on the webdev lane is about 15-20 working days. The
other lanes run in parallel with it.

---

## 4. Risks (top five)

1. iOS background Web Audio in WKWebView (Audit R1). Mitigation: M0.5 spike with a fallback. If that fails, a native audio engine is a separate re-plan.
2. Timers drifting in the background (Audit R2). Handled in M1.2 before any device work.
3. App Store 4.2 "website wrapper" rejection. Mitigation: offline bundle, native background audio, lock-screen controls (D10), native share and haptics, all explained in the review notes.
4. Health-claim review under guideline 1.4.1 and Play health policy (D16). The fallback is a rename if a reviewer rejects the names.
5. The Play listing key (D12). If the 2017 key were lost, the listing could not be updated. The owner confirmed he has it, and it must be backed up in two places before M3.1.

---

## 5. Board and GitHub tracking

Each work item is a kanban card with a matching GitHub issue labelled
`capacitor-mobile`. The two gates are labelled `decision-needed` and start
blocked; the owner answers on the gate card or issue, and software-architect
folds the answers into section 0 and section 2 of this file.

All cards also depend on t_6a311b6a (this plan), so they wait until it is done.

| ID | Card | Issue | Owner profile | Depends on |
|---|---|---|---|---|
| G1 | t_b17af878 | #25 | software-architect (owner answers) | - |
| G2 | t_1213d078 | #26 | software-architect (owner answers) | - |
| M0.1 | t_ce9694f7 | #27 | devops | - |
| M0.2 | t_bccdefe5 | #28 | software-engineer-webdev | M0.1 |
| M0.3 | t_85cd6feb | #29 | devops | M0.2 |
| M0.4 | t_04189ed4 | #30 | software-engineer-webdev | M0.2 |
| M0.5 | t_7c384c70 | #31 | software-engineer-webdev | M0.2, G1 |
| M1.1 | t_a4960ff1 | #32 | software-engineer-webdev | M0.2 |
| M1.2 | t_a2416d8d | #33 | software-engineer-webdev | M1.1 |
| M1.3 | t_143e1fc6 | #34 | software-engineer-webdev | M1.2 |
| M1.4 | t_208dc861 | #35 | software-engineer-webdev | M1.3 |
| M1.5 | t_21b576a2 | #36 | software-engineer-webdev | M1.4 |
| M1.6 | t_9963e204 | #37 | tech-artist | M1.5, M0.3 |
| M2.1 | t_80a0916a | #38 | software-engineer-webdev | M0.4, M1.2, M1.5 |
| M2.2 | t_e8f15492 | #39 | software-engineer-webdev | M0.5, M1.2 |
| M2.3 | t_a8a3a55a | #40 | software-engineer-webdev | M2.1 |
| M2.4a | t_906d759a | #41 | software-engineer-webdev | M2.3 |
| M2.4b | t_99cd7d40 | #42 | software-engineer-webdev | M2.2 |
| M2.5 | t_3f37bfd9 | #43 | tech-artist | M0.2 |
| M2.6 | t_688df000 | #44 | software-engineer-webdev | M2.4a |
| M3.1 | t_4a229fed | #45 | devops | M0.3, G2 |
| M3.2 | t_f3a895de | #46 | devops | M3.1 |
| M3.3 | t_01172391 | #47 | devops | M0.3, G2 |
| M3.4 | t_495792c3 | #48 | software-engineer-webdev | - |
| M3.5a | t_88c695f4 | #49 | tech-artist | M3.2, M2.6, M2.5, M1.6, M3.4 |
| M3.5b | t_3a62b784 | #50 | tech-artist | M3.3, M2.4b, M2.5, M1.6, M3.4 |
| M4.1 | t_e1ad1114 | #51 | tech-artist | M1.6, M2.5 |
| M4.2 | t_04968fa4 | #52 | devops | M3.5a, M4.1, M3.4 |
| M4.3 | t_db68cf9c | #53 | devops | M3.5b, M4.1, M3.4 |
