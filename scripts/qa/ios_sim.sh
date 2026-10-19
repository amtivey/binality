#!/usr/bin/env bash
# QA M1.6: iOS Simulator launch check on a macOS runner (devices C and D profiles).
# Builds the app for the simulator, boots iPhone 16 Pro (Dynamic Island) and iPhone SE 3rd gen, installs,
# launches and takes screenshots of the first-run state (real WKWebView safe areas).
# Usage: scripts/qa/ios_sim.sh <out-dir>
set -uo pipefail
out="$1"; mkdir -p "$out"
DD="${RUNNER_TEMP:-/tmp}/DerivedData"
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath "$DD" CODE_SIGNING_ALLOWED=NO build > "$out/xcodebuild.log" 2>&1 || { tail -40 "$out/xcodebuild.log"; exit 1; }
app="$(find "$DD/Build/Products" -name 'App.app' -maxdepth 3 | head -1)"
bid="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app/Info.plist")"
echo "app=$app bundle=$bid" | tee "$out/info.txt"
xcrun simctl list runtimes > "$out/runtimes.txt"
xcrun simctl list devicetypes | grep -E "iPhone (16 Pro|SE)" > "$out/devicetypes.txt"
rt="$(xcrun simctl list runtimes -j | python3 -c 'import json,sys; r=[x for x in json.load(sys.stdin)["runtimes"] if x["isAvailable"] and x["platform"]=="iOS"]; print(r[-1]["identifier"])')"
echo "runtime=$rt" | tee -a "$out/info.txt"
run_dev() {
  tag="$1"; type="$2"
  udid="$(xcrun simctl create "qa-$tag" "$type" "$rt")" || return 1
  xcrun simctl boot "$udid"; xcrun simctl bootstatus "$udid" -b > /dev/null 2>&1
  xcrun simctl status_bar "$udid" override --time 9:41 --batteryState charged --batteryLevel 100 --cellularMode active --cellularBars 4 --wifiBars 3 || true
  xcrun simctl install "$udid" "$app"
  xcrun simctl launch "$udid" "$bid" | tee -a "$out/info.txt"
  sleep 12
  xcrun simctl io "$udid" screenshot "$out/${tag}_01_first_run_portrait.png"
  xcrun simctl ui "$udid" content_size accessibility-extra-extra-extra-large || true
  xcrun simctl terminate "$udid" "$bid"; xcrun simctl launch "$udid" "$bid" > /dev/null; sleep 8
  xcrun simctl io "$udid" screenshot "$out/${tag}_02_first_run_dynamic_type_AX3.png"
  xcrun simctl ui "$udid" content_size large || true
  xcrun simctl spawn "$udid" log show --last 2m --predicate 'process == "App"' --style compact 2>/dev/null | tail -60 > "$out/${tag}_log.txt" || true
  xcrun simctl shutdown "$udid" || true
}
run_dev C "com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro" || echo "C failed" >> "$out/info.txt"
run_dev D "com.apple.CoreSimulator.SimDeviceType.iPhone-SE-3rd-generation" || echo "D failed" >> "$out/info.txt"
ls -la "$out"
