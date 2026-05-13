#!/bin/bash
# post-edit-lint.sh
# Hook event: PostToolUse on Edit/Write/MultiEdit
# Purpose: Run linter on the edited file; warn if baselined violation file touched.
#
# Contract (UNIVERSAL_CORE.md §13.2):
#   stdin: JSON with tool event (tool_input.file_path)
#   stdout: text to add to LLM context (empty on success)
#   stderr + exit 2: block action (not used here — non-blocking by default)
#   exit 0: OK
#
# Fail-safe: if any external tool not found, silently exit 0. Broken hook ≠ broken workflow.

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*"file_path"[[:space:]]*:[[:space:]]*"([^"]*)"/\1/' || true)

if [[ -z "${FILE_PATH:-}" ]]; then
  exit 0
fi

# ── 1. Cleanup-on-touch check (brownfield discipline) ──
# If file is in baseline (existing violation), remind LLM to fix and update baseline.
BASELINE_FOUND=0

for BASELINE in .boundary-baseline.json .cross-module-import-baseline.json; do
  if [[ -f "$BASELINE" ]] && grep -q -F "$FILE_PATH" "$BASELINE" 2>/dev/null; then
    if [[ $BASELINE_FOUND -eq 0 ]]; then
      echo "⚠ Cleanup-on-touch: \`$FILE_PATH\` has baselined violations."
      BASELINE_FOUND=1
    fi
    echo "  - listed in $BASELINE"
  fi
done

if [[ $BASELINE_FOUND -eq 1 ]]; then
  echo ""
  echo "Per cleanup-on-touch policy (UNIVERSAL_CORE.md §4.3):"
  echo "  1. Fix the violation in this file before committing."
  echo "  2. Run the linter's update-baseline command (stack-specific, see overlays/<stack>.md)."
  echo "  3. Commit fix + baseline update together."
fi

# ── 2. Stack-agnostic linter dispatch ──
# Detect stack by config files; run appropriate linter on the file.
# Add more stacks as needed.

# Skip if file doesn't exist (might be deleted)
if [[ ! -f "$FILE_PATH" ]]; then
  exit 0
fi

LINT_OUTPUT=""

# TypeScript / JavaScript (ESLint)
if [[ "$FILE_PATH" =~ \.(ts|tsx|js|jsx|mjs)$ ]] && [[ -f "eslint.config.mjs" || -f ".eslintrc.json" || -f "api/eslint.config.mjs" ]]; then
  # Determine working directory for the linter
  if [[ "$FILE_PATH" =~ ^api/ ]] && [[ -f "api/eslint.config.mjs" ]]; then
    LINT_OUTPUT=$(cd api && npx eslint "${FILE_PATH#api/}" --no-fix 2>&1 || true)
  elif command -v npx >/dev/null 2>&1; then
    LINT_OUTPUT=$(npx eslint "$FILE_PATH" --no-fix 2>&1 || true)
  fi
fi

# Python (Ruff)
if [[ "$FILE_PATH" =~ \.py$ ]] && command -v ruff >/dev/null 2>&1; then
  LINT_OUTPUT=$(ruff check "$FILE_PATH" 2>&1 || true)
fi

# Go (golangci-lint)
if [[ "$FILE_PATH" =~ \.go$ ]] && command -v golangci-lint >/dev/null 2>&1; then
  LINT_OUTPUT=$(golangci-lint run "$FILE_PATH" 2>&1 || true)
fi

# Output only if there are real issues (not just "0 problems")
if [[ -n "$LINT_OUTPUT" ]]; then
  # Filter trivial empty/clean output
  if echo "$LINT_OUTPUT" | grep -qE "error|warning|\bproblem"; then
    echo ""
    echo "Linter output for \`$FILE_PATH\`:"
    echo "\`\`\`"
    echo "$LINT_OUTPUT" | head -50
    echo "\`\`\`"
  fi
fi

exit 0
