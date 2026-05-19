# Contributing to LLM Discipline Kit

> This document is **rules for LLMs and humans adding to the kit**, not generic open-source etiquette.

---

## Privacy review (run before every commit)

The kit is intentionally public, but it's extracted from internal codebases. Before committing or opening a PR, run the privacy guard:

```bash
bash hooks/privacy-guard.sh           # scans staged files
CI=true bash hooks/privacy-guard.sh   # scans the full tree (CI parity)
```

Install as a pre-commit hook so it runs automatically:

```bash
ln -s ../../hooks/privacy-guard.sh .git/hooks/pre-commit
chmod +x hooks/privacy-guard.sh
```

The guard rejects any commit that contains operator-internal identifiers (personal account, internal product names, hard-coded `/Users/...` paths) or credential shapes (`sk-…`, `AKIA…`, `ghp_…`, `xoxb-…`). Same script runs in CI via `.github/workflows/privacy.yml`.

When adding a new pattern to the forbidden list, edit `hooks/privacy-guard.sh` and document the addition in this section.

---

## Cardinal rule

**Kit grows from real projects, not from imagination.** Every pattern in this kit was extracted from working production code on the NestJS host or loom. We do not pre-design overlays for stacks no one is using.

If you find yourself writing «I think Python projects would want X» — stop. Wait until you have a real Python project applying the kit, then extract X from the working solution.

---

## What you can add without trigger

| Type | Requirements |
|---|---|
| Doc-polish fixes (typos, stale examples, broken links) | Send PR. No trigger needed. |
| Anti-cycling markers (closing already-decided invariants in core) | Send PR с clear «closes round-N finding» reference. |
| Smoke test cases (more regression coverage) | Send PR. Verify all tests pass: `bash tests/run-smoke.sh`. |
| Bug fixes в scripts (functional regressions caught by tests) | Send PR with failing test → fix → green test. |

## What you can add only with real-project trigger

| Type | Trigger | Example |
|---|---|---|
| **New overlay** | First real project on that stack applies kit and reveals concrete patterns | `typescript-node-cli` extracted from loom after gap was identified by Claude Code on loom |
| **New universal script** | Existing project needs gate that's missing from kit; writes a custom implementation; pattern is generalizable across stacks | `dep-cruiser-baseline.cjs` extracted from loom's custom wrapper |
| **New bootstrap step** | Concrete missing step is discovered during real bootstrap on a project | §5.3a prettier mass-normalize discovered during loom brownfield |
| **New `core/details/` section** | Real project hits a discipline gap not covered in core | None yet (all 9 details extracted из the NestJS host from day-1) |

## What you cannot add (anti-patterns)

| Anti-pattern | Why |
|---|---|
| Imagined overlay для стека you haven't applied kit to | Patterns extracted from imagination drift from real-world usage. Wait for real project. |
| Generic «best practices» doc | Kit is machine-checkable invariants, not opinion essays. If it's not a gate or a contract, it doesn't belong here. |
| Multi-tool comparisons («Claude vs Copilot») | Operator profile is by-design hardcoded. See README. |
| Tool-agnostic core abstraction | Premature abstraction. See `UNIVERSAL_CORE.md` header anti-cycling note. |
| Escape hatch для cleanup-on-touch | Rejected by design. See §4.3. |
| Adapter scripts for linters you haven't actually used | Wait for the real project that uses Ruff/golangci-lint/Clippy. |

---

## Extraction loop (the only valid path for new content)

```
   Real project applies kit
            │
            ▼
   LLM (or human) identifies gap
            │
            ▼
   Builds custom solution
   on real codebase
            │
            ▼
   Solution works на real
   problem (smoke test or
   feature ships green)
            │
            ▼
   Extract: pattern из
   real-code → kit template
            │
            ▼
   Generalize minimally:
   strip project-specific
   identifiers, keep contract
            │
            ▼
   Add to kit + tests +
   docs + BACKLOG entry
   describing extraction
```

**At every step, the source of truth is the real project.** If extracted version diverges from real-project usage, real-project version wins, kit version is wrong.

---

## How to add a new overlay

1. **Trigger:** real project на новом стеке (Python/Go/Rust/whatever) applied kit и reveals patterns.

2. **Inspect the real project:**
   - `package.json` / `pyproject.toml` / `go.mod` / `Cargo.toml` — stack identification
   - `tsconfig` / equivalent — strictness baseline
   - Test config — runner, fixtures, mocks
   - Build / dev scripts — entrypoints, hot-reload
   - CI workflow — actual gates running
   - Module layout — kind-based DAG mapping
   - Subprocess / I/O / state patterns — anything stack-idiomatic

