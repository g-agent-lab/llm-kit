#!/usr/bin/env bash
# LLM Discipline Kit — smoke test harness.
#
# Runs all *.test.js files in this directory. Exits non-zero on any failure.
# Designed to be cheap (<5s), self-contained (only needs node), and to catch
# silent drift in the kit's template scripts (especially identity-stability
# regressions per Codex round-5).
#
# Usage:
#   ./tests/run-smoke.sh              # run all tests
#   bash tests/run-smoke.sh           # idem (no exec bit needed)

set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

shopt -s nullglob
TESTS=( *.test.cjs )
if [ ${#TESTS[@]} -eq 0 ]; then
  echo "no *.test.cjs files found in $DIR" >&2
  exit 2
fi

# Fail fast on first failing test file (each file already aggregates internally).
fail=0
for t in "${TESTS[@]}"; do
  echo
  echo "── $t ────────────────────────────────────────────────"
  if ! node "$t"; then
    fail=1
  fi
done

echo
if [ "$fail" -eq 0 ]; then
  echo "✓ smoke OK — kit template scripts behave per spec."
else
  echo "✗ smoke FAILED — see failures above."
  exit 1
fi
