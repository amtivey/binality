#!/usr/bin/env bash
# Baseline checks for the static web app. Run locally: bash scripts/ci-check.sh
set -euo pipefail
cd "$(dirname "$0")/.."
fail=0

echo "== required files"
for f in index.html manifest.webmanifest js/index.js js/main.js js/plugins.js; do
  [ -f "$f" ] || { echo "missing: $f"; fail=1; }
done

echo "== JS syntax"
for f in js/index.js js/main.js js/plugins.js; do node --check "$f"; done

echo "== manifest.webmanifest is valid JSON"
python3 -m json.tool manifest.webmanifest > /dev/null

echo "== programs/*.xml are well-formed"
python3 scripts/check-programs.py

echo "== no Capacitor / native-wrapper leftovers"
for p in android capacitor.config.json package.json package-lock.json node_modules www; do
  [ ! -e "$p" ] || { echo "unexpected path: $p"; fail=1; }
done
if grep -rniI "capacitor" --exclude-dir=.git --exclude-dir=docs --exclude=ci-check.sh .; then
  echo "capacitor reference found"; fail=1
fi

exit $fail