3. **Use existing overlay as structural template** (`typescript-nestjs.md` or `typescript-node-cli.md`):
   - Sections that apply universally (DAG, cognitive thresholds, ralphex, anti-patterns) → keep structure, adapt content
   - Sections that don't apply (e.g. NestJS DI in a CLI overlay) → drop entirely
   - New stack-specific sections → add at end before anti-patterns

4. **Verify against real code:** every concrete example в overlay должен exist в real project. Don't write «Python overlay would use pytest fixtures like this» — quote the real fixture file.

5. **Add to BACKLOG.md** with extraction source: `extracted из <project> (commit SHA, date)`.

6. **Update UNIVERSAL_CORE.md** kit structure listing + `BACKLOG.md` overlay status table.

7. **Sync into all known consumer projects** (the NestJS host, loom, new project).

---

## How to add a new universal script

1. **Trigger:** real project писал custom script, который filling missing gate gap from kit.

2. **Generalize from real implementation:**
   - Replace project-specific paths with configurable `--src` / env vars
   - Replace project-specific config locations with conventions (e.g. `.<name>-baseline.json`)
   - Use canonical identity model `<file>:<rule>:<target>` (or document why not)
   - Add `module.exports` + `if (require.main === module)` guard для testability
   - Add `--ci` / `--update` / `--report` mode trio (matches other scripts)

3. **Extension:**
   - Use `.cjs` extension (explicit CommonJS, works in CJS+ESM hosts)

4. **Add unit tests** to `tests/identity-stability.test.cjs` или новый dedicated test file:
   - Identity model assertions
   - Legacy format normalization (если baseline involved)
   - Edge cases (empty input, missing config, etc.)

5. **Add to `scripts/README.md`** with adapter contract / dependencies / exit codes.

6. **Update `UNIVERSAL_CORE.md`** kit structure listing (file count + script name list).

---

## How to add a new bootstrap step

Almost never needed — 13 steps are stable. But if you discover a real gap (loom did with prettier mass-normalize):

1. Add as sub-step (e.g. §5.3a) instead of renumbering everything
2. Document the trigger (greenfield-only? brownfield-only? both?)
3. Quote the real project where it was needed
4. Anti-pattern note (when NOT to apply)

---

## Pre-PR checklist

- [ ] `bash tests/run-smoke.sh` — all green (currently 31/31)
- [ ] New scripts pass `node --check scripts/<name>.cjs`
- [ ] All `<file>:<rule>` references use canonical v1.1.1 identity
- [ ] No new `.js` files for kit-internal CommonJS (must be `.cjs`)
- [ ] Real-project source for new overlay/script/step cited
- [ ] BACKLOG.md updated с finding source
- [ ] CHANGELOG.md updated с iteration entry
- [ ] No reopening of by-design invariants (see README "Core invariants")

---

## Code style for scripts

Match existing scripts:

- Node ≥18 built-ins only (no external runtime deps)
- CommonJS (`.cjs` extension)
- Top of file: shebang `#!/usr/bin/env node` + multiline JSDoc with usage / exit codes / origin
- ESM imports не использовать (kit scripts ARE CommonJS by design — see CHANGELOG v1.2.1)
- Single-file scripts where possible (no internal modules)
- `module.exports = { fn1, fn2, ... }` + `if (require.main === module) main()` pattern
- Explicit exit codes: 0 pass, 1 violation, 2 internal error
- Adapter-friendly: structured target field for boundary rules (see scripts/README.md "Identity contract")

---

## Sync flow для maintainers

Kit lives in three places. Source-of-truth question:

```
github.com/g-agent-lab/llm-kit           ← canonical (this repo)
                ↑
                │ updates flow here from any consumer
                │
   ┌────────────┴────────────┐
   │                         │
   ▼                         ▼
internal NestJS platform                  loom
docs/llm-kit/         external/llm-kit (submodule)
```

**Recommended flow:**
1. Edit in any consumer project where it's natural (the NestJS host for backend patterns, loom for CLI)
2. After validation в consumer, copy/sync changes back into this canonical repo
3. Commit + tag here
4. Other consumers update via `git submodule update --remote` (или re-copy если используют copy pattern)

---

## Versioning

See `CHANGELOG.md` "Version naming convention" section.

---

## Questions

Open an issue in this repo. Or test the kit on a real project — that's the highest-quality feedback. Theoretical review hits a ceiling fast.
