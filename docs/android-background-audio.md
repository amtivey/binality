# Android background audio (M0.4, decision D7)

Web Audio inside an Android WebView stops when the app is backgrounded and the screen is off.
Binality keeps it running with a foreground service (type `mediaPlayback`) and a partial wake lock.

## How it works

- `AudioForegroundService` (android/app/src/main/java/com/virtualarenas/binality/) runs as a
  foreground service with an ongoing notification ("Binality", program name, Stop action) and
  holds `PARTIAL_WAKE_LOCK` `binality:playback`.
- `ForegroundAudioPlugin` is a local Capacitor plugin (registered in `MainActivity`). JS never
  calls it directly. Use `BinalityPlatform.keepAlive` in `js/platform.js`:
  - `keepAlive.start(title)` - called from `start()` in `js/index.js`; idempotent.
  - `keepAlive.stop()` - called from `stop()` (not on seeks, which pass `preserveTimer`).
  - `keepAlive.onStopRequested(fn)` - registered once in `js/index.js`; calls `stop()`.
  - All are no-ops on web and iOS.
- Notification Stop: the service does not stop itself. It emits the `stopRequested` plugin
  event, JS runs the normal `stop()` (same as the Stop button, so the UI updates), and that
  calls `keepAlive.stop()` which stops the service. If no web layer is alive the service
  stops itself.
- The service is `START_NOT_STICKY`: if Android kills the process, nothing restarts a silent
  service holding a wake lock.

## Notification permission (Android 13+ / API 33+)

At the first Start, if `POST_NOTIFICATIONS` is not granted and we have not asked before, the app
shows a short explanation (`confirm()`), then the system permission prompt. This happens once
(`localStorage` key `binality.notifPermissionAsked`).

If the user denies it, playback still works: the foreground service and wake lock run without
a visible notification, so audio still survives screen-off, but there is no Stop action to
tap. The user stops from the app. Revoked/denied state can be changed in system settings.
Android 12 and below need no permission.

## Manifest

Permissions: `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `WAKE_LOCK`,
`POST_NOTIFICATIONS`. Service: `foregroundServiceType="mediaPlayback"`, not exported.

## Emulator check (API 34 or 36)

1. Install the debug APK (`com.virtualarenas.binality.dev`), open, tap Start on Relaxation.
   Allow notifications at the prompt.
2. `adb shell input keyevent KEYCODE_POWER` (screen off). Wait 10 minutes.
3. `adb shell dumpsys media.audio_flinger | head -40` or `adb logcat -s AudioTrack` shows the
   app's track still active; `adb shell dumpsys power | grep binality` shows the wake lock.
4. Wake the screen, pull the shade, tap Stop in the notification. The app button must read
   "start" and the notification must disappear.

## Real-device 30-minute screen-off test (owner step)

1. Install the debug APK. Open it, pick Relaxation, tap start. Allow notifications.
2. Note the position readout, then press the power button to lock the phone.
3. Leave it for 30 minutes (do not touch it; headphones or speaker, either).
4. Unlock. Expected: audio was audible the whole time, and the position advanced by about 30
   minutes.
5. Pull the notification shade, tap Stop. Expected: notification disappears and the app
   button shows "start".
6. Report: device model, Android version, pass/fail (and when audio stopped if it failed).
7. Optional: repeat with notifications denied (Settings > Apps > Binality) to confirm audio
   still continues.
