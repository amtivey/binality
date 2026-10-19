#!/usr/bin/env bash
# Baseline checks for the static web app. Run locally: bash scripts/ci-check.sh
set -euo pipefail
cd "$(dirname "$0")/.."
fail=0

echo "== required files"
for f in index.html manifest.webmanifest sw.js js/index.js css/index.css; do
  [ -f "$f" ] || { echo "missing: $f"; fail=1; }
done

echo "== optional native-layer config is valid JSON"
# Before node --check: node reads package.json and dies obscurely if it is invalid.
for f in capacitor.config.json package.json; do
  if [ -e "$f" ]; then
    python3 -m json.tool "$f" > /dev/null || { echo "invalid JSON: $f"; fail=1; }
  fi
done

echo "== JS syntax"
for f in js/index.js sw.js; do node --check "$f"; done

echo "== manifest.webmanifest is valid JSON"
python3 -m json.tool manifest.webmanifest > /dev/null

echo "== programs/*.xml are well-formed"
python3 scripts/check-programs.py

echo "== build output and dependencies are not tracked"
tracked=$(git ls-files www node_modules)
if [ -n "$tracked" ]; then
  echo "tracked build output / dependencies (must be gitignored):"
  echo "$tracked" | head -20
  fail=1
fi

exit $fail
