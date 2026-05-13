#!/bin/bash
# stop-session-check.sh
# Hook event: Stop (LLM completes response)
# Purpose: Block Stop if code changed but SESSION.md not updated.
#
# Contract (UNIVERSAL_CORE.md §13.2):
#   stdin: JSON event
#   stderr + exit 2: block Stop, show message to LLM
#   exit 0: allow Stop
#
# Fail-safe: if git not available or check fails internally, silently exit 0.

set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" 2>/dev/null || exit 0

# Skip if not a git repo
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  exit 0
fi

# ── 1. Check for code changes ──
# Source files: adapt patterns per stack
CODE_CHANGED=$(git status --porcelain 2>/dev/null | grep -E '^[ MAD]+ +.*\.(ts|tsx|js|jsx|py|go|rs|java|kt)$' | grep -v -E '\.spec\.|\.test\.' || true)

if [[ -z "$CODE_CHANGED" ]]; then
  # No code changes — allow Stop silently
  exit 0
fi

# ── 2. Check if SESSION.md was updated ──
SESSION_FILE="docs/SESSION.md"

# After bootstrap, SESSION.md must exist (it's mandatory per UNIVERSAL_CORE §5.1).
# If it's missing AND code was changed → block.
if [[ ! -f "$SESSION_FILE" ]]; then
  cat >&2 <<EOF
Stop blocked: code changes detected but \`docs/SESSION.md\` does not exist.

Code changes:
$(echo "$CODE_CHANGED" | head -10)

Per UNIVERSAL_CORE §5.1, \`docs/SESSION.md\` is mandatory. Create it and add an entry for this work:

\`\`\`markdown
### [$(date +%Y-%m-%d)] <Title>
- Файлы: <list>
- Изменение: <what changed>
- Причина: <why>
\`\`\`

If this is a brand-new repo and bootstrap has not yet run — run \`bootstrap/greenfield.md\` first.
EOF
  exit 2
fi

SESSION_CHANGED=$(git status --porcelain "$SESSION_FILE" 2>/dev/null || true)

if [[ -z "$SESSION_CHANGED" ]]; then
  # Code changed but SESSION.md not — block Stop
  cat >&2 <<EOF
Stop blocked: code changes detected but \`docs/SESSION.md\` was not updated.

Code changes:
$(echo "$CODE_CHANGED" | head -10)

Per UNIVERSAL_CORE.md §5.3, add an entry to \`docs/SESSION.md\` for the work just completed:

\`\`\`markdown
### [$(date +%Y-%m-%d)] <Title>
- Файлы: <list>
- Изменение: <what changed>
- Причина: <why>
\`\`\`

If this was a trivial change (e.g. config tweak that doesn't warrant SESSION entry),
add a brief one-liner or update the most recent SESSION.md entry to cover it.
EOF
  exit 2
fi

exit 0
