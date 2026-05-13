#!/bin/bash
# session-start.sh
# Hook event: SessionStart (startup / resume / clear)
# Purpose: Load project context into LLM: branch, recent commits, working tree, SESSION.md preview.
#
# Contract (UNIVERSAL_CORE.md §13.2):
#   stdin: JSON event
#   stdout: text added to LLM context at session start
#   exit 0: OK
#
# Fail-safe: silently exit 0 on any error.

set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" 2>/dev/null || exit 0

# Skip if not a git repo
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  exit 0
fi

echo "## Session context (auto-loaded)"
echo ""

# ── Branch ──
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "<unknown>")
echo "**Branch:** \`$BRANCH\`"
echo ""

# ── Recent commits ──
echo "**Recent commits:**"
echo '```'
git log --oneline -5 2>/dev/null || echo "(no commits yet)"
echo '```'
echo ""

# ── Working tree (only modified + untracked, capped) ──
WORKING_TREE=$(git status --porcelain 2>/dev/null | head -10 || true)
if [[ -n "$WORKING_TREE" ]]; then
  echo "**Working tree:**"
  echo '```'
  echo "$WORKING_TREE"
  echo '```'
  echo ""
fi

# ── SESSION.md preview (first 30 lines) ──
if [[ -f "docs/SESSION.md" ]]; then
  echo "**SESSION.md preview:**"
  echo '```'
  head -30 docs/SESSION.md
  echo '```'
fi

exit 0
