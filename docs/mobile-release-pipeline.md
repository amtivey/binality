# Binality mobile (Capacitor) - build & release pipeline

Reference document for `docs/mobile-capacitor-plan.md` (the consolidated plan,
task t_6a311b6a). Written by the devops workstream (task t_23743c2c). Where this
file and the plan disagree, the plan wins. In particular, the plan's section 2
("Decisions") overrides 3.2 here: the owner already has the 2017 Play keystore
for `com.virtualarenas.binality` (last versionCode 47), so the first release
reuses that listing and key rather than generating a fresh upload key first.
The open questions in section 10 have been merged into the plan's top section;
several are already answered there.

---

## Build & release pipeline

Scope: how to produce signed debug and release builds of Binality for Android
(Google Play) and iOS (App Store) from this repo, how CI does it, what secrets
exist, and what the owner has to buy or sign up for.

Status of this document: researched and written against `origin/dev`, then
refreshed on 2026-11-01 against dev at e3f3a63 (after PRs #54, #55, #59, #71 and
the M0.3 debug workflow, PR #57). Nothing in it has been executed end to end, because
there is no Capacitor project in the tree and the devops host has no JDK,
Android SDK or Xcode (see 1.2). Toolchain versions and store policies were
checked against official sources on 2026-10-19; re-check the ones marked
"verify" before acting on them.

### 0. Summary and critical path

1. iOS builds need macOS and Xcode 26 or later. Android builds do not.
2. Both can be built on GitHub-hosted runners. This repo is public, so standard
   Linux and macOS runners are free. If the repo goes private, macOS minutes are
   billed at a multiplier (see 1.3).
3. Plan: Capacitor 8, a GitHub Actions workflow with one Android job (ubuntu)
   and one iOS job (macOS), and fastlane for upload and iOS signing.
4. The slowest item is not engineering. A new personal Google Play developer
   account must run a closed test with at least 12 testers opted in for 14
   consecutive days before it can apply for production access. Start that
   clock as early as possible. Account sign-up (Apple review can take days,
   D-U-N-S for an organisation can take weeks) is the other lead-time item.
5. Costs: Apple Developer Program USD 99 per year, Google Play Console USD 25
   one time. Everything else in this plan is free at current usage.

Critical path (calendar time):

    owner: enrol Apple + Google accounts (days to weeks)
      -> Android: first AAB to internal testing -> closed test, 12 testers x 14 days
         -> apply for production -> Google review -> release
      -> iOS: first build to TestFlight -> App Review -> release
    engineering (Phase 0-2) can run in parallel with account enrolment.

### 1. Environment and toolchains

#### 1.1 Required toolchain (Capacitor 8)

| Tool | Version | Needed for | Notes |
|---|---|---|---|
| Node.js | 22 or newer | everything | CLI declares engines.node >= 22. `ci.yml` already uses Node 22 (PR #55). |
| JDK | 21 | Android | Android Studio bundles one; CLI/CI needs JAVA_HOME = JDK 21. JDK 17 fails with "invalid source release: 21". |
| Android Studio | Otter 2025.2.1 or newer | Android (local) | Older studio rejects AGP 8.13. |
| Android SDK | platform 36, build-tools 36.x, cmdline-tools | Android | minSdk 24, compile/target 36 (Capacitor 8 defaults, same as the previous wrapper in commit 23856cf). |
| Gradle / AGP | wrapper 8.14.x / AGP 8.13 | Android | Pinned by the generated android/ project. Do not use a system Gradle. |
| Xcode | 26.0 or newer (macOS only) | iOS | Capacitor 8 minimum, and Apple has rejected uploads from older Xcode since 2026-04-28 (iOS 26 SDK required). |
| iOS deployment target | 15.0 | iOS | Capacitor 8 default. |
| Swift Package Manager | bundled with Xcode | iOS | Default for new Capacitor 8 iOS projects. Use `npx cap add ios --packagemanager CocoaPods` only if a plugin needs pods. |
| CocoaPods + Homebrew | optional | iOS | Only if CocoaPods is chosen. With SPM there is no App.xcworkspace; use App.xcodeproj in scripts. |
| Ruby 3.x + Bundler | 3.2 or newer | fastlane | macOS runners and Ubuntu runners ship Ruby. Pin fastlane in a Gemfile. |
| fastlane | current 2.x | upload, iOS signing | Free, open source. |

Decision recorded for the consolidated plan: use SPM, not CocoaPods, unless a
chosen plugin forces it. The plugin set is expected to be small (a custom
foreground-audio plugin plus status bar / keep-awake), so SPM is fine.

#### 1.2 What we have available today

- Devops host: Linux x86_64 container, 16 cores, 30 GB RAM, Node 26, npm,
  Docker, gh. No JDK, Android SDK, adb, Ruby, fastlane, Xcode. No macOS machine
  or Mac runner is available to the agent.
- Therefore: iOS builds cannot happen on our own infrastructure. They run on a
  GitHub-hosted macOS runner, or on a Mac the owner provides.
- Android builds can run on GitHub-hosted ubuntu runners (preferred), or locally
  on the devops host after installing JDK 21 and the Android command-line tools
  (about 3 GB). Local setup, if wanted:

      # as a user with write access to ~/android-sdk
      apt-get install -y openjdk-21-jdk-headless unzip
      mkdir -p ~/android-sdk/cmdline-tools && cd ~/android-sdk/cmdline-tools
      # download "commandlinetools-linux-*_latest.zip" from developer.android.com/studio
      unzip commandlinetools-linux-*.zip && mv cmdline-tools latest
      export ANDROID_HOME=~/android-sdk JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
      yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses
      $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"

  There is no emulator or KVM acceleration requirement for building. Running on
  an emulator is a Phase 0 developer task and is normally done on the owner's
  laptop (Android Studio) or a Mac (Xcode Simulator).
- The owner's machine: unknown. Open question O1 below (does the owner have a
  Mac?). A Mac is not required for the pipeline, but it makes the first iOS
  run, Simulator testing and debugging on a physical iPhone far easier.

#### 1.3 CI options compared

| Option | Android | iOS | Cost | Verdict |
|---|---|---|---|---|
| GitHub Actions, public repo | ubuntu-latest, free | macos-26 (arm64, Xcode 26), free | USD 0 | Recommended. The repo is public today. |
| GitHub Actions, private repo | free allowance, then per minute | macOS minutes cost 10x Linux minutes | low but non-zero | Fine at 1-2 builds a week; watch usage. |
| Codemagic / Bitrise | yes | yes (Xcode images, signing UI) | free tier then paid | Fallback if GitHub macOS images lag a new Xcode requirement. |
| Self-hosted Mac mini runner | n/a | yes | hardware or MacStadium rental | Only if builds become frequent or the repo goes private. |
| Local builds only | yes (devops host) | no (no Mac) | 0 | Not enough, iOS is blocked. |

Pin runner labels (macos-26, ubuntu-24.04) rather than `-latest`; GitHub
migrates `-latest` over 1-2 months and the Xcode version moves with it. Verify
the macos-26 image ships Xcode 26.x before the first run (see runner-images
readme).

### 2. Repository changes this pipeline expects

These are Phase 0 deliverables of someone else (feasibility/scaffold task), listed
here because CI depends on them.

- Re-add `package.json`, `package-lock.json` with `@capacitor/core`,
  `@capacitor/cli`, `@capacitor/android`, `@capacitor/ios` at ^8, and
  `capacitor.config.json` (appId `com.virtualarenas.binality`, appName
  `Binality`, webDir `www`). The previous wrapper in commit 23856cf is a working
  reference: `git show 23856cf:capacitor.config.json` etc.
- Re-add the build script that assembles `www/` from the static site (previous
  `scripts/copy-www.mjs`). It copies index.html, manifest, css, js, images,
  programs, privacypolicy.html and now also `sw.js` and the 404/icons as
  needed. Web-only files (robots.txt, humans.txt, crossdomain.xml) stay out.
  The current static site has no build step; `npm run build` must only exist as
  the www assembler.
- `android/` and `ios/` are committed (standard Capacitor practice), so CI does
  not need `cap add`. CI runs `npx cap sync <platform>` to copy `www/` in.
- `scripts/ci-check.sh` was unlocked in PR #55 (M0.1): it no longer rejects
  Capacitor files outside docs/. It now fails on a tracked `www/` or
  `node_modules/` and on invalid `capacitor.config.json` / `package.json`.
  No further change is needed for the scaffold PR.
- Google Fonts are already self-hosted (PR #59, `fonts/*.woff2`; the privacy
  policy sentence was removed in PR #71). The app makes no network requests,
  which is what the store privacy answers in section 7 rely on. Make sure
  `fonts/` is copied into `www/`.
- Service worker: sw.js registration should be skipped inside the native shell
  (WKWebView with the capacitor scheme does not support it, and the bundled
  assets are already offline). Feasibility task owns this; noted for the
  version-stamping rule in section 4.
- `.gitignore` additions: `node_modules/`, `www/`, `android/app/build/`,
  `android/.gradle/`, `android/local.properties`, `android/keystore.properties`,
  `*.jks`, `*.keystore` (except the shared debug keystore, see 3.1), `*.p12`,
  `*.p8`, `*.mobileprovision`, `ios/App/Pods/`, `ios/App/build/`,
  `ios/DerivedData/`, `fastlane/report.xml`, `**/google-play-key.json`.
- Native audio: the previous wrapper needed a foreground service
  (`AudioForegroundService`, `ForegroundAudioPlugin`, manifest permissions
  FOREGROUND_SERVICE, FOREGROUND_SERVICE_MEDIA_PLAYBACK, WAKE_LOCK,
  POST_NOTIFICATIONS, service type mediaPlayback) so Web Audio keeps rendering
  with the screen off. iOS needs `UIBackgroundModes = audio` in Info.plist and an
  AVAudioSession playback category. Both have store-review consequences
  (sections 6 and 7).

### 3. Building locally (the steps a new engineer follows)

Assume Capacitor project exists on the branch (section 2). Commands run from the
repo root.

    node -v                    # must be 22.x or newer
    npm ci
    npm run build              # assembles www/
    npx cap sync               # copies www/ and plugins into android/ and ios/

#### 3.1 Android: debug build

    export JAVA_HOME=<jdk-21>  ANDROID_HOME=<sdk>
    cd android
    ./gradlew assembleDebug
    # output: android/app/build/outputs/apk/debug/app-debug.apk
    adb install -r app/build/outputs/apk/debug/app-debug.apk

- Debug builds use applicationId `com.virtualarenas.binality.dev` (the previous
  wrapper set `applicationIdSuffix ".dev"` and `versionNameSuffix "-dev"` so a
  debug build installs next to the real or legacy app). Keep that.
- Debug builds are signed automatically with `~/.android/debug.keystore`. That key
  differs per machine, so a debug APK from CI cannot be installed over one built
  locally. Optional fix: commit one shared debug keystore (debug keystores are
  not secrets, the password is `android`) and point `signingConfigs.debug` at it.
  This keeps CI-produced debug APKs upgradeable.
- To run in an emulator: Android Studio > Device Manager > create a Pixel,
  API 36 image, then `npx cap run android` or open `android/` in Studio.

#### 3.2 Android: release build (signed)

One-time: create the **upload keystore**. Do this once, on a trusted machine, not
in CI.

    keytool -genkeypair -v -storetype PKCS12 \
      -keystore binality-upload.jks -alias binality-upload \
      -keyalg RSA -keysize 2048 -validity 10000

Store the keystore and both passwords in two independent places (password
manager plus an encrypted offline backup). Never commit it.

How it is used:

- Enrol in **Play App Signing** (default and effectively mandatory for new apps
  on AAB). Google holds the real app-signing key; our keystore is only the
  *upload key*. If it is ever lost, Google can reset the upload key through
  support, so a lost keystore is recoverable. This is the main reason to use
  Play App Signing.
- `android/app/build.gradle` reads signing material from environment variables
  (CI) or `android/keystore.properties` (local, gitignored), and only applies the
  release signing config when they are present:

      def ks = System.getenv('ANDROID_KEYSTORE_PATH') ?: findProperty('storeFile')
      signingConfigs {
        release {
          if (ks) {
            storeFile file(ks)
            storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD') ?: findProperty('storePassword')
            keyAlias      System.getenv('ANDROID_KEY_ALIAS')         ?: findProperty('keyAlias')
            keyPassword   System.getenv('ANDROID_KEY_PASSWORD')      ?: findProperty('keyPassword')
          }
        }
      }
      // buildTypes.release: signingConfig signingConfigs.release  (only when ks is set)
      // versionCode / versionName come from env, see section 4

Build:

    cd android
    ./gradlew bundleRelease     # Play Store: android/app/build/outputs/bundle/release/app-release.aab
    ./gradlew assembleRelease   # sideloadable signed APK for device smoke testing

Verify signature before uploading:

    $ANDROID_HOME/build-tools/36.0.0/apksigner verify --print-certs app-release.apk
    keytool -printcert -jarfile app-release.aab

Release build settings to confirm: `minifyEnabled` stays false unless the team
adds proguard rules for the Capacitor bridge and the custom plugin; target SDK
must be 36 or higher (Play requires API 36 for new apps and updates from
2026-08-31, verify at submission time).

#### 3.3 iOS: debug build

Needs macOS with Xcode 26.

    cd ios/App
    # simulator, no signing, works with no Apple account:
    xcodebuild -project App.xcodeproj -scheme App -configuration Debug \
      -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
      CODE_SIGNING_ALLOWED=NO build
    # (use -workspace App.xcworkspace if the project was created with CocoaPods)

    npx cap run ios            # picks a simulator and launches

A **signed debug build on a physical iPhone** needs:

1. A paid Apple Developer Program membership (free Apple IDs give 7-day profiles
   and cannot be used for CI).
2. The App ID `com.virtualarenas.binality` registered (Certificates, Identifiers
   & Profiles).
3. The test iPhone's UDID registered in the developer account.
4. An Apple Development certificate and a development provisioning profile.
   Easiest: open `ios/App/App.xcodeproj` in Xcode once, Signing & Capabilities,
   tick "Automatically manage signing", choose the Team. Xcode creates all of it.
   For CI use fastlane match type `development` (section 5.4).

#### 3.4 iOS: release build (signed, App Store / TestFlight)

Needs: Apple Distribution certificate, App Store provisioning profile for
`com.virtualarenas.binality`, the app record in App Store Connect.

Manual path (first time, Mac with Xcode): Product > Archive > Distribute App >
App Store Connect > Upload.

Scripted path (what CI does), fastlane in `ios/fastlane/Fastfile`:

    default_platform(:ios)
    platform :ios do
      desc "Build and upload to TestFlight"
      lane :beta do
        api_key = app_store_connect_api_key(
          key_id: ENV["ASC_KEY_ID"], issuer_id: ENV["ASC_ISSUER_ID"],
          key_content: ENV["ASC_KEY_P8_BASE64"], is_key_content_base64: true)
        setup_ci                                   # temp keychain on CI
        match(type: "appstore", readonly: true, api_key: api_key)
        build_app(
          project: "App/App.xcodeproj", scheme: "App", export_method: "app-store",
          xcargs: "MARKETING_VERSION=#{ENV['MARKETING_VERSION']} CURRENT_PROJECT_VERSION=#{ENV['BUILD_NUMBER']}")
        upload_to_testflight(api_key: api_key, skip_waiting_for_build_processing: true)
      end
    end

Info.plist items required for review: `ITSAppUsesNonExemptEncryption` = false
(app only uses HTTPS/OS crypto, avoids the export-compliance prompt on every
upload), `UIBackgroundModes` = [audio], launch screen, icon set (1024x1024
without alpha).

### 4. Versioning strategy

Single source of truth: the `version` field in `package.json` (SemVer, e.g.
2.1.0). It is the marketing version on both platforms and is bumped by a human
in the release PR.

Build number (Android `versionCode`, iOS `CFBundleVersion`): derived, never
hand-edited, strictly increasing integer:

    BUILD_NUMBER = GITHUB_RUN_NUMBER of the release workflow + BUILD_OFFSET

- The release workflow is a single named workflow file, so its `run_number` is
  monotonic. Both platforms use the same number, which makes support easier.
- `BUILD_OFFSET` is a repo variable (Actions variable, not secret). Set it above
  the highest versionCode ever uploaded under this package name. If a legacy
  Play listing exists (open question O2; the consolidated plan says one does,
  tracked in issue #8, with the owner holding the 2017 key) take its current
  versionCode and add a margin. Play rejects equal or lower codes; max is 2,100,000,000.
- Android: `build.gradle` reads `BINALITY_VERSION_CODE` and `BINALITY_VERSION_NAME`
  env vars (defaults 1 and `dev` locally). iOS: xcodebuild overrides
  `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` (no project-file edits, no
  git diff in CI).
- Tie to the web build: the release workflow writes a small
  `www/build-info.json` ({ version, build, commit, builtAt }) and sets the
  service-worker `CACHE_VERSION` (currently `binality-v2.0.5` in sw.js) to
  `binality-v<version>` so the web and mobile builds identify the same
  content. The app's About / settings screen may show it. Native builds are
  always rebuilt from a git tag, so tag name = release identity.
- Tags: `mobile-v<version>` (for example `mobile-v2.1.0`) triggers a release
  build. Web hosting deploys are unaffected.
- Native-only fixes (plugin, signing, store metadata) bump the patch version
  and are built from a new tag the same way.

### 5. CI workflow outline

#### 5.1 Workflows

| File | Trigger | Does | Secrets? |
|---|---|---|---|
| `.github/workflows/ci.yml` (exists) | push, PR | static-site checks | none |
| `.github/workflows/mobile-build.yml` | PR touching android/ ios/ capacitor.config.json package*.json www sources; push to dev; manual | unsigned/debug Android build, iOS simulator build; uploads debug APK artifact | none |
| `.github/workflows/mobile-release.yml` | tag `mobile-v*`, manual `workflow_dispatch` | signed AAB + APK, signed IPA, upload to Play internal and TestFlight | yes, via protected environment |

Rules:

- Secrets are only available to `mobile-release.yml`, and that job declares
  `environment: mobile-release`. In GitHub: Settings > Environments >
  mobile-release with required reviewer = owner. Public-repo forks never receive
  secrets, and the release workflow only triggers on tags and manual runs.
- Add a branch/tag protection rule so only the owner can create `mobile-v*` tags.
- Debug workflow never touches release secrets.
- Add `concurrency: group: mobile-release` so two tags cannot race build numbers.

#### 5.2 mobile-release.yml outline

    name: Mobile release
    on:
      push: { tags: ["mobile-v*"] }
      workflow_dispatch:
    permissions: { contents: read }
    concurrency: { group: mobile-release, cancel-in-progress: false }

    env:
      MARKETING_VERSION: ${{ ... }}    # from package.json via a first step
      BUILD_NUMBER: ${{ github.run_number + vars.BUILD_OFFSET }}   # use format/fromJSON for arithmetic

    jobs:
      android:
        runs-on: ubuntu-24.04
        environment: mobile-release
        steps:
          - uses: actions/checkout@v4
          - uses: actions/setup-node@v4
            with: { node-version: 22, cache: npm }
          - uses: actions/setup-java@v4
            with: { distribution: temurin, java-version: 21 }
          - run: npm ci && npm run build && npx cap sync android
          - name: Decode upload keystore
            run: echo "$ANDROID_KEYSTORE_BASE64" | base64 -d > "$RUNNER_TEMP/upload.jks"
            env: { ANDROID_KEYSTORE_BASE64: ${{ secrets.ANDROID_KEYSTORE_BASE64 }} }
          - name: Build AAB + APK
            working-directory: android
            run: ./gradlew bundleRelease assembleRelease
            env:
              ANDROID_KEYSTORE_PATH: ${{ runner.temp }}/upload.jks
              ANDROID_KEYSTORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
              ANDROID_KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
              ANDROID_KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}
              BINALITY_VERSION_CODE: ${{ env.BUILD_NUMBER }}
              BINALITY_VERSION_NAME: ${{ env.MARKETING_VERSION }}
          - uses: actions/upload-artifact@v4   # keep AAB/APK 30 days
            with: { name: android-release, path: "android/app/build/outputs/**/*.aab\nandroid/app/build/outputs/**/*.apk" }
          - name: Upload to Play internal testing
            run: bundle exec fastlane android internal      # supply: track internal, release_status draft until first approval
            env: { PLAY_SERVICE_ACCOUNT_JSON: ${{ secrets.PLAY_SERVICE_ACCOUNT_JSON }} }
          - if: always()
            run: rm -f "$RUNNER_TEMP/upload.jks"

      ios:
        runs-on: macos-26
        environment: mobile-release
        steps:
          - uses: actions/checkout@v4
          - uses: actions/setup-node@v4
            with: { node-version: 22, cache: npm }
          - run: sudo xcode-select -s /Applications/Xcode_26.app   # confirm exact path/version on the image
          - uses: ruby/setup-ruby@v1
            with: { bundler-cache: true }
          - run: npm ci && npm run build && npx cap sync ios
          - name: Build, sign, upload to TestFlight
            working-directory: ios
            run: bundle exec fastlane beta
            env:
              ASC_KEY_ID: ${{ secrets.ASC_KEY_ID }}
              ASC_ISSUER_ID: ${{ secrets.ASC_ISSUER_ID }}
              ASC_KEY_P8_BASE64: ${{ secrets.ASC_KEY_P8_BASE64 }}
              MATCH_PASSWORD: ${{ secrets.MATCH_PASSWORD }}
              MATCH_GIT_URL: ${{ secrets.MATCH_GIT_URL }}
              MATCH_GIT_BASIC_AUTHORIZATION: ${{ secrets.MATCH_GIT_BASIC_AUTHORIZATION }}
              MARKETING_VERSION: ${{ env.MARKETING_VERSION }}
              BUILD_NUMBER: ${{ env.BUILD_NUMBER }}
          - uses: actions/upload-artifact@v4
            with: { name: ios-ipa, path: "ios/*.ipa" }

Android fastlane lane (`android/fastlane/Fastfile`):

    lane :internal do
      upload_to_play_store(
        track: "internal",
        aab: "app/build/outputs/bundle/release/app-release.aab",
        json_key_data: ENV["PLAY_SERVICE_ACCOUNT_JSON"],
        skip_upload_metadata: true, skip_upload_images: true, skip_upload_screenshots: true)
    end

These are outlines to be validated, not tested workflows. Expect one or two
iterations on the first real run (arithmetic expression for BUILD_NUMBER, the
Xcode path, the generated IPA path).

mobile-build.yml (debug) outline: ubuntu job runs `npm ci`, `npm run build`,
`npx cap sync android`, `./gradlew assembleDebug`, uploads `app-debug.apk`; a
macOS job runs the simulator `xcodebuild ... CODE_SIGNING_ALLOWED=NO build`. Gate
the macOS job to PRs that touch `ios/` or plugin code to save minutes.

#### 5.3 Android store upload prerequisites

- Google Play Developer API service account: Cloud project, enable "Google Play
  Android Developer API", create a service account and JSON key, then in Play
  Console > Users and permissions invite the service-account email with release
  permissions for this app only.
- The app must already exist in Play Console and have passed initial app setup.
  The first AAB is uploaded **manually** in the Console (internal testing); API
  uploads work after that.

#### 5.4 iOS signing management

Recommended: fastlane `match`. Certificates and profiles live encrypted in a
private git repo (for example `amtivey/binality-certs`, private), decrypted in CI
with `MATCH_PASSWORD`. One-time bootstrap can be run on a macOS GitHub runner
via a manual `workflow_dispatch` job (non-readonly `match appstore` and
`match development`), so no personal Mac is strictly required. CI release runs
use `readonly: true`.

Alternative with fewer moving parts: Xcode automatic signing in CI using an App
Store Connect API key (`xcodebuild -allowProvisioningUpdates
-authenticationKeyPath ... -authenticationKeyID ... -authenticationKeyIssuerID ...`).
Works with Apple cloud-managed distribution certificates and avoids the certs
repo, but is less proven for headless CI. Start with match; fall back if it
becomes a burden.

Apple distribution certificates expire after one year and profiles follow;
`match` renews with `match(force: true)` (calendar this).

### 6. Store accounts, tracks and review requirements

#### 6.1 Google Play

- Account: Play Console developer account, one-time USD 25. Personal or
  organisation. Identity verification is required (government ID; organisations
  need a D-U-N-S number).
- Personal accounts created after 2023-11-13: before applying for production, run
  a **closed test with at least 12 testers opted in continuously for 14 days**,
  then answer questions in Play Console to apply for production access.
  Organisation accounts are not subject to this rule. Plan for recruiting 12+
  testers (friends, a Google Group of testers, the open-source community).
- Tracks: Internal testing (up to 100 testers, no review, minutes to publish) ->
  Closed testing (the 12-tester gate) -> Open testing (optional) -> Production.
  CI uploads to Internal; promotion between tracks is a manual Console click (or
  fastlane `upload_to_play_store` with `track_promote_to`).
- App content declarations required before any non-internal release:
  - Privacy policy URL (must be a public web page, not the GitHub repo page).
  - Data safety form.
  - Content rating questionnaire (IARC).
  - Target audience: choose 13+ or 18+, not children, to stay out of the Families
    policy. The existing privacy policy already says children under 13 are not
    addressed.
  - Ads declaration (none), government app, financial features, health apps
    declaration (required for apps in Health & Fitness or with health content).
  - Foreground service declaration: `FOREGROUND_SERVICE_MEDIA_PLAYBACK` needs a
    use-case description and sometimes a short demo video (screen-off audio is a
    legitimate mediaPlayback use). Prepare the video from the emulator.
- Store listing: 512x512 icon, 1024x500 feature graphic, at least 2 phone
  screenshots (prefer 4+), short (80) and full (4000) descriptions.
- Technical: AAB format, target API 36, 64-bit (the app has no native libs, so
  automatic).

#### 6.2 Apple

- Account: Apple Developer Program, USD 99 per year, auto-renews. Individual
  (name appears as seller: "Mat Tivey" or similar) or Organisation (needs a legal
  entity and D-U-N-S, seller name = organisation, enrolment can take weeks).
  Decide before enrolling because conversion later is painful (O3).
- Roles needed: Account Holder enrols; create an App Store Connect API key
  (Users and Access > Integrations > Keys) with App Manager (or Admin) access for
  CI.
- Register Bundle ID `com.virtualarenas.binality` and create the app record in App
  Store Connect (name, primary language, SKU). Note the name "Binality" must be
  unique across the App Store; check availability early (O4).
- TestFlight: internal testing (up to 100 App Store Connect users, no review, build
  available after processing) and external testing (up to 10,000 testers via
  email or public link; first build of each version goes through Beta App
  Review, usually about a day). TestFlight builds expire after 90 days.
- Submission requirements: privacy policy URL, App Privacy ("nutrition label")
  answers, age rating questionnaire, screenshots (6.9-inch iPhone set required;
  iPad set required only if the app supports iPad, so set the device family to
  iPhone only if iPad is not a goal), description, keywords, support URL, review
  notes, demo steps (no login, so none needed), category (Health & Fitness is the
  natural fit; Music is the alternative).
- App Review risk areas for this app:
  - Guideline 4.2 (minimum functionality): wrappers around a website can be
    rejected. Mitigations: the app is fully offline and bundled, uses native
    background audio, and has a real interactive canvas; say this in the review
    notes. The UX/feasibility workstreams should keep native integrations
    (background audio, keep-awake, haptics, native share) on the list to
    strengthen the case.
  - Guideline 1.4.1 (health): wording like "healing", "pain relief", "treatment"
    (program names such as Pain Relief and Universal Healing) invites scrutiny. The
    in-app health-claims disclaimer added in commit 7fc63dd helps. Review all
    store text and screenshots for medical claims.
  - Background audio: must actually play audio while backgrounded.

#### 6.3 Privacy and policy work (blocks both stores)

- `privacypolicy.html` was rewritten to match the app's behaviour (offline, no
  accounts, no analytics, settings in local storage, nothing transmitted) in
  PR #54, and the stale Google Fonts sentence was removed in PR #71. The owner
  still has to review and approve it. Any later change that adds a network call
  or SDK must update the policy and the store forms together.
- The policy must be hosted at a stable public URL (for example
  https://www.virtualarenas.com/binality/privacypolicy.html or GitHub Pages),
  not a path inside the app bundle only. The in-app copy can be the same file.
- Expected store answers, if the app stays as it is: Apple "Data Not Collected";
  Google Data safety "no data collected, no data shared". This holds only as long as
  the app keeps making no network requests and no analytics or ads are added.
  Re-do the forms when any SDK is added.
- Safety content to consider adding to listing and onboarding: use with
  headphones, do not use while driving or operating machinery, not a medical
  device, consult a doctor (especially for epilepsy or photosensitivity if any
  visuals flicker; the owner should confirm whether any visual mode flashes).
- Developer contact: a support email address and a support URL are required by
  both stores. G2 (2026-11-01): binality@virtualarenas.com, the same address as
  the privacy policy.

### 7. Secrets and variables

Nothing below is created yet. All secrets live in GitHub Environment
`mobile-release`; values are never put in the repo, commit messages, logs or
PRs. Base64 encode with `base64 -w0 file` (Linux) or `base64 -i file` (macOS).

| Name | Kind | What | Who creates | Used by |
|---|---|---|---|---|
| ANDROID_KEYSTORE_BASE64 | secret | base64 of upload keystore (.jks) | owner / devops (section 3.2) | android |
| ANDROID_KEYSTORE_PASSWORD | secret | keystore password | same | android |
| ANDROID_KEY_ALIAS | secret | `binality-upload` | same | android |
| ANDROID_KEY_PASSWORD | secret | key password | same | android |
| PLAY_SERVICE_ACCOUNT_JSON | secret | Play Developer API service-account key (JSON) | owner (Cloud + Play Console, 5.3) | android upload |
| ASC_KEY_ID | secret | App Store Connect API key ID | owner (ASC > Integrations) | ios |
| ASC_ISSUER_ID | secret | App Store Connect issuer ID | owner | ios |
| ASC_KEY_P8_BASE64 | secret | base64 of the AuthKey_XXXX.p8 file (downloadable once) | owner | ios |
| MATCH_PASSWORD | secret | passphrase encrypting the certs repo | devops | ios |
| MATCH_GIT_URL | secret or variable | https URL of the private certs repo | devops | ios |
| MATCH_GIT_BASIC_AUTHORIZATION | secret | base64 of `user:PAT` with read access to the certs repo | owner (fine-grained PAT, repo-scoped, read-only) | ios |
| APPLE_TEAM_ID | variable | 10-character team ID | owner | ios |
| BUILD_OFFSET | variable | integer, see section 4 | devops | both |

Handling rules:

- The Android upload keystore and the `.p8` key are the crown jewels. The `.p8`
  can be downloaded only once; store a copy in the owner's password manager.
- Rotate: PATs yearly; the Apple distribution certificate yearly; revoke the
  App Store Connect key and Play service account if a runner or log leak is
  suspected.
- The existing local `GITHUB_TOKEN` in the devops profile is for repo/PR work
  and must not be reused as MATCH_GIT_BASIC_AUTHORIZATION; make a separate,
  narrowly scoped token.
- Do not echo secrets; the workflow files use `env:` per step, not `set -x`.

### 8. Owner checklist (actions only the owner can do)

Costs: Apple USD 99 per year; Google USD 25 once. No other mandatory spend.
Optional: a Mac or cloud Mac (about USD 0 if using GitHub runners), a custom
domain page for the privacy policy (likely already available at
virtualarenas.com).

1. Decide account type for Apple and Google: individual or organisation
   (organisation needs a legal entity + D-U-N-S, longer lead time; Google
   organisation accounts also skip the 12-tester rule). Record the answer on the
   board.
2. Enrol: Apple Developer Program (USD 99) and Google Play Console (USD 25).
   Complete Google identity verification and (if prompted) phone/device
   verification.
3. Confirm the bundle/package ID `com.virtualarenas.binality` (open question
   O2: is there an existing legacy Play or App Store listing under this ID or
   under this developer?). If yes, tell devops which account owns it and its
   current versionCode.
4. Confirm the public app name "Binality" is available in both stores (or pick
   a fallback name such as "Binality: Binaural Beats").
5. Create the Play Console app and the App Store Connect app records (devops can
   supply field values).
6. Create the App Store Connect API key (App Manager), the Play service account,
   and add the secrets from section 7 to the `mobile-release` GitHub
   environment. Add yourself as required reviewer. Devops will generate the
   Android keystore and match passphrase and hand over the keystore to the
   owner's password manager.
7. Provide a private repo for iOS certificates (`binality-certs`) or approve
   devops creating it under `amtivey`.
8. Approve the rewritten privacy policy and publish it at a public URL.
9. Recruit 12 or more Google Play closed-test testers (Gmail addresses) and
   keep them opted in 14 days. Add 1-5 internal testers to TestFlight.
10. Provide support email/URL, store screenshots approval, and age/health-claims
    answers (questionnaires are the owner's legal statements).
11. Optional: lend a Mac / iPhone for one-off debugging; register the iPhone UDID.

### 9. Step-by-step setup order (devops execution plan)

Each step lists its precondition. Steps 1-4 can start now.

1. (no precondition) Owner starts enrolments (section 8 items 1-2).
2. Devops: done in PR #55 (M0.1): `.gitignore` entries and the
   `scripts/ci-check.sh` unlock.
3. Devops (after scaffold PR merges): local Android debug build per 3.1 on the
   devops host or CI; confirm `app-debug.apk` installs and the web content loads
   offline.
4. Devops: `mobile-build.yml` (debug) was added in PR #57 (M0.3) and its run
   was green; it targets the M0.2 scaffold branch, so confirm it again once the
   scaffold is on dev. Acceptance: green run, downloadable debug APK; iOS simulator build green.
5. Devops: generate upload keystore (3.2), add Gradle signing config and
   versioning env, produce a signed AAB and APK locally or via manual workflow;
   `apksigner verify` passes. Owner stores keystore backup.
6. After Play account is active: owner creates the app, uploads the first AAB
   manually to Internal testing, enables Play App Signing; devops wires the
   service account, then CI uploads to Internal.
7. After Apple account is active: owner registers the bundle ID and API key;
   devops bootstraps `match` (development + appstore) from a manual macOS
   workflow; produces first signed IPA; owner or CI uploads to TestFlight.
8. Add `mobile-release.yml`, tag `mobile-v0.1.0-rc1` (a pre-release tag to prove
   the pipeline), confirm builds appear in Play Internal testing and TestFlight.
9. Start the Play closed test (12 testers, 14 days) and TestFlight external beta
   in parallel with Phase 2 polish.
10. Store listing, privacy forms, and review notes; submit to Apple, apply for
    production on Google; release with staged rollout (Play) and phased release
    (Apple).

Definition of done for "a signed debug and release build on both platforms":

- Android: `app-debug.apk` installs on an emulator/device (id ending `.dev`);
  `app-release.aab` and `app-release.apk` pass `apksigner verify` with the upload
  key; the AAB is accepted by Play Internal testing.
- iOS: simulator debug build runs; a development-signed build installs on a
  registered iPhone; an App Store-signed IPA is accepted and processed by
  TestFlight.

### 10. Open questions for the owner (forward to the top of the consolidated plan)

- O1. Do you have a Mac and an iPhone? (Not required, but changes who debugs
  iOS-specific issues.)
- O2. Is there an existing Play Store or App Store listing for Binality, or any
  published build under `com.virtualarenas.binality`? (The Capacitor commit
  mentions a "legacy app"; if it is on a store the package name, signing key and
  versionCode are already fixed.)
- O3. Individual or organisation developer accounts? (Seller name, D-U-N-S,
  12-tester rule.)
- O4. Final app name and bundle ID; confirm "Binality" is free on both stores.
- O5. Is the repo staying public? (Drives free macOS CI minutes and whether
  secrets-in-forks exposure matters.)
- O6. iPhone only, or iPhone + iPad? (Screenshots, layout work.)
- O7. Is the app free with no in-app purchases and no ads, permanently? (The
  donation section was removed; any payments change store forms and fees.)

### 11. Sources checked (2026-10-19)

- Capacitor environment setup and Capacitor 8 requirements:
  https://capacitorjs.com/docs/getting-started/environment-setup
- Apple SDK minimum requirements (Xcode 26 since 2026-04-28):
  https://developer.apple.com/news/upcoming-requirements/
- Google Play new personal account testing requirement:
  https://support.google.com/googleplay/android-developer/answer/14151465
- Google Play target API level requirement (API 36 from 2026-08-31):
  https://support.google.com/googleplay/android-developer/answer/11926878
- GitHub-hosted runner labels and pricing: GitHub Docs, "GitHub-hosted runners"
  reference; runner images at https://github.com/actions/runner-images
- Prior wrapper reference: commit 23856cf and docs/capacitor-inventory.md in the
  main checkout.
