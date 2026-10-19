# Binality mobile (Capacitor) — Feasibility audit

Task: t_592e7261. Audited against `origin/dev` at 84ee5d4 (v2 app, after PR #24).
This file is one input to `docs/mobile-capacitor-plan.md`. The consolidation task
t_6a311b6a merges it with the UX requirements (t_277c9e2a) and the build/release
pipeline plan (t_23743c2c). It is kept as a separate file so the three parallel
branches don't conflict.

## 1. Verdict

Feasible, and low risk for the "app runs in a WebView" part. The v2 app is a
static, build-less site: `index.html`, `js/index.js`, `css/index.css`, `sw.js`,
`manifest.webmanifest`, `programs/*.xml` and `images/`. It has no framework and no
bundler, and it makes no network calls apart from Google Fonts. All audio is
synthesized with Web Audio (oscillators plus a generated pink-noise buffer), so
there are no audio files to bundle or stream.

The real work, and the main risk, is **audio that keeps playing with the screen
off or the app in the background**, because this is a sleep/meditation app.
WebViews don't do that by default on either platform. Second come a few
browser-only features that silently do nothing inside a WebView: the service
worker / PWA install UI, `<a download>` export, the share link built from
`location.href`, and `target="_blank"` links.

There is prior art in this repo. Commit 23856cf (June 2026) added a Capacitor 8
Android wrapper whose ForegroundAudio plugin was verified on an emulator to keep
Web Audio running with the screen off. PR #5 (d9ca5c3) removed that wrapper, and
the Expo plan was later dropped (PR #21). Reuse the native code from 23856cf
(`git show 23856cf:android/app/src/main/java/com/virtualarenas/binality/...`)
rather than writing it again.

## 2. Codebase facts that shape the plan

| Area | What the code does today | File / location |
|---|---|---|
| Build | None. Files are served as-is; CI only runs `node --check`, validates the manifest JSON and checks that the XML is well-formed | `scripts/ci-check.sh`, `.github/workflows/ci.yml` (Node 20) |
| CI guard | **Fails the build** if `android/`, `package.json`, `capacitor.config.json`, `www/` or `node_modules/` exists, or if the string "capacitor" appears anywhere outside `docs/` | `scripts/ci-check.sh` lines 21-28 |
| Entry point | One page, one script | `index.html` → `js/index.js` (5.1k lines, globals, ES5 style) |
| Programs | `fetch('programs/<name>.xml')` with relative URLs; falls back to an inline copy `BUILTIN_PROGRAMS_XML` on `file:` or when the fetch fails | `js/index.js:120`, `changeProgram()` at `:1845` |
| Audio | One `AudioContext` created at script load (`:16-26`), resumed in `start()` (`:1899`); oscillators, gains and mergers per voice; a 2 s pink-noise buffer; analysers for the scope | `start()` `:1891`, `ensurePinkNoiseBuffer()` `:2188`, `ensureScopeAnalysers()` `:1005` |
| Playback clock | Position comes from `context.currentTime` (good). End of program and UI updates are detected in a 250 ms `setInterval` | `monitor = setInterval(...)` `:2099` |
| Sleep timer | Counts down by decrementing `timerRemainingSec` once per 1 s `setInterval`. **Not tied to the wall clock** | `startSleepTimer()` `:2619-2652` |
| Canvas | Three 2D canvases: program chart (`#chartCanvas`, redrawn every 250 ms while playing), scope (`#waveformCanvas`, redrawn every frame with `requestAnimationFrame` while playing), studio preview | `createProgramChart()` `:673`, `drawScopeFrame()` `:1048`, `renderStudioPreview()` `:3681` |
| Pointer input | Chart: `mousemove`/`mouseleave` for the hover tooltip, `click` to seek. Everything else is buttons, range inputs and selects. Keyboard: only `Escape` closes the modals | `:975-998`, `:4602` |
| Storage | `localStorage` only: 15 settings keys plus user-created presets (`binalityCustomPresets`) | `:3438-3455`, init at `:4984-5066` |
| Offline | Service worker registered when protocol is `http:`/`https:`; the update toast reloads on `controllerchange`; `beforeinstallprompt` install button; online/offline badge | `initPwaServiceWorker()` `:4412`, `sw.js` |
| Network | Google Fonts CSS and fonts from `fonts.googleapis.com`/`fonts.gstatic.com`. Canvas text uses "JetBrains Mono" | `index.html:22-24`, `js/index.js:739` |
| Export / share | Export: `Blob` + `URL.createObjectURL` + `<a download>`. Share: `location.href` + `#preset=` → `navigator.clipboard`, falling back to rewriting the address bar. Incoming `#preset=` links are read at startup | `exportStudioXml()` `:4273`, `shareStudioLink()` `:4325`, `checkUrlSharedPreset()` `:4357` |
| External links | Two `target="_blank"` links (GitHub, Wikipedia) | `index.html:637,641` |
| Layout | `100dvh` app shell, `overflow:hidden`, `user-select:none`, viewport already has `viewport-fit=cover, user-scalable=no`. **No `safe-area-inset` / `env()` anywhere.** Only two breakpoints (`max-width: 640px`, `600px`) and no landscape-phone rules | `css/index.css:39`, `:3138`, `:3696` |
| GPU-heavy CSS | Six `backdrop-filter: blur(6–18px)` panels and three blurred orbs animated forever (`floatOrb1/2`, 18–22 s) | `css/index.css:79-135`, `:637`, `:780`, `:904`, `:944`, `:1023`, `:1642` |
| Web manifest | `orientation: any`, theme `#070314`, 192/512/1024 icons already present | `manifest.webmanifest`, `images/binality-icon-*.png` |

## 3. Compatibility risks (ordered by severity)

Platform behaviour is given for Capacitor 8 on Android System WebView (Chromium,
served from `https://localhost`) and WKWebView on iOS (served from
`capacitor://localhost`).

### R1. Background / screen-off audio stops (Severity: critical, both platforms)

- **Android:** once the activity is in the background and the screen is off,
  the process gets throttled or frozen and Web Audio stops after a while. Fix:
  a foreground service of type `mediaPlayback` plus a partial wake lock while
  playing. This is exactly `AudioForegroundService` + `ForegroundAudioPlugin` in
  23856cf, which declared `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`,
  `WAKE_LOCK` and `POST_NOTIFICATIONS`. Play Console requires a
  foreground-service declaration (with a video) for `mediaPlayback` on
  targetSdk 34+.
- **iOS:** by default WKWebView audio uses the *ambient* session. That means it
  is **muted by the ring/silent switch** and stops when the device locks or the
  app goes to the background. Fix:
  1. Add `UIBackgroundModes` → `audio` to `ios/App/App/Info.plist`.
  2. Set `AVAudioSession` category `.playback` natively in `AppDelegate`
     before the first playback.
  3. Also set `navigator.audioSession.type = 'playback'` (WebKit, iOS 17+)
     before `start()`.

  WebKit has had regressions here (e.g. bug 261554, AudioContext suspended in
  the background despite `playback`, fixed in later releases), so this **must
  be proven on a physical iPhone first** (spike, Task 3). The documented
  fallback is a looping silent `<audio>` element to keep the media session
  alive.
- **Both:** nothing handles `AudioContext.onstatechange`, `visibilitychange` or
  audio interruptions (phone call, Siri, other app takes audio focus). After an
  interruption the context stays `suspended`/`interrupted` while the UI still
  says "playing". Add a statechange handler that resumes the context or flips
  the UI to stopped, plus `App.addListener('resume')`.

### R2. Timers drift while backgrounded (Severity: high)

`startSleepTimer()` decrements a counter once per `setInterval` tick
(`js/index.js:2637`). Background timers are throttled to about 1/min (Chromium)
or suspended (iOS). As a result, **the sleep timer won't stop audio on time**,
which is the main use case for "Sleep" programs. Program-end detection
(`:2099`) also runs inside an interval, so the oscillators can keep running
past `timeMax`. Fix:

- Compute the remaining time from `context.currentTime` (or `Date.now()`) on
  every tick.
- Schedule the work on the audio clock: `osc.stop(t)`, plus the fade-out ramp
  `setTargetAtTime`/`exponentialRampToValueAtTime` at start time, so it happens
  even if JS is throttled.
- Re-sync the UI on `resume`.

### R3. Service worker and PWA UI are wrong inside the app (Severity: medium)

- iOS: `capacitor://` fails the protocol check at `:4415`, so no SW is
  registered (harmless).
- Android: `https://localhost` passes the check, so the SW **does** register
  there. Capacitor doesn't support SWs well; the risk is stale `js/index.js`
  served from the `binality-core-*` cache after a store update, and
  `controllerchange` → `location.reload()` loops.
- The "Install Binality App" button, the update toast and the "100% Offline
  PWA / runs entirely in-browser" badge text are meaningless in a store app.

Fix: detect native (`window.Capacitor?.isNativePlatform()`) and skip
`initPwaServiceWorker()`, hide the install/update UI and adjust the copy. The
bundled files are already offline.

### R4. Google Fonts over the network (Severity: medium)

On a first launch offline, the app falls back to system fonts and canvas
labels change metrics. Store privacy forms also have to declare a third-party
request (it exposes the user's IP to Google). Fix: self-host the three
families as `woff2` under `fonts/` with `@font-face` in `css/index.css`. This
is good for the web build too, and lets the `sw.js` font cache be removed.

### R5. Export, share and links don't work in a WebView (Severity: medium)

- `<a download>` on a blob URL does nothing in Android WebView (no
  `DownloadListener`) or in Capacitor's WKWebView. Use `@capacitor/filesystem`
  (write to cache) + `@capacitor/share` (system share sheet) on native.
- `shareStudioLink()` builds the URL from `location.href`, which yields
  `https://localhost/#preset=…` or `capacitor://localhost/#preset=…`. Use the
  canonical `https://binality.virtualarenas.com/#preset=…` base on native,
  and prefer the native share sheet over the clipboard (`@capacitor/clipboard`
  as fallback). Its fallback (rewriting the address bar) is invisible in an app.
- Incoming shared links: the web build handles them. Opening them *in the app*
  needs Android App Links / iOS Universal Links (`assetlinks.json` /
  `apple-app-site-association` on the web host) plus
  `App.addListener('appUrlOpen')` → `checkUrlSharedPreset()`. This is optional
  for v1.
- `target="_blank"` links: route them through `@capacitor/browser` so they open
  in an in-app browser tab and never replace the app WebView.

### R6. Android back button (Severity: medium)

With no handler, the hardware/gesture back action exits the app even when
Settings or Studio is open. The existing `Escape` handler (`:4602`) holds the
right logic; reuse it from `App.addListener('backButton')` and only call
`App.minimizeApp()` (not exit) when no modal is open, so playback continues.

### R7. Safe areas and edge-to-edge (Severity: medium)

The viewport already has `viewport-fit=cover`, but no CSS uses insets. On
notched iPhones, and on Android 15+ (edge-to-edge is enforced at targetSdk 35+
and Capacitor 8 targets 36), the header will sit under the status bar and the
transport dock under the home indicator / gesture bar. Fix: pad `.app-shell`
with `var(--safe-area-inset-*, env(safe-area-inset-*, 0px))`. Capacitor ≥ 8.3.2
injects `--safe-area-inset-*` on Android to work around the `env()` bug in
WebView < 140. Set the `SystemBars` style to `LIGHT` (light icons on the dark
`#070314` background). Exact layout rules belong to the UX doc (t_277c9e2a).

### R8. Touch input gaps (Severity: low-medium)

- The chart hover tooltip uses `mousemove` only (`:975`), so touch users never
  see it.
- Tap-to-seek works because `click` is synthesized, but touch users can't
  scrub. Move to `pointerdown`/`pointermove` with `touch-action: none` on the
  canvas.
- `:hover` styles (40+ rules) stick after a tap on iOS. Wrap them in
  `@media (hover: hover)`.
- The `title=` tooltips are invisible on touch.

### R9. localStorage durability (Severity: low-medium)

Persistence across launches works because the origin is fixed
(`https://localhost` / `capacitor://localhost`). Two caveats:

1. WKWebView may evict website data under storage pressure, and user-created
   presets (`binalityCustomPresets`) are the only irreplaceable data. Mirror
   that key to `@capacitor/preferences` (native UserDefaults /
   SharedPreferences) and restore it on boot if it's missing.
2. **Never change `server.hostname`, `androidScheme` or `iosScheme` after the
   first release**, because that changes the origin and wipes all stored data.

Web users' presets won't carry over to the app (different origin). That is
acceptable; the Studio XML export/import is the migration path.

### R10. Miscellaneous (Severity: low)

- The `AudioContext` is created at page load (`:22`) and never suspended after
  `stop()`, which keeps the audio hardware awake and costs battery in a native
  app. Call `context.suspend()` in `stop()` and resume in
  `start()`/`playChime()`/`testStereo()`, which already check `'suspended'`.
- `isPageReload()` / `history.replaceState` hash handling is harmless in a
  WebView.
- `user-scalable=no` and `user-select:none` are already set, which suits an
  app.
- `programs/*.xml` load by relative `fetch` from the Capacitor local server,
  and `BUILTIN_PROGRAMS_XML` covers failures.

## 4. Canvas and rendering performance

1. **Bug: fractional devicePixelRatio forces a canvas realloc on every
   frame.** `createProgramChart().replot()` (`:703-707`) and `drawScopeFrame()`
   (`:1064-1068`) compare `canvas.width !== width * dpr`. With common Android
   DPRs (2.625, 2.75, 3.5) the right-hand side isn't an integer. The browser
   truncates the assigned value, so the comparison is always true. The backing
   store is then reallocated and cleared on every scope frame (60 Hz) and every
   chart tick (4 Hz). `renderStudioPreview()` (`:3724`) already does it
   correctly with `Math.floor`. Apply the same fix to the other two.
2. **Cap the DPR at 2 on mobile** (`Math.min(dpr, 2)`). At DPR 3–3.5 a
   full-height scope is about 1400×2600 px = 3.6 M px per frame with gradients
   and `shadowBlur`. A cap at 2 cuts fill by ~55% with no visible loss on lines
   and glows.
3. **`shadowBlur` in per-frame drawing** (10 uses: `:826-873` chart, `:1176-1351`
   scope) is the most expensive 2D canvas operation on Android (CPU raster in
   many WebView configs). On native or low-end devices use a lower blur, or
   draw the glow once into an offscreen canvas.
4. **Redraw cadence:** the chart is fully repainted every 250 ms during
   playback, even when the scope view is shown and the chart is hidden. Skip
   `chart.replot()` when `activeStageView !== 'curve'` or
   `document.hidden`. rAF loops (scope, breathing pacer `:2885`) pause by
   themselves while hidden. That's fine, but they must restart on `resume`
   (check `startScopeAnimation()` is called from the resume handler).
5. **Frame rate:** WKWebView caps rAF at 60 Hz on ProMotion devices and
   Android follows the display. For an oscilloscope that's fine, and a 30 fps
   cap could be offered as a battery saver.
6. **Compositing cost of CSS:** six `backdrop-filter` panels on top of three
   animated, blurred, full-viewport orbs force continuous recomposition even
   when idle. Plan a `.native-lowpower` class (or
   `prefers-reduced-motion`) that stops the orb animation and swaps
   backdrop-filter for a solid translucent fill on Android devices with low
   `navigator.hardwareConcurrency`/`deviceMemory`.
7. **Memory:** small. The pink-noise buffer is 2 s × 48 kHz × 4 B ≈ 384 KB.
   Two analysers at fftSize 2048. Three canvases ≈ 3 × 15 MB worst case at
   DPR 3.5 (drops to ~4–6 MB each with the DPR cap). No leak sources were found
   (nodes are disconnected in `cleanupAudioNodes()` `:2448`).
8. **Resize/orientation:** the `ResizeObserver` on `#chart` (`:5089`) and the
   `resize` listener already call `clientResize()`. They work in WebViews; with
   fix 1 in place, rotation will reallocate once rather than on every frame.

## 5. Required code changes (web side)

All of these keep the web/PWA build working. Native branches are guarded by a
tiny shim and never import `@capacitor/*` modules into the web page (see §7).

1. `js/platform.js` (new, loaded before `index.js`):
   - `window.BinalityPlatform = { isNative, platform }`, read from
     `window.Capacitor` (injected by the native bridge, so no bundler is
     needed).
   - Thin wrappers that call `Capacitor.Plugins.X` when present and the web
     API otherwise: `share`, `saveFile`, `openExternal`, `keepAlive.start/stop`,
     `prefs.get/set`.
2. `js/index.js`:
   - skip `initPwaServiceWorker()` and hide PWA UI on native (R3)
   - wall-clock sleep timer and audio-clock scheduling of stop/fade (R2)
   - `onstatechange` / interruption / resume handling, plus `suspend()` on stop
     (R1, R10)
   - call `BinalityPlatform.keepAlive.start()` in `start()` and `.stop()` in
     `stop()`; these replace the two lines removed in PR #5
   - export, share and external links through the shim (R5)
   - back-button handler (R6)
   - DPR fix, DPR cap, chart redraw gating (§4)
   - pointer events on the chart (R8)
   - mirror presets to Preferences (R9)
3. `css/index.css`: safe-area padding (R7), `@media (hover:hover)` around
   hover rules (R8), `@font-face` (R4), low-power class (§4.6).
4. `index.html`: drop the Google Fonts `<link>`s, add
   `<script src="js/platform.js">`, and route `target="_blank"` links through
   the shim (a `data-external` attribute plus a delegated click handler).
5. `sw.js`: add `fonts/*` to `PRECACHE_URLS` and remove the Google Fonts
   branch. The web build stays a full PWA.
6. `scripts/ci-check.sh` + `.github/workflows/ci.yml`:
   - replace the "no Capacitor leftovers" guard with the opposite check:
     `www/` and `node_modules/` stay untracked, and `capacitor.config.json` is
     valid JSON
   - bump Node to 22 (Capacitor 8 requires Node ≥ 22)

## 6. Recommended Capacitor version and plugins

- **Capacitor 8.5.x.** `@capacitor/core`, `/cli`, `/android`, `/ios` are
  8.5.3 on npm as of 2026-10-19. Use ≥ 8.4 for the SystemBars inset fixes.
- Requirements:
  - Node ≥ 22
  - Xcode 26+, iOS deployment target 15.0; the iOS project is generated with
    **Swift Package Manager** (the default in Capacitor 8), so no CocoaPods
  - Android: minSdk 24, compile/target SDK 36 (as in 23856cf's
    `android/variables.gradle`)
- `appId`: `com.virtualarenas.binality`, the id used in 23856cf. **Owner must
  confirm** it matches the existing Play listing that the earlier G2 decision
  said would be updated (versionCode ≥ 48).

| Plugin | Version | Use | Priority |
|---|---|---|---|
| `SystemBars` (in core) | 8.5 | Dark-background bar style; Android inset CSS variables | P0 |
| `@capacitor/app` | 8.1.x | `backButton`, `pause`/`resume`, `appUrlOpen`, `minimizeApp` | P0 |
| `@capacitor/splash-screen` | 8.0.x | Launch screen in `#070314`; hide once the first program is loaded | P0 |
| Custom `ForegroundAudio` plugin (Android, local) | n/a | FGS + wake lock while playing; ported from 23856cf | P0 |
| iOS audio-session setup (local, `AppDelegate.swift`) | n/a | `.playback` category, interruption notifications; optionally exposed as a tiny local plugin | P0 |
| `@capacitor/preferences` | 8.0.x | Durable copy of custom presets and key settings | P1 |
| `@capacitor/share` | 8.0.x | Share preset link / exported XML | P1 |
| `@capacitor/filesystem` | 8.1.x | Write the exported `.xml` to cache before sharing | P1 |
| `@capacitor/browser` | 8.0.x | GitHub / Wikipedia / privacy-policy links | P1 |
| `@capacitor/clipboard` | 8.0.x | Fallback for the share link | P2 |
| `@capacitor/haptics` | 8.0.x | Light tick on start/stop, breathing-phase change, timer end | P2 |
| `@capacitor/screen-orientation` | 8.0.x | Only if UX decides to lock portrait on phones (the manifest says `any`) | P2 |
| `@capacitor-community/keep-awake` | 8.0.x | Keep the screen on while the breathing pacer / scope is visible (opt-in) | P2 |
| Lock-screen / notification media controls | n/a | Neither WebView bridges `navigator.mediaSession` for Web Audio. Needs native work (Android `MediaSession` in the FGS notification; iOS `MPNowPlayingInfoCenter` + `MPRemoteCommandCenter`) | P2 (strong store-review value) |
| `@capacitor/assets` (dev) | 3.0.x | Generate icons and splash from `images/binality-icon-1024.png` | P0 tooling |

Not needed:

- `@capacitor/keyboard`: the only text inputs are in Studio, inside a
  scrollable modal; default resize behaviour is enough, so revisit only if UX
  testing shows the dock jumping.
- `@capacitor/status-bar`: replaced by core `SystemBars`.
- Network and status plugins.

## 7. Recommended project structure

Keep the web app exactly where it is (repo root is what's deployed to
https://binality.virtualarenas.com/). Add the native layer alongside it:

```
/                      web app (unchanged layout, still deployable as-is)
  index.html  css/  js/  images/  programs/  fonts/(new)  sw.js  manifest.webmanifest ...
  js/platform.js       (new) native/web shim, no imports
  package.json         (new) @capacitor/* deps + scripts
  package-lock.json    (new)
  capacitor.config.json(new) appId, appName, webDir "www", plugins.SystemBars/SplashScreen
  scripts/copy-www.mjs (new, ported from 23856cf) allowlist copy → www/
  www/                 (gitignored) build output fed to `cap sync`
  android/             (committed) Capacitor Android project + ForegroundAudio plugin
  ios/                 (committed) Capacitor iOS SPM project + AppDelegate audio session
  resources/           (new) icon.png 1024², splash.png 2732² for @capacitor/assets
  docs/mobile-capacitor-plan.md
```

- **Why a `www/` copy instead of `webDir: "."`:** `cap sync` would otherwise
  bundle `.git`-adjacent files, `docs/`, `scripts/`, `skills-lock.json`,
  `android/` itself, etc. An explicit allowlist (index.html, privacypolicy.html,
  404.html, css/, js/, images/, programs/, fonts/, manifest.webmanifest,
  favicon.ico, apple-touch-icon-precomposed.png) keeps the bundle small and
  predictable. `sw.js` can be excluded because it isn't registered on native.
- **Flow:** `npm run build` (= `node scripts/copy-www.mjs`) → `npx cap sync`
  (copies `www/` into `android/app/src/main/assets/public` and
  `ios/App/App/public`, updates native plugin deps) → `npx cap open
  android|ios` or the CI Gradle/Xcode build. Scripts: `build`, `sync`,
  `android`, `ios` as in 23856cf's `package.json`, plus `cap:doctor`.
- **Config notes:** leave `server.androidScheme` at its default `https` and the
  hostname at `localhost`, and never change them (R9). Do **not** set
  `server.url` (no live reload in release builds). Keep the debug
  `applicationIdSuffix ".dev"` from 23856cf so debug builds install alongside
  the store app.
- **Versioning:** derive `versionName` from a single `version` in
  `package.json`, and `versionCode`/`CFBundleVersion` from CI. Details belong
  to the pipeline plan (t_23743c2c).

## 8. Proposed implementation tasks (ordered)

Sizes: S ≤ 0.5 day, M 1–2 days, L 3–5 days. "Native" means it needs Android
Studio or a Mac with Xcode.

| # | Task | Size | Depends on | Notes |
|---|---|---|---|---|
| 0 | Owner decisions: confirm Capacitor reversal of PR #5/#21; appId `com.virtualarenas.binality` and existing Play listing; Apple Developer account (none per earlier G1 answer, so iOS is simulator-only until one exists); app display name | — | — | Blocks 5 and store work only, not 1–4 |
| 1 | Update CI for a native layer: replace the anti-Capacitor guard in `scripts/ci-check.sh`, Node 22 in `ci.yml`, gitignore `www/`, `node_modules/` | S | 0 | Must land first or every later PR fails CI |
| 2 | Web hardening that also helps the PWA: self-host fonts (R4); DPR fix and cap, chart redraw gating, `shadowBlur` reduction (§4); `@media (hover:hover)`; pointer events on the chart (R8); `context.suspend()` on stop (R10) | M | — | Can start immediately; web-only, testable in desktop Chrome with device emulation |
| 3 | **Spike: background audio on real devices.** Minimal Capacitor app that plays the current engine with the screen locked for 30 min on a physical iPhone (iOS 17/18/26) and a Pixel/Samsung (Android 13–16). Verify silent switch, lock, app switch, phone-call interruption | M | 1 | Go/no-go for the whole effort. If iOS fails, fall back to the silent-`<audio>` keep-alive or render to an `AudioBuffer` → `<audio>` |
| 4 | Robust timers and lifecycle: wall-clock sleep timer, audio-clock scheduling of fade/stop/program end, `onstatechange`/interruption handling, resume re-sync of UI and rAF loops (R1 JS side, R2) | M | — | Web-testable with throttled background tabs |
| 5 | Capacitor scaffold: `package.json`, `capacitor.config.json`, `scripts/copy-www.mjs`, `npx cap add android` + `ios` (SPM), `js/platform.js` shim, skip SW/PWA UI on native (R3), SystemBars style, splash, icons via `@capacitor/assets` | M | 1, 0 | Port from 23856cf where possible |
| 6 | Android background audio: re-add `AudioForegroundService` + `ForegroundAudioPlugin`, POST_NOTIFICATIONS prompt, wire to `start()`/`stop()` via the shim | S–M | 3, 5 | Code exists in 23856cf; add a stop action to the notification |
| 7 | iOS background audio: `UIBackgroundModes audio`, `AVAudioSession .playback` + interruption observer in `AppDelegate.swift`, `navigator.audioSession.type='playback'` | M | 3, 5 | Native (Mac) |
| 8 | Safe areas and layout pass on device (R7) per the UX spec | M | 5, t_277c9e2a | Phones in both orientations, tablets |
| 9 | Native integrations: back button (R6), `@capacitor/browser` links, export/share via Filesystem + Share, canonical share URL (R5), Preferences mirror of presets (R9) | M | 5 | |
| 10 | Performance/battery pass on a low-end Android (2–3 GB RAM, WebView ≥ 120): low-power CSS class, scope FPS, 60-min playback battery and temperature check | M | 2, 5, 6 | |
| 11 | Lock-screen media controls (Android MediaSession in the FGS notification; iOS Now Playing + remote commands) | L | 6, 7 | Optional for v1; helps App Store review against guideline 4.2 ("minimum functionality") |
| 12 | Deep links for `#preset=` (App Links / Universal Links + `appUrlOpen`) | M | 9 | Optional; needs files hosted on binality.virtualarenas.com |
| 13 | Haptics, keep-awake toggle for the pacer, optional orientation lock | S | 5 | Polish |
| 14 | Device QA matrix and store-readiness checklist (health-claims copy review for "Pain Relief"/"Universal Healing" under App Store 1.4.1, privacy labels "no data collected" after R4, Play FGS declaration) | M | 6–10 | Hands over to the release pipeline (t_23743c2c) |

Critical path: 1 → 3 → 5 → 6/7 → 10 → 14. Tasks 2 and 4 run in parallel from
day one and are useful even if the native effort stops at the spike.
