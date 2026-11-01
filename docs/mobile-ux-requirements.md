# Mobile UX requirements

Status: draft for engineering. Author: tech-artist (kanban t_277c9e2a).
Parent plan: `docs/mobile-capacitor-plan.md` (built by t_6a311b6a; this file is the UX input to it).

Consolidation note (t_6a311b6a): this file was written against an older tree. v2 has since been merged into `dev`
(PR #22, plus the mobile declutter in PR #24), so the "build base" question in 0.2 and 12.1 is settled: the mobile
build is cut from `dev`. Line references like "v2 ~L4570" are approximate; re-locate them in `js/index.js` on `dev`.
Decisions in the plan's section 2 override the defaults and open decisions in section 12 here.

## 0. How to read this

- Every requirement has an ID (`MUX-<area>-<n>`), a priority and a pass/fail check.
- P0 = blocks store submission or makes the app unusable on a phone. P1 = needed for a good 1.0. P2 = polish, may slip.
- "Compact / Medium / Expanded" are width classes defined in section 3. Units: CSS px (= iOS pt = Android dp).
- Pass/fail checks name the test devices from section 11.

### 0.1 What Binality actually is (and what that changes)

Binality is NOT a game. It is a brainwave-entrainment / binaural-beats audio player: pick a program (a set of
frequency-over-time curves in `programs/*.xml`), press start, and the app synthesises two stereo tones with Web Audio.
The only canvas content is a chart (jqPlot in v1, hand-drawn `#chartCanvas` in v2) and, in v2, a live waveform/FFR scope.
So "controls" here means: transport (start/stop, seek), volume, program choice, settings, and chart scrubbing.
There is no gameplay input, no joystick, no D-pad. The dominant real-world use is eyes closed, lying down, phone locked,
often at night, often with headphones. Requirements are weighted toward that: audio must survive screen-off, interruptions
and rotation, and the UI must be usable in the dark with one thumb.

### 0.2 Which UI this targets

- `dev`/`main` (this worktree) is the v1 UI: `#header #body #control #footer #settings`, jqPlot chart.
- `origin/v2` (PR #22 merged there, not yet on `dev`) is the product direction: glass-panel app shell, chart + waveform/FFR scope,
  breathing pacer, isochronic mode, Preset Studio, ambient noise, sleep timer, PWA service worker.
- Requirements are written against v2 element IDs (`#start`, `#slider`, `#menu`, `#settings`, `#selectProgram`, `#baseFreq`,
  `#headerBreathBtn`, `#headerModeBtn`, `#headerTestStereoBtn`, `#headerStudioBtn`, `#chartCanvas`, `#waveformStage`,
  `#quickToneSlider`, `#quickAmbientSlider`, `#quickTimerSelect`, `#breathOverlay`, `#studioModal`). The shared IDs
  (`#start #slider #menu #settings #selectProgram #baseFreq #chart #divPosition`) apply equally to v1.
- DECISION NEEDED (listed in section 12): the mobile build must be cut from v2, not v1. v1's layout (percentage heights, JS-computed
  font sizes in `clientResize()`) cannot meet sections 3-5 without a rewrite.

### 0.3 Context the engineer should know

- Capacitor was added in commit 23856cf and removed in PR #5 (d9ca5c3, merged 2026-10-16); an Expo plan was started and then dropped
  (4aacadc). The reason for the rollback is not recorded in the repo. These requirements are wrapper-agnostic where possible
  (anything that is "web" works in Capacitor, Expo WebView or a PWA); wrapper-specific items are tagged [native].
- The removed Capacitor build had an Android foreground service (`AudioForegroundService`, type mediaPlayback, wake lock, ongoing
  notification) so audio kept rendering with screen off. That solved a real problem and the same capability is required again (MUX-LIFE-1).

---

## 1. Current-state review (what breaks on touch)

| # | Where | Today | Problem on a phone | Resolved by |
|---|-------|-------|--------------------|-------------|
| 1 | `keydown` Escape closes Studio/Settings (v2 js ~L4570) | Keyboard only | No Esc key; Android has a back button/gesture, iOS has none | MUX-IN-4, MUX-IN-5 |
| 2 | Chart `mousemove`/`mouseleave` tooltip, `click` to seek (v2 ~L973) | Hover + click | No hover on touch; tap seeks instantly and restarts audio (slider `change` does stop()+start()); fingers hide the tooltip | MUX-IN-1..3 |
| 3 | `title="..."` tooltips on header buttons, toggles | Explanatory text only on hover | Invisible on touch; several buttons are icon + tiny label | MUX-HUD-6 |
| 4 | Header has 5 buttons + logo + FOSS/carrier/status pills (v2) | Fits ~1000 px | Overflows at 360 px; labels hidden at <=640 px leaves unlabeled icons | MUX-HUD-1..3 |
| 5 | Sizes of many v2 controls: 15-18 px icons, 26 px, 7-9 px dots, 8 px slider track | Mouse-sized | Below 44/48 px minimum hit target | MUX-TAP-* |
| 6 | `<input type=range>` default styling for `#slider`, `#quickToneSlider`, `#quickAmbientSlider` | Thin thumb | Hard to hit, easy to scroll-fight with page | MUX-TAP-4, MUX-IN-6 |
| 7 | `<input type=file accept=xml>` custom program | Desktop file picker | Works in Android/iOS WebView but needs verifying; XML hard to obtain on a phone | MUX-IN-8 |
| 8 | `navigator.clipboard.writeText` for sharing presets | Clipboard | Works but poor UX on mobile | MUX-IN-9 |
| 9 | No `visibilitychange`, no Media Session, no wake lock, no audio-interruption handling | Desktop tab | Audio can stop when screen locks; no lock-screen controls; calls/alarms leave UI out of sync | MUX-LIFE-* |
| 10 | Google Fonts loaded from `fonts.googleapis.com` (v2) | Needs network | Fails offline in an app that is meant to work offline; also a privacy-label issue | MUX-VIS-4 |
| 11 | `viewport` already has `viewport-fit=cover` but no `env(safe-area-inset-*)` use anywhere | n/a | Content under notch/Dynamic Island/home indicator | MUX-SAFE-* |
| 12 | `#settings` / `#studioModal` are centered dialogs with `max-height: calc(100dvh - 32px)` | Desktop dialog | On phones should be full-height sheets with safe-area padding and a reachable close button | MUX-LAYOUT-6 |
| 13 | `manifest.webmanifest`: v1 `orientation: portrait`, v2 `any` | Inconsistent | Orientation decision never made | section 4 |
| 14 | `window.navigator.standalone`, PWA install/update toasts (v2 ~L4500) | PWA only | Must be disabled inside the native wrapper (no "install" or "update available" nags) | MUX-NATIVE-3 |

---

## 2. Input / control scheme (replacing keyboard and mouse)

Principles: one-thumb reachable primary action; no gesture is the only way to do something; nothing requires hover, right-click,
long-press, double-tap, multi-touch, or a keyboard (except typing in text fields).

### 2.1 Mapping

| Desktop interaction | Mobile replacement | Notes |
|---------------------|--------------------|-------|
| Click `#start` | Tap `#start` (toggle start/stop) | Single control, label flips `start`/`stop`; also lock-screen/notification play/pause (MUX-LIFE-6) |
| Drag `#slider` to seek | Drag thumb; also tap on track to jump | Seek while playing is applied on release, not continuously (MUX-IN-6) |
| Hover chart for tooltip | Press-and-drag on chart shows cursor + tooltip above the finger | MUX-IN-1 |
| Click chart to seek | Quick tap (no drag) on chart plot area seeks, with confirmation toast | MUX-IN-2, MUX-IN-3 |
| Hover buttons for `title` | Visible text labels in the UI; long explanations go in an info sheet (`i` button) | MUX-HUD-6 |
| Escape closes modal | Visible Close/Done button + Android system back + backdrop tap; iOS: close button and swipe-down on sheet | MUX-IN-4, MUX-IN-5 |
| Keyboard shortcuts | None required. Optional: hardware keyboard Space = start/stop, only when no input is focused | P2 |
| Mouse wheel / scrollbars in dialogs | Native touch scrolling with momentum, no visible scrollbar styling needed | MUX-IN-6 |
| `<select>` for program | Keep native `<select>` (OS picker) in Settings, plus a program quick-switch (below) | MUX-IN-7 |
| File upload of custom XML | Keep `<input type=file>`; add share/import path (below) | MUX-IN-8 |
| Clipboard copy of preset link | OS share sheet [native] with clipboard fallback | MUX-IN-9 |
| Text field `#baseFreq` number input | `inputmode="decimal"`, font-size >= 16 px | MUX-IN-10 |

### 2.2 Requirements

- **MUX-IN-1 (P0)** Chart scrubbing: use Pointer Events (not mouse events) on `#chartCanvas` and `#waveformCanvas`. On `pointerdown`/`pointermove`
  with `pointerType` touch/pen, show the vertical cursor line and the tooltip. The tooltip is placed at least 56 px above the touch point and
  clamped inside the stage (existing 8 px clamp logic stays). The tooltip hides on `pointerup`/`pointercancel`.
  Check: on a phone, drag across the chart; the tooltip is never covered by the finger and follows within one frame (16 ms budget on test device A).
- **MUX-IN-2 (P0)** Tap-to-seek on the chart fires only if the pointer moved < 10 px and was down < 300 ms. Drag never seeks. Check: dragging
  across the chart during playback does not restart the audio; a tap does, exactly once.
- **MUX-IN-3 (P1)** A chart seek during playback shows a 1.5 s toast "Jumped to m:ss" and applies a 150 ms gain fade across the audio restart
  (no click/pop). Check: no audible click on a seek at 12 Hz beat / 440 Hz carrier (listen on headphones).
- **MUX-IN-4 (P0)** [native] Android back button / back gesture priority, handled via Capacitor `App.addListener('backButton')`:
  (1) close `#studioModal`, (2) close `#settings`, (3) close `#breathOverlay` if open, (4) close any open toast/sheet, (5) otherwise if audio is playing call
  `App.minimizeApp()` (audio keeps playing, never kills the session), else exit the app. Check: with Settings open over a playing session, back closes
  Settings only; second back minimises and audio continues.
- **MUX-IN-5 (P0)** Every modal/sheet has a visible close control >= 48x48 in the top-right (top-left in RTL), inside the safe area. The `Escape` handler stays
  for desktop/PWA. On Expanded widths the backdrop tap also closes. On Compact the sheet also closes with a downward swipe on its header grabber (P1).
- **MUX-IN-6 (P0)** Scroll/drag conflicts: the app shell does not scroll (`html, body {overflow:hidden; overscroll-behavior:none}`). `#settings` body and
  Studio body scroll vertically with `-webkit-overflow-scrolling: touch; overscroll-behavior: contain`. Sliders and chart canvases set `touch-action: none`
  (so horizontal drags are never hijacked by the OS back-swipe or vertical scroll). Seek via `#slider` commits on `change` (release), while the time label
  updates live on `input`.
- **MUX-IN-7 (P1)** Program quick switch: tapping the program title (`#title`) in the header opens a bottom sheet listing all programs as 56 px-tall rows
  (name + one-line description + duration). Selecting one calls the existing `changeProgram()`. The Settings `<select>` remains. Check: change program from
  the main screen in 2 taps. If a session is playing, switching stops playback (current behaviour) and does not auto-start.
- **MUX-IN-8 (P1)** Custom XML: keep file input; additionally [native] register to open `.xml` via the OS share sheet / "Open in Binality" (iOS
  `CFBundleDocumentTypes`, Android intent filter `text/xml`, `application/xml`). If this is too expensive for 1.0, document that custom programs are
  authored via the in-app Preset Studio (which is touch-capable, see MUX-STU-1) and defer import to P2.
- **MUX-IN-9 (P1)** [native] Preset sharing uses the Share plugin (`Share.share({title,text,url})`); fall back to clipboard + toast "Link copied".
- **MUX-IN-10 (P0)** All text/number/select controls use font-size >= 16 px (prevents iOS focus-zoom), `autocomplete=off`, appropriate `inputmode`.
  The soft keyboard must not cover the focused input: scroll it into view with the settings body padded by `visualViewport` inset (or Capacitor Keyboard
  `resize: 'body'`/`'native'` equivalent). `baseFreq` accepts 100-1000 Hz; out-of-range input is clamped on blur with an inline message, not silently.

### 2.3 Preset Studio on touch (v2)

- **MUX-STU-1 (P1)** Keyframe editing (`studio-point` rows with delete buttons) must work with finger input: each row >= 56 px tall, delete button >= 48x48
  (currently `studio-point-del-btn` is a small icon), numeric fields 48 px high. No drag-only editing. Studio on Compact is a full-screen sheet with a sticky
  bottom action bar (Save / Cancel) that clears the home indicator.
- **MUX-STU-2 (P2)** Studio chart: pinch-zoom is NOT required (no multi-touch dependency).

---

## 3. Layout, scaling and width classes

### 3.1 Width classes (use width of the window, not the device; split-screen and foldables change it at runtime)

| Class | Window width | Typical devices | Layout |
|-------|--------------|-----------------|--------|
| Compact | < 600 | all phones portrait, small split-screen | single column, stacked (A) |
| Medium | 600-899 | phones landscape, foldables, small tablets portrait | stage + side dock if height < 500, else single column (B/A) |
| Expanded | >= 900 | tablets, landscape large tablets | stage left, control column right (C) |

Additionally a **short** modifier applies when window height < 500 (every phone in landscape): header collapses to 44 px and chrome moves to the side (B).

Existing CSS breakpoints (`max-width: 640px`, `600px`) are replaced by these classes. Use CSS media/container queries; no JS layout math
(retire v1's `clientResize()` font-size/line-height computing).

### 3.2 Requirements

- **MUX-LAYOUT-1 (P0)** The root shell is `position: fixed; inset: 0; height: 100dvh` (fallback `100vh` then `-webkit-fill-available`), `display:flex; flex-direction: column`.
  No element uses `vh`/`%` heights summing to 100 (v1 `10%+75%+5%+10%` pattern) - use flex with `min-height:0` on the stage. Check: no vertical page scroll and no clipped
  Start button on any device in section 11 in both orientations, including with the Android keyboard closed and OS font scale at 130%.
- **MUX-LAYOUT-2 (P0)** The stage (chart / scope canvas) takes all remaining space with a minimum of 160 px height (v2 already has 160). If the minimum cannot be
  met (e.g. 320x480 split-screen), the chart legend and description collapse first, then the transport secondary rows (ambient, timer) move into a collapsible
  "Mixer" drawer; Start and the time slider are never hidden.
- **MUX-LAYOUT-3 (P0)** Canvases are sized by `ResizeObserver` on their container (v2 already uses one) and rendered at `devicePixelRatio` capped at 2 (cap 1.5 when
  the scope animation is running on a device that drops below 50 fps in the first 3 s - P2). On rotation/resize the redraw happens within 100 ms and without flashing blank.
  The jqPlot-based v1 chart is not supported on the mobile build.
- **MUX-LAYOUT-4 (P0)** Aspect-ratio handling: the layout must be valid for any window aspect from 9:21 (tall phones, 360x800+) through 4:3 (iPad) to 21:9 landscape.
  Content does not letterbox; backgrounds are full-bleed; no fixed aspect ratio is imposed on the chart. Check: run at 360x800, 390x844, 430x932, 320x568, 768x1024, 1024x768, 1280x800,
  844x390, 932x430, and 673x841 (unfolded foldable) - each renders without clipping, overlap or horizontal scroll.
- **MUX-LAYOUT-5 (P1)** Expanded layout (C): two panels. Left (fluid): header strip + stage. Right (fixed 320-380 px): program card, time readout, slider, Start (large), volume
  sliders, timer, breath/mode shortcuts. Max content width 1280 px, centered beyond that.
- **MUX-LAYOUT-6 (P0)** Settings and Studio: on Compact/Medium they are full-screen sheets (no rounded outer margin, 100dvh, safe-area padded, sticky header with title + Close, scrollable body).
  On Expanded they remain centered dialogs, width min(560px, 90vw), max-height 90dvh.
- **MUX-LAYOUT-7 (P0)** `html` sets `-webkit-text-size-adjust: 100%`; body font >= 16 px; secondary text >= 12 px; no text below 11 px anywhere (v2 has 6-9 px items; these are dots/badges
  and must not carry text). Layout must survive Android font scale 200% and iOS Dynamic Type "AX3" without hiding Start (labels may wrap/ellipsize; Start and time stay).

### 3.3 Sketches

Notation: `[ ]` = tappable (all >= 48 px high), `~~~` = chart, `<>` = slider, `|` edges are the safe-area-inset boundary, `(SA)` = safe-area padding.

**A. Compact portrait (390x844, notch/Dynamic Island, home indicator)**

    +----------------------------------+
    |(SA top: status bar / island)     |
    |  [logo] Relaxation   [🎧][🌬][⚙] |  header 56 px: logo 36, title+band (tap = program sheet),
    |         Theta / Delta   (• idle) |  Mode, Breathe, Settings icon buttons 48x48
    |----------------------------------|
    |  Mixed theta and delta waves ... |  description, 2 lines, ellipsis, tap to expand
    |  [ Curve | Scope ]    12.0 Hz    |  segmented control 48 px + live Hz chip
    |  +----------------------------+  |
    |  |  ~~~~~~~~~~~~~~~~~~~~~~~~  |  |  STAGE: flex:1, min 160 px
    |  |  ~~~~~ chart / scope ~~~~  |  |  drag = scrub, tap = seek
    |  +----------------------------+  |
    |  00:00 <==o=================> 60:00 |  time row: mono 16 px, slider hit-height 48
    |  🔈 Beats   <====o=====>  35%    |  mixer rows 48 px (collapsible "Mixer ▾", collapsed by default
    |  🌊 Noise   <==o=======>  20%    |  when height < 700)
    |  ⏲ Timer: Off            [▾]     |
    |  [          START          ]     |  primary button: full width, 56 px, radius 16
    |(SA bottom: home indicator 34 px) |  8 px gap above the inset
    +----------------------------------+

**B. Phone landscape (844x390, "short")** - safe-area left/right insets apply (notch side)

    +--------------------------------------------------------------+
    |(SAL) [logo] Relaxation  Theta/Delta        [🎧][🌬][⚙] (SAR) |  header 44 px
    |      +------------------------------+  +------------------+  |
    |      |                              |  | 00:00 / 60:00    |  |  right column 240-280 px
    |      |  ~~~~~ chart / scope ~~~~~   |  | <==o===========> |  |  stage fills the rest
    |      |                              |  | 🔈 <==o===>      |  |
    |      |                              |  | 🌊 <==o===>      |  |
    |      +------------------------------+  | [    START     ] |  |  Start 56 px, sticks to bottom
    |                       (SA bottom 21 px)+------------------+  |
    +--------------------------------------------------------------+

**C. Tablet landscape (1180x820, Expanded)**

    +------------------------------------------------------------------------+
    | [logo] BINALITY   Relaxation · Theta/Delta · ● idle      [Studio][🌬][🎧][⚙]|  header 64 px, labels visible
    |  +---------------------------------------------+  +-----------------+  |
    |  | description                 [Curve|Scope]   |  | Program card    |  |
    |  |  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~  |  | 00:00 / 60:00   |  |
    |  |  ~~~~~~~~~~~~ stage ~~~~~~~~~~~~~~~~~~~~~~  |  | <==o=========> |  |
    |  |  legend                                     |  | Beats / Noise   |  |
    |  +---------------------------------------------+  | Timer           |  |
    |                                                    | [   START    ]  |  |
    |                                                    +-----------------+  |
    +------------------------------------------------------------------------+

**D. Settings sheet, Compact**

    +----------------------------------+
    | ———  (grabber)                   |
    | Program & Audio Settings    [ ✕ ]|  sticky, 56 px
    |----------------------------------|
    | Choose a program   [Studio]      |  scrolls
    | [ Relaxation              ▾ ]    |  48 px select, 16 px text
    | Entrainment mode  [Binaural|Iso] |  segmented 56 px, each segment states "needs headphones"
    | [ 🎧 Test Left / Right ]         |  moved here from header on Compact
    | Base frequency [ 440 ] Hz        |
    | Keep screen on while playing  (o)|  new, MUX-LIFE-8
    | Health & safety disclaimer ...   |
    | About / Privacy / Open source    |
    |----------------------------------|
    | [            Done              ] |  sticky bottom, clears home indicator
    +----------------------------------+

---

## 4. Orientation

Decision: **support both orientations on every device; do not lock.** Rationale: sleep/meditation users place the phone flat or on a stand in whichever orientation;
the OS rotation lock already gives users control; forcing portrait makes tablet use awkward and Android 16 ignores orientation locks on large screens anyway.

- **MUX-ORI-1 (P0)** iPhone: `UISupportedInterfaceOrientations` = Portrait, LandscapeLeft, LandscapeRight (no upside-down; avoids the notch problems). iPad: all four
  (`UISupportedInterfaceOrientations~ipad`), and `UIRequiresFullScreen` = false so Split View / Stage Manager work.
- **MUX-ORI-2 (P0)** Android: activity `android:screenOrientation="fullUser"` (honours the system auto-rotate lock), `resizeableActivity="true"`,
  and `configChanges` includes `orientation|screenSize|smallestScreenSize|screenLayout|density|keyboardHidden|uiMode` (already present in the removed manifest) so rotation
  never recreates the Activity.
- **MUX-ORI-3 (P0)** Web manifest: set `"orientation": "any"` (v2 already; v1's `portrait` is wrong for the mobile build).
- **MUX-ORI-4 (P0)** Rotation during playback must not: stop or glitch audio, reset the position, close an open Settings/Studio sheet, lose slider/volume values, or
  re-trigger the onboarding notice. Check: start Sleep Induction, rotate 4 times in 10 s with Settings open - audio continuous, position monotonic, sheet still open.
- **MUX-ORI-5 (P1)** Layout switch (A <-> B) is complete within 300 ms of the rotation event; no intermediate frame with a stretched canvas.
- **MUX-ORI-6 (P2)** Setting "Lock orientation" is deliberately NOT built; OS lock suffices.

---

## 5. Safe areas, system bars, notch, home indicator

- **MUX-SAFE-1 (P0)** Keep `viewport-fit=cover`. Define once in `:root`:
  `--sat: max(env(safe-area-inset-top,0px), var(--safe-area-inset-top,0px))` and likewise `--sab --sal --sar`
  (the `--safe-area-inset-*` fallback covers Android WebViews/Capacitor SystemBars that expose insets as CSS variables rather than `env()`; engineer to confirm which path each
  API level (29-35) uses and keep whichever works - the acceptance test is visual, below).
- **MUX-SAFE-2 (P0)** `.app-shell` padding = `calc(8px + var(--sat)) calc(10px + var(--sar)) calc(8px + var(--sab)) calc(10px + var(--sal))`. Decorative backgrounds
  (ambient orbs, gradient, `theme-color` #070314) are full-bleed behind the insets; interactive controls never are.
- **MUX-SAFE-3 (P0)** The Start button's bottom edge is >= 8 px above the home-indicator inset and never inside the 34 px iOS indicator zone or the Android 3-button / gesture bar.
  Sheets' sticky bottom bars add `padding-bottom: var(--sab)`.
- **MUX-SAFE-4 (P0)** In landscape the side insets (notch / Dynamic Island on left or right, camera cut-outs) keep every control and text >= 0 px clear of the cut-out; the stage may
  extend to the screen edge only if it contains no text or touch-critical content within inset+8 px.
- **MUX-SAFE-5 (P0)** [native] Status bar: light content (white icons) on dark background, transparent/overlay, colour #070314. Android navigation bar colour #070314 with light
  icons (edge-to-edge is enforced on Android 15 / targetSdk 35 - the app must paint under the bars deliberately, not rely on the system to inset). iOS: `UIStatusBarStyle` light,
  `UIViewControllerBasedStatusBarAppearance` as per Capacitor default.
- **MUX-SAFE-6 (P1)** Bottom-edge gesture conflict: no horizontal slider is placed within the bottom 24 px + inset (iOS home-swipe) or within 20 px of left/right screen edges
  (Android back-swipe gesture). Check: dragging `#slider` never triggers back navigation on Pixel 8 gesture navigation.
- **MUX-SAFE-7 (P1)** Foldables/tablets: no layout assumes a fixed window; on unfold/fold or split-screen resize the layout class re-evaluates live (ResizeObserver + media queries), audio uninterrupted.

---

## 6. Tap targets and spacing

- **MUX-TAP-1 (P0)** Every interactive element has a hit area >= 48x48 px (Android guideline; also satisfies Apple's 44x44). Visual glyph may be smaller (e.g. 20 px icon) if the
  hit area is extended with padding or `::after` pseudo-element. Applies to: header buttons, close buttons, scope mode/zoom/channel buttons, breath mode pills, breath size/close
  buttons, studio delete buttons, chart view toggles, legend toggles (if interactive), status/PWA toast buttons.
- **MUX-TAP-2 (P0)** Minimum 8 px between adjacent hit areas (so 48+8 = 56 px pitch in a row of icon buttons). Inline text links (e.g. in Settings about section) get >= 44 px line height via padding.
- **MUX-TAP-3 (P0)** `#start` is >= 56 px high and, on Compact, the full content width; on Expanded >= 280 px wide. It is the largest and highest-contrast element on screen.
- **MUX-TAP-4 (P0)** Range inputs (`#slider`, `#quickToneSlider`, `#quickAmbientSlider`): custom-styled thumb 28 px diameter, track 6 px, element height 48 px (so the invisible
  hit area covers the full 48 px). Thumb has a visible focus/active state (scale 1.15 + glow). Value labels (`35%`, `m:ss`) are >= 14 px and are not the only way to see the value while dragging.
- **MUX-TAP-5 (P0)** Pressed feedback within 100 ms on every control (`:active` style: scale .97 / brightness). Remove 300 ms click delay (`touch-action: manipulation` on buttons). Hover-only styles are
  wrapped in `@media (hover: hover)`.
- **MUX-TAP-6 (P0)** Disable accidental OS behaviours on the app shell: `-webkit-tap-highlight-color: transparent; -webkit-touch-callout: none; user-select: none` (v2 already disables selection on the
  body; keep `user-select:text` in Settings text, disclaimer, and Studio inputs).
- **MUX-TAP-7 (P1)** Destructive actions (delete saved preset, reset) require a confirm sheet with 56 px buttons; no destructive action is reachable by a single stray tap.
- **MUX-TAP-8 (P1)** Optional haptics [native] (`@capacitor/haptics`): light impact on Start/Stop, selection tick on segmented controls. Off by default on Android < 8 / when the OS "touch feedback" is off. Never during a session except on user input.

---

## 7. HUD / on-screen UI adjustments

The v2 header and scope HUD were designed for a wide window. Compact/short rules:

| Element (v2) | Compact | Short landscape | Expanded |
|--------------|---------|-----------------|----------|
| Logo (`#icon`) | 36 px | 28 px | 40 px |
| `BINALITY` wordmark | hidden | hidden | shown |
| `FOSS` badge, `#carrierBadge` | hidden (carrier value moves to Settings and the scope HUD) | hidden | shown |
| `#title` + `#activeBandBadge` | shown, ellipsis, tap opens program sheet | one line | shown |
| `#audioStatus` | dot only (green/amber/grey) + `aria-live` text kept off-screen | dot only | dot + text |
| `#headerModeBtn` (Binaural/Isochronic) | icon-only 48x48 | icon-only | icon + label |
| `#headerBreathBtn` | icon-only 48x48 | icon-only | icon + label |
| `#headerStudioBtn` | moved into Settings | moved into Settings | shown |
| `#headerTestStereoBtn` | moved into Settings | moved into Settings | shown |
| `#menu` (settings gear) | icon-only 48x48 | icon-only | icon + label |
| `#voiceCountBadge` | hidden | hidden | shown |
| `#liveFreqBadge` | shown (chip under the stage toggle) | shown | shown |
| `.chart-description` | 2 lines, ellipsis, tap expands inline | hidden | full |
| `#chartLegend` | single scroll-free row of colour dots with voice numbers | hidden | full |
| Scope controls bar (mode / window / channels) | one row horizontally scrollable `overflow-x:auto` with 48 px buttons; or the three groups collapse into a "View ▾" sheet (engineer's choice, pick one) | collapsed into "View ▾" sheet | full row |
| Scope HUD badges (`#scopeHud`) | max 2 badges (FFR beat, mode); carrier/cycle available in the "View" sheet | 2 badges | all 4 |
| `#scopeIdleOverlay` | text <= 2 lines | icon only | full |
| Breath pacer (`#breathOverlay`) | bottom-anchored card, max 55% of stage height, centred orb; mode pills in a horizontally scrollable row | corner compact card (existing "compact" mode) | as today |
| Update/install toasts | suppressed in native build | suppressed | suppressed |

- **MUX-HUD-1 (P0)** On Compact, header content fits in one 56 px row at 320 px width without overflow: logo + title (>= 100 px, ellipsized) + 3 icon buttons. Check: 320x568 screenshot, no horizontal overflow, no wrapped header.
- **MUX-HUD-2 (P0)** Icon-only header buttons have `aria-label` and a first-use coach mark (see MUX-HUD-7) since labels are hidden; mode button shows state through icon (🎧 vs speaker) and aria-pressed.
- **MUX-HUD-3 (P1)** Status dot colours: idle grey, playing green with slow 2 s pulse (disabled under reduced motion), paused/interrupted amber, error red; colour is never the only indicator (aria-live text + title in Settings).
- **MUX-HUD-4 (P0)** Time readout uses monospace tabular numerals, >= 16 px, width fixed for the longest value (`1:00:00`) so the slider does not jitter as time advances.
- **MUX-HUD-5 (P1)** Chart axis labels >= 11 px, <= 5 ticks per axis on Compact, curve line width 2.5 px, current-position marker drawn as a 2 px line + 10 px handle (not interactive; scrubbing uses the whole stage).
- **MUX-HUD-6 (P0)** No information is available only through `title` attributes. Anything explained by a tooltip today (mode meaning, FFR, carrier, Test L/R) has a short visible label or an `i` info button opening a sheet; the required first-run notice covers headphones (MUX-LIFE-12).
- **MUX-HUD-7 (P2)** One-time coach marks (3 steps max): tap title to change program; drag chart to inspect; mode button meaning. Skippable, never reappear after dismissal (`localStorage`).

---

## 8. Visual and accessibility

- **MUX-VIS-1 (P0)** Dark-only UI. Pure black or near-black (#070314) backgrounds, no large white areas anywhere (including native dialogs: set `color-scheme: dark`, so `<select>` pickers and
  keyboards render dark). Brightness is low by default; no element larger than 25% of the screen is brighter than 60% grey while a session is playing.
- **MUX-VIS-2 (P0)** Contrast >= 4.5:1 for text, 3:1 for icons/controls/slider thumb against their backgrounds (glass panels included). Check with a contrast tool on the 6 store screenshots' frames.
- **MUX-VIS-3 (P0)** `prefers-reduced-motion: reduce` turns off ambient orb animation, status pulse, breath aura and orb scaling is replaced by text countdown + a static ring progress; scope canvas animation is
  slowed to a static redraw at 10 fps. (Breath pacer content stays functional.)
- **MUX-VIS-4 (P0)** Fonts are bundled locally (Outfit, Plus Jakarta Sans, JetBrains Mono - woff2, `font-display: swap`, subset Latin) and the `fonts.googleapis.com` / `fonts.gstatic.com` links are removed.
  Check: airplane mode first launch looks identical.
- **MUX-VIS-5 (P0)** No flashing: nothing flashes more than 3 times per second (photosensitivity; the app carries an epilepsy disclaimer). The scope animation shows continuous waveforms, not strobing; isochronic mode
  has NO visual pulse synced to the tone.
- **MUX-VIS-6 (P1)** Screen reader: VoiceOver and TalkBack can reach and operate every control. Sliders expose `aria-valuetext` ("12 minutes 30 seconds of 60 minutes", "Beats volume 35 percent"). Start toggles
  `aria-pressed`/label "Start session"/"Stop session". Canvases have a text alternative (`aria-label` updated with program name and current beat Hz). Focus order follows visual order; focus is trapped in open sheets and returned to the opener.
- **MUX-VIS-7 (P1)** Supports OS font scale up to 200% (see MUX-LAYOUT-7).

---

## 9. Pause / resume, background and interruptions

This is the highest-risk area for the product: a session is typically 20-60 minutes, locked screen.

State model (UI and audio must agree): `idle` -> `playing` <-> `paused-by-user` (stop button = stop, position retained) / `interrupted` (system took audio) -> `playing` | `idle`.
Note: today `stop()` destroys the oscillators and `start()` rebuilds them from `#slider` value; "pause" = stop + remembered position. Keep that, but position must be saved.

| Event | Required behaviour |
|-------|--------------------|
| User taps Stop | Fade out over 300 ms, stop, keep position in slider; Start resumes from that position with a 3 s fade-in |
| App goes to background / screen locks while playing | Audio continues (MUX-LIFE-1). Visual loops (scope rAF, breath rAF, chart redraw) are suspended (MUX-LIFE-3) |
| App returns to foreground | UI re-syncs from the audio clock within 1 s (position, status, timer remaining); if audio was stopped by the OS show state `idle` with position retained, not a stale "playing" |
| Incoming call / Siri / FaceTime / other app takes audio focus (transient loss) | Pause immediately, state `interrupted` (amber). When focus returns *and* the OS says resume is appropriate: resume with a 3 s fade-in. After a call longer than 10 min do not auto-resume (user probably went back to sleep or left) |
| Alarm / timer / notification sound | Duck if the OS ducks; no UI action |
| Permanent audio focus loss (another music app starts) | Stop, state `idle`, position retained, no auto-resume |
| Headphones unplugged / Bluetooth disconnect | Stop immediately (binaural beats through a speaker are useless and loud), state `idle`, toast "Headphones disconnected - session stopped". Never auto-resume on reconnect |
| Sleep timer fires | 10 s linear fade-out, optional chime (existing), stop, state `idle`; position reset to 0; must fire with screen locked |
| Program ends | Same as sleep timer finish (existing code resets slider to 0 and stops) |
| Low battery / thermal throttling | No special behaviour except MUX-LIFE-3 |
| App killed by user/OS | Next launch: idle, last program + position + settings restored (no autoplay) |
| Device volume | System volume buttons control master volume; in-app sliders remain for balance only |

- **MUX-LIFE-1 (P0)** Audio keeps playing for >= 60 min with the screen off, the app backgrounded and the device idle (Doze) on test devices A and C. [native] Android: foreground service type `mediaPlayback` with
  ongoing notification and `WAKE_LOCK` (as in the removed commit 23856cf) plus `FOREGROUND_SERVICE_MEDIA_PLAYBACK` and `POST_NOTIFICATIONS` (Android 13+ runtime prompt, requested at first Start, with a pre-prompt explanation). [native]
  iOS: `UIBackgroundModes: audio` and the `AVAudioSession` category `playback` (non-mixing, as chosen in section 12) set before first Start. Open technical risk for the feasibility doc: Web Audio inside WKWebView in the background is
  not guaranteed; if it fails, a native audio engine plugin or a muted-looping `<audio>` keep-alive is the fallback - the UX requirement above stays.
- **MUX-LIFE-2 (P0)** Position and timers are derived from `audioContext.currentTime` (existing `monitor` already does this), never from counting timer ticks; JS timers are throttled in the background. The sleep timer (`#quickTimerSelect`)
  must be scheduled on the audio clock (e.g. gain automation + `osc.stop(when)`) so it ends on time with the screen locked. Check: 10-minute timer with screen off ends within +/- 2 s.
- **MUX-LIFE-3 (P0)** On `document.visibilitychange` hidden / Capacitor `appStateChange {isActive:false}`: cancel `requestAnimationFrame` loops (scope, breath), pause chart hover redraws, stop writing to the DOM every second.
  On visible: restart them and re-sync. Check: with the screen off, JS main-thread CPU < 3% (Android profiler / Instruments) and battery drain <= 6%/hour at 50% volume on test device A.
- **MUX-LIFE-4 (P0)** [native] Interruption handling: iOS - observe `AVAudioSession.interruptionNotification` (began/ended with `shouldResume`) and `routeChangeNotification` (`oldDeviceUnavailable`); Android - `AudioFocus` listener
  (`AUDIOFOCUS_LOSS_TRANSIENT`, `LOSS`, `GAIN`) and `ACTION_AUDIO_BECOMING_NOISY`. Each posts an event to the web layer which calls the same `stop()`/`start()` code paths as the buttons so UI state cannot diverge. If the chosen wrapper
  cannot deliver these, the web fallback is `AudioContext.onstatechange` (`interrupted`/`suspended` -> state `interrupted`) and `devicechange` - weaker but acceptable for beta, not for store release.
- **MUX-LIFE-5 (P0)** `AudioContext` is created/resumed only from a user gesture (existing `context.resume()` in `start()`), and resumed after an interruption ends. A suspended or `interrupted` context never leaves the UI showing "stop".
- **MUX-LIFE-6 (P0)** Lock-screen / notification / headset controls: set Media Session (`navigator.mediaSession.metadata = {title: programName, artist: 'Binality', artwork: [512 px icon]}`; handlers `play`, `pause`/`stop`) or the native equivalents
  ([native] iOS `MPNowPlayingInfoCenter` + `MPRemoteCommandCenter`; Android MediaSession notification). Play/Pause on a Bluetooth headset or earbud stem works. Seek-to-position is not exposed (P2: `setPositionState`).
- **MUX-LIFE-7 (P0)** Persistence: write `currentProgram`, last position (seconds), `baseFreq`, volumes, timer, mode, stage view on every change and on `pause`/`appStateChange` (v2 already persists most via `localStorage`; position is new). Cold start never autoplays and
  the first paint (idle, last program, last position) is < 2.5 s after tap on test device B (cold start including splash, p95 of 5 runs).
- **MUX-LIFE-8 (P1)** Setting "Keep screen on while playing" (default OFF) using the Screen Wake Lock API / `@capacitor-community/keep-awake`. When ON the wake lock is released at session end and when the app backgrounds. When OFF the OS
  idle timeout applies as normal (screen sleeps; audio continues).
- **MUX-LIFE-9 (P1)** "Sleep dim": during playback, after 30 s without touch, fade a pure black overlay (opacity 0.92, `pointer-events: all`) over everything except a small clock/time-remaining text (~20% grey); any tap removes it. Only active when Keep-screen-on is ON. Stops all canvas animation while dimmed.
- **MUX-LIFE-10 (P0)** Volume safety: every Start ramps master gain from 0 to the saved level over 3 s (extends the existing volume envelope; program-level `volume` automation already starts at 0). Default beats volume 35%. A first-run notice (one screen, must be acknowledged) says:
  binaural beats need stereo headphones; keep volume low; not for use while driving; not medical; consult a doctor if epileptic or with heart conditions - same content as the existing Settings disclaimer, plus a link to it.
- **MUX-LIFE-11 (P1)** If mode is `binaural` and the audio route is the built-in speaker (detectable only natively [native]; otherwise skip), show a dismissible banner "Binaural beats work best on headphones - switch to Isochronic?". Never auto-switch.
- **MUX-LIFE-12 (P0)** First-run notice and the existing disclaimer must be reachable from Settings at any time (App Store review needs the health disclaimer visible).
- **MUX-LIFE-13 (P1)** Memory/crash: on `memory warning` (iOS `didReceiveMemoryWarning`) release scope buffers; session audio must never be dropped for a UI cache.

### 9.1 Native wrapper UX

- **MUX-NATIVE-1 (P0)** [native] Splash: shown until the first frame of the idle UI is ready (`SplashScreen.hide()` called after fonts + first chart paint), max 2 s, `launchAutoHide:false`, fade 200 ms. Colour #070314, centred logo (assets in section 10).
- **MUX-NATIVE-2 (P0)** [native] App content loads from bundled assets (no remote `server.url`), so Airplane mode works. Program XML, JS, CSS, fonts and icons all local. Service worker may be omitted or registered only for the PWA build.
- **MUX-NATIVE-3 (P0)** PWA-only UI (install prompt, "update available" toast, offline banner at v2 ~L4500) is disabled when `Capacitor.isNativePlatform()`.
- **MUX-NATIVE-4 (P1)** External links (GitHub, Wikipedia, privacy policy) open in the system browser/in-app browser, never replace the app WebView.
- **MUX-NATIVE-5 (P1)** Only one running instance: Android `launchMode="singleTask"` (as before); tapping the notification returns to the existing Activity without restarting playback.
- **MUX-NATIVE-6 (P2)** Home-screen quick actions / widgets / Siri shortcuts for "Start Sleep Induction" (out of scope for 1.0, noted for roadmap).

---

## 10. App-store-facing assets

All art is derived from the v2 icon (`images/binality-icon-1024.png` on `origin/v2`; the v1 `images/icon.png` is 72x72 and unusable). Source files live in `assets/` (new
directory, proposed for the Capacitor build) so `@capacitor/assets generate` can produce platform sizes; CI should not require designers to hand-export each size.

### 10.1 Source masters (deliver these; everything else is generated)

| File | Size | Notes |
|------|------|-------|
| `assets/icon-only.png` | 1024x1024 | Full-bleed square, **no transparency**, no pre-rounded corners, no text |
| `assets/icon-foreground.png` | 1024x1024 | Transparent; artwork inside the central 66% (676 px) circle - Android adaptive-icon safe zone |
| `assets/icon-background.png` | 1024x1024 | Solid/gradient #070314 -> deep indigo, no artwork |
| `assets/icon-monochrome.png` | 1024x1024 | Single-colour (white on transparent) glyph for Android 13+ themed icons |
| `assets/splash.png` | 2732x2732 | Background #070314, logo centred and inside the central 1200x1200 area |
| `assets/splash-dark.png` | 2732x2732 | Same as splash (app is dark-only) |

### 10.2 Generated / required platform sizes

iOS (Xcode 14+ asset catalog accepts one 1024x1024 `AppIcon`; also supply the iOS 18 dark and tinted variants if the design supports them - P2):
- App Store icon 1024x1024 PNG, sRGB, no alpha, no rounded corners.
- Legacy (only if a deployment target < iOS 16 is chosen): 20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180 px.
- Launch screen: `LaunchScreen.storyboard` with background colour #070314 and centred image from `splash.png` (Capacitor template does this).

Android:
- Adaptive icon: foreground + background layers 108x108 dp (432x432 px at xxxhdpi, 324 @xxhdpi, 216 @xhdpi, 162 @hdpi, 108 @mdpi) in `mipmap-anydpi-v26/ic_launcher.xml` (+ `ic_launcher_round.xml`) with `<monochrome>` layer for themed icons.
- Legacy launcher PNGs: 48 (mdpi), 72 (hdpi), 96 (xhdpi), 144 (xxhdpi), 192 (xxxhdpi).
- Notification small icon (for the foreground-service notification): 24x24 dp monochrome white-on-transparent glyph, in `drawable-*dpi` (24/36/48/72/96 px). Required - the colour app icon renders as a white square otherwise.
- Android 12+ splash: `windowSplashScreenBackground=#070314`, `windowSplashScreenAnimatedIcon` 288x288 dp vector/PNG with artwork inside the central 192 dp circle (use `icon-foreground`); legacy `drawable-*/splash.png` for < API 31 via `@capacitor/splash-screen`.
- Play Store listing icon: 512x512 PNG (32-bit, <= 1 MB).
- Play feature graphic: 1024x500 PNG/JPG, no alpha; keep key content in the central 70% (cropped differently across surfaces).

Web/PWA (already on v2; keep): favicon 64, icon 192, 512, 512 maskable, 1024; `apple-touch-icon` 180x180 (currently 152 - regenerate).

### 10.3 Store screenshots

Capture from real simulator/emulator builds (not mock-ups), idle state replaced by a running session frame, status bar showing 9:41 / full battery / no carrier name (use Xcode `simctl status_bar` / Android demo mode).
Apple sizes change over time - confirm in App Store Connect at submission; at time of writing:

| Store | Device class | Size (portrait) | Count | Required? |
|-------|-------------|-----------------|-------|-----------|
| App Store | iPhone 6.9" | 1320x2868 | 3-10 (use 6) | Yes |
| App Store | iPhone 6.5" | 1284x2778 (or 1242x2688) | 3-10 | Only if 6.9" not provided / older fallback |
| App Store | iPad 13" | 2064x2752 | 3-10 | Yes if iPad is supported (it is in this plan) |
| Google Play | Phone | 1080x1920 up to 1440x3120 (9:16 - 9:21, min 320 px, max 3840 px, long side <= 2x short side) | 4-8 (use 6) | Yes (min 2) |
| Google Play | 7" tablet | 1200x1920 | 2-8 | Recommended (needed for "large screen" quality eligibility) |
| Google Play | 10" tablet | 1600x2560 | 2-8 | Recommended |

Shot list (same 6 scenes on every device, captions in 1 line of <= 6 words, set in Outfit 600, on the app's own background):
1. Program curve with playback running - "Sleep, focus, meditate"
2. Waveform / FFR scope live - "See the beats you hear"
3. Program picker sheet (MUX-IN-7) - "11 science-based programs" (do NOT write unverifiable health claims, see 10.5)
4. Breathing pacer over the stage - "Pace your breath"
5. Timer + ambient noise mixer - "Sleep timer and soft noise"
6. Preset Studio - "Build your own program"
Tablet sets reuse scenes 1, 2, 4, 6 in Expanded layout (C). Landscape phone screenshots are not required.

Optional: 15-30 s app preview video (App Store: exact device resolution, H.264, <= 30 s; Play: YouTube URL) - P2.

### 10.4 Listing text and metadata needed (copy owner: producer / user)

- App name "Binality" (30 char limit on both stores); iOS subtitle <= 30 chars; Play short description <= 80 chars; full description <= 4000 chars; iOS keyword field <= 100 chars; promotional text <= 170 chars.
- Category: Health & Fitness (both stores) - DECISION: confirm; Music is an alternative but invites different review scrutiny.
- Support URL, marketing URL, **privacy policy URL** (see 10.5), copyright line "(c) 2014 Alexis Matthew Tivey" (README) - confirm current owner/year.
- Age rating questionnaire answers (no user content, no web access beyond links, medical/health info = "no medical claims", no gambling): expected 4+ / Everyone.
- Apple: App Privacy "nutrition label" (Data Not Collected if analytics stay removed); export-compliance answer (no encryption beyond OS: `ITSAppUsesNonExemptEncryption=false`); review notes explaining headphone use and that the app is not a medical device.
- Google Play: Data safety form (no data collected/shared), content rating (IARC), target audience (13+ / all ages - DECISION), declaration for foreground service `mediaPlayback` use, health-apps declaration form.
- Test account: none needed (no login) - state that in review notes.

### 10.5 Content/compliance issues found in the current repo that affect assets

- `privacypolicy.html` is a generic template that claims collection of name, phone number, postal address, cookies and log data; the app collects none of these. It must be rewritten to match reality (no account, no analytics,
  everything on-device, localStorage only) before it is used as the store privacy URL, and hosted at a stable HTTPS URL (GitHub Pages or virtualarenas.com).
- Program names "Pain Relief", "Universal Healing", "Out of Body Experience", "Astral Projection" and descriptions can trigger App Store guideline 1.4.1 (medical claims) and Play health-app policies. Recommend: keep the existing disclaimer, rename in store
  copy to neutral wording ("Relaxation", "Focus", "Sleep"), and never use "heals", "cures", "treats" in listing text or screenshots. Final naming is a user decision (section 12).
- Screenshots must not show the "10s Test" dev option in the timer list (`<option value="10s">10s Test</option>`) - hide it in production builds.

---

## 11. Verification matrix

Minimum devices (real hardware for A, B, C, D; simulators/emulators for the rest):

| ID | Device | Window (portrait) | Why |
|----|--------|-------------------|-----|
| A | Android mid-range phone, Android 13-14, gesture nav (e.g. Pixel 6a/7a) | 412x915 | Reference Android; Doze/foreground service tests |
| B | Android low-end, 3-button nav, API 29-30, 360x640-800 | 360x760 | Smallest common width, back button, slow cold start |
| C | iPhone with Dynamic Island, iOS 17/18 (iPhone 15/16) | 393x852 | Safe-areas, background audio, interruptions |
| D | iPhone SE 2nd/3rd gen, home button | 375x667 | No notch, short height |
| E | iPad (10th gen or Air), iPadOS 17+ | 820x1180 | Expanded layout, Split View |
| F | Android tablet or Pixel Tablet emulator | 800x1280 | Expanded, rotation |
| G | Foldable emulator (unfolded 673x841 / 2208x1840) | resize live | MUX-SAFE-7 |
| H | Small window 320x480 (Android split-screen, iPad Slide Over 320x~) | 320x480 | Worst-case MUX-LAYOUT-2 |

Acceptance test script (all must pass on A, C, E, plus B/D for layout):
1. Fresh install, airplane mode: first run notice shown, acknowledged, idle UI correct, fonts local (MUX-VIS-4, MUX-LIFE-10, MUX-NATIVE-2).
2. Tap Start -> 3 s fade-in; lock screen; wait 5 min; lock-screen controls show title "Relaxation"; pause/play from lock screen works (MUX-LIFE-1, -6).
3. Phone call (simulate) -> pause, amber status; end call -> resume with fade-in only if < 10 min (MUX-LIFE-4).
4. Unplug/disconnect headphones -> stop, toast, no auto-resume.
5. Rotate 4x during playback with Settings open -> no audio gap, position monotonic (MUX-ORI-4).
6. Drag on chart: tooltip above finger, no seek. Tap: seek once. No pops (MUX-IN-1..3).
7. Android back with Settings open then again while playing -> closes, then minimises; audio continues (MUX-IN-4).
8. 10-min timer with screen off ends within +/-2 s with chime (MUX-LIFE-2).
9. OS font scale 200%: Start and slider still visible and operable (MUX-LAYOUT-7).
10. Every tappable element measured >= 48x48 via accessibility inspector (Android Accessibility Scanner / Xcode Accessibility Inspector) with no failures (MUX-TAP-1).
11. VoiceOver + TalkBack complete a session: choose program, set timer, start, stop (MUX-VIS-6).
12. Visual safe-area check on C, D (home indicator), notch landscape, A with 3-button nav: no control within an inset (MUX-SAFE-1..4).
13. Kill app mid-session, relaunch: idle, same program and position, no sound (MUX-LIFE-7).
14. 60-minute screen-off run on A and C at 50% volume: no audio dropout, battery <= 6%/h (MUX-LIFE-1, -3).

---

## 12. Open decisions (need the user / producer before or during Phase 1)

1. **Build base:** cut the mobile build from `origin/v2` (recommended) rather than `dev`/v1. v2 is not on `dev` yet.
2. **Wrapper:** Capacitor was rolled back on 2026-10-16 and Expo dropped; confirm Capacitor is the intended path this time and why the previous attempt was rolled back, so the new plan doesn't repeat that problem.
3. **iOS audio session policy:** exclusive `playback` (silences other apps' audio - typical for entrainment) vs mixable (lets podcasts/music continue). Recommended: non-mixing by default, no setting for 1.0.
4. **Store category and age rating:** Health & Fitness vs Music; and program naming/claims wording (10.5).
5. **Apple Developer Program ($99/yr) and Google Play Console ($25 once) accounts, bundle/application id** (`com.virtualarenas.binality` was used previously) and who the legal "seller" is - affects privacy policy and copyright text.
6. **Phone landscape / tablet scope for 1.0:** this doc requires both; if schedule is tight, ship Compact portrait + landscape and defer Expanded layout (MUX-LAYOUT-5) to 1.1. Listing then must not claim iPad support (iPad screenshots not needed).
7. **Sleep-dim / keep-awake (MUX-LIFE-8, -9):** nice to have; confirm in or out of 1.0.

## 13. Suggested implementation split (for the consolidation task)

- Phase 1 (web, no native needed): MUX-LAYOUT-*, MUX-SAFE-1..4, MUX-TAP-*, MUX-IN-1,2,5,6,7,10, MUX-HUD-*, MUX-VIS-*, MUX-STU-1, bundled fonts, PWA UI suppression flag.
- Phase 2 (native): MUX-LIFE-1..6, MUX-IN-4, MUX-ORI-1,2, MUX-SAFE-5, MUX-NATIVE-*, icon/splash generation, notification icon.
- Phase 3/4 (release): section 10 assets/listing/privacy policy/data-safety forms; section 11 matrix run on real devices.
