#!/usr/bin/env bash
# Privacy guard — block commits that leak internal identifiers into a public kit.
#
# Install:
#   ln -s ../../hooks/privacy-guard.sh .git/hooks/pre-commit
# Or run manually:
#   bash hooks/privacy-guard.sh
#
# CI:
#   .github/workflows/privacy.yml runs the same check on every push/PR.
#
# To allow a temporary exception, prefix the matching line with a `# privacy-ok:`
# comment (audited via grep, intentionally noisy).

set -euo pipefail

# --- Forbidden patterns (extend this list when a new internal name appears) ---
# Each pattern is a POSIX extended regex (no `\b` — not portable across
# git grep regex engines). Patterns are matched case-insensitively.
FORBIDDEN_PATTERNS=(
  # Personal identifiers — operator account, personal email handle.
  'gurgen'
  'gurich777'
  # Internal domain on which the kit was originally built.
  'clever-guest\.com'
  # Internal product / project names the kit was extracted from.
  'portiqa'
  'clever[ _-]?agent'
  # Hard-coded operator home path (always use <user> placeholder instead).
  '/Users/gurgen'
  # Credential shapes (covers the common LLM/API providers + AWS).
  'sk-[a-zA-Z0-9]{20,}'
  'AKIA[0-9A-Z]{16}'
  'ghp_[a-zA-Z0-9]{30,}'
  'xoxb-[0-9]+-'
)

# Files to scan: staged in pre-commit mode, otherwise the whole tree.
# Self-exclude — the guard script itself contains the forbidden-pattern
# dictionary; that's intent, not a leak.
EXCLUDE_RE='^(\.git(modules)?(/|$)|hooks/privacy-guard\.sh$)'
if [ "${CI:-}" = "true" ] || [ "${1:-}" = "--all" ]; then
  FILES=$(git ls-files | grep -v -E "$EXCLUDE_RE" || true)
  MODE="full tree"
else
  FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -v -E "$EXCLUDE_RE" || true)
  MODE="staged"
fi

if [ -z "$FILES" ]; then
  echo "[privacy-guard] no files to scan ($MODE)"
  exit 0
fi

HITS=0
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

for pattern in "${FORBIDDEN_PATTERNS[@]}"; do
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    [ -f "$f" ] || continue
    # Use `git grep` on staged blobs for pre-commit accuracy. Falls back to
    # `grep` for the full-tree CI scan.
    if [ "$MODE" = "staged" ]; then
      MATCHES=$(git grep --cached -inE "$pattern" -- "$f" 2>/dev/null || true)
    else
      MATCHES=$(grep -inE "$pattern" "$f" 2>/dev/null || true)
    fi
    # Drop lines explicitly marked safe with `# privacy-ok:` (audited inline).
    MATCHES=$(echo "$MATCHES" | grep -v 'privacy-ok:' || true)
    if [ -n "$MATCHES" ]; then
      HITS=$((HITS + 1))
      echo "$MATCHES" | sed "s|^|  [pattern: $pattern]  |"
    fi
  done <<< "$FILES"
done

if [ "$HITS" -gt 0 ]; then
  echo ""
  echo "[privacy-guard] FAIL — $HITS forbidden pattern hit(s) in $MODE."
  echo "[privacy-guard]   Either redact the identifier or mark the line with \`# privacy-ok: <reason>\`."
  exit 1
fi

echo "[privacy-guard] OK — $MODE clean of forbidden patterns."
