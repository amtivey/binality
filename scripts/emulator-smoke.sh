#!/usr/bin/env bash
# Runs inside the Android emulator (reactivecircus/android-emulator-runner).
# Installs the debug APK, launches it and checks it stays alive.
# Usage: scripts/emulator-smoke.sh <apk> <out-dir>
set -euo pipefail
apk="$1"; out="$2"
pkg="com.virtualarenas.binality.dev"
mkdir -p "$out"

adb install -r "$apk" | tee "$out/install.txt"
adb shell pm list packages | grep -F "package:$pkg" | tee -a "$out/install.txt"
adb logcat -c
adb shell am start -W -n "$pkg/com.virtualarenas.binality.MainActivity" | tee "$out/start.txt"
sleep 15
adb exec-out screencap -p > "$out/launch.png"
adb logcat -d > "$out/logcat.txt" || true

pid="$(adb shell pidof "$pkg" || true)"
echo "$pid" > "$out/pid.txt"
if [ -z "$pid" ]; then
  echo "app process is not running after launch (crash?)"
  grep -E "FATAL|AndroidRuntime" "$out/logcat.txt" | head -20 || true
  exit 1
fi
if grep -q "FATAL EXCEPTION" "$out/logcat.txt"; then
  echo "fatal exception in logcat"; grep -A15 "FATAL EXCEPTION" "$out/logcat.txt" | head -40; exit 1
fi
echo "OK: $pkg installed, launched, pid $pid"
