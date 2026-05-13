# Changelog

All notable changes to LLM Discipline Kit. Format: [version](commit-ish) — date — summary, then per-section bullets.

---

## [v1.3] — 2026-05-13 — First successful brownfield bootstrap (loom) + 6th universal script

**Milestone:** first time a complete brownfield bootstrap was applied on a project not owned by kit authors. Validation backlog item "Real-world brownfield bootstrap test (legacy не-Portiqa)" → **Done**.

### Added
- **`bootstrap/templates/scripts/dep-cruiser-baseline.cjs`** (6th universal script, 111 LOC) — extracted from loom's custom wrapper. dependency-cruiser has no native baseline mechanic; this provides one with canonical identity `<file>:<rule>:<target>`. Module-level rules use file as target; dependency-level rules use resolved import path. `--update` / `--report` / CI modes. Tested: 5 unit cases.
- **§5.3a in `bootstrap/brownfield.md`** — "Stylistic drift normalization (pragmatic, one-shot)". On legacy codebases with prettier drift, one-shot `prettier --write` before baseline freeze is allowed. Validated on loom: 75 files normalized, 0 tests broken. Brownfield-only — not applicable to greenfield where drift doesn't accumulate.
- BACKLOG.md sections: real-world findings from loom brownfield (5 entries — dep-cruiser gap, prettier drift, plugin-boundaries v6 syntax, submodule pattern, validated artifacts).

### Validated invariants on loom
- 5-layer DAG applies to CLI (shared/util-config-migrations, infra/tools, domain/case-evidence, orchestration/orchestrator-repl-cli, adapter/voices)
- 3 forbidden directions enforced via dep-cruiser rules
- Baseline mechanic scales: 194 cross-module + 12 dep-cruiser + 0 boundary
- No-escape-hatch invariant held — cleanup-on-touch accepted without user push-back
- Operator-profile by-design held — loom apply did not reopen it
- CLAUDE.md compact: 64 lines (≤100 limit)
- 6 skills + 3 hooks + memory installable in one step

### Deferred (tracked in loom roadmap)
- ESLint plugin-boundaries v6 selector-syntax → proper boundary baseline (loom uses `0` pending migration)
- Step 13 first ralphex iteration end-to-end (feature-run validation, not bootstrap)

### Stats
- 31 smoke tests pass (was 26 in v1.2.1) — +5 for dep-cruiser-baseline
- 38 files, ~8.2K LOC

---

## [v1.2.1] — 2026-05-13 — ESM compat fix (.js → .cjs)

**Real-world finding** during loom kit sync: host projects with `"type": "module"` in package.json treat `.js` files as ESM, which broke `require()` calls in kit scripts and tests. Smoke harness in Portiqa (CommonJS-default host) didn't catch this — the bug only surfaced on ESM-default host.

### Changed
- Renamed all kit-internal CommonJS files: `.js` → `.cjs`
  - 5 template scripts (boundary-check, check-cross-module-relative-imports, architecture-diff-guard, arch-report, docs-lint)
  - 2 test files (identity-stability, cross-module-detection)
- `tests/run-smoke.sh` glob: `*.test.js` → `*.test.cjs`
- `require()` paths inside tests updated
- `scripts/README.md` contract + npm script examples + adapter examples updated
- Both overlays' npm scripts examples use `.cjs`
- `UNIVERSAL_CORE.md` kit structure listing updated
- `bootstrap/brownfield.md` script reference updated

### Preserved
- Test fixture content inside temp dirs (service.js, consumer.js) intentionally remains `.js` — these simulate application code in sandboxed temp projects, not kit infrastructure.

### Verified
- Smoke 26/26 passes in both host modes (CommonJS-default + ESM-default)

### Lesson
This is exactly the kind of bug that 7 rounds of Codex review could not predict. First ESM-host sync caught it in 30 seconds. Validates the thesis: theoretical review hits a ceiling; real-world application surfaces dependencies and assumptions the kit didn't know it had.

---

## [v1.2] — 2026-05-13 — Second overlay (typescript-node-cli) from loom

**Milestone:** first time an overlay was extracted from a real non-Portiqa project. Closes Codex round-5 finding #3 ("Universal = TS/Nest-first") partially — kit is no longer TS/Nest-only.

### Added
- **`overlays/typescript-node-cli.md`** (709 LOC, 22 sections) — extracted from loom (personal CLI orchestrator):
  - ESM Node 22 with `.js` extension imports, `node:` prefix, `import.meta.url` for `__dirname`
  - tsconfig strict baseline + extras (noUncheckedIndexedAccess, exactOptionalPropertyTypes)
  - commander CLI parsing with explicit exit codes (0/1/2/130/143)
  - execa subprocess patterns (shell:false, reject:false, AbortController)
  - write-file-atomic + lockfile + schemaVersion-stamped state migrations
  - Signal handling with idempotent cleanup (process.on, NOT once), POSIX exit codes
  - Vitest 2.x with `pool: "forks"`, tmpdir-per-test fixtures, vi.mock differences vs Jest
  - Cross-module imports trade-off (loom: relative; kit baseline: `@/` aliases for >10 modules)
  - ESLint optional (loom uses Prettier + tsc strict only; overlay provides minimal flat config as recommendation)
  - Native helpers via postinstall (Go probe pattern, soft-fail without toolchain)
  - Anti-patterns table (sync fs in hot path, process.exit in libraries, require() in ESM, etc.)
- BACKLOG.md "Real-world findings — loom" section (overlay gap, relative imports trade-off, no-ESLint observation).

### Confirmed
- Overlay-extraction loop works: LLM on foreign project identifies missing overlay → kit extracts production-validated patterns, not imagination
- Anti-cycling markers (operator profile, no escape hatch) held — loom apply did not reopen them
- Sample size now 2 (was 1) — generalize judiciously, but TS+Node ecosystem coverage complete (backend + CLI)

---

## [v1.1.1] — 2026-05-13 — Canonical identity across all 3 scripts (Codex round-6)

Round-6 Codex review found that v1.1 closed the identity finding incompletely. Round-6 fully closes it.

### Fixed
- **`boundary-check.js` was still line-based** (`<file>:<line>:<rule>`). Migrated to canonical `<file>:<rule>:<target>` with `extractTarget()` priority chain (msg.target → first quoted message string → ruleId fallback). `normalizeBaselineEntry` handles v1.0 4-seg (`<file>:<line>:<rule>:<target>`) and 3-seg-no-target legacy (fallback target to rule). Added `module.exports` + `if (require.main === module)` guard.
- **`scripts/README.md` documented old line-included identity contract** — dangerous for adapter writers building Ruff/Go/Clippy adapters. Identity contract section fully rewritten with a 5-row legacy-to-canonical normalization table.
- **Cross-module identity inconsistency between two scripts:** `check-cross-module-relative-imports.js` wrote baseline as `<file>:<importPath>` (v1.1 brief), but `architecture-diff-guard.js` internally used `<file>:cross-module-import:<importPath>` — saved baseline did not match runtime identity. Both scripts now use canonical `<file>:cross-module-import:<importPath>`. `architecture-diff-guard` split into `normalizeBoundaryBaselineEntry` / `normalizeImportBaselineEntry` (one generic function cannot disambiguate the 2-segment shape). `baselineIdentitiesForFile` now takes a `kind` parameter.

### Changed
- Smoke harness expanded from 18 → 33 cases (26 unit + 7 integration), including 3 new regression tests: boundary-check line-shift, v1.1 brief baseline normalization in cross-module checker, module-aware baseline identification in diff-guard.

---

## [v1.1] — 2026-05-13 — Line-stable identity + smoke harness + by-design markers (Codex round-5)

5 Codex round-5 findings:

### Fixed
- **Identity model now line-stable.** Format `<file>:<rule>:<target>` (was `<file>:<line>:<rule>:<target>`). Inserting code above an existing violation no longer triggers phantom-new violations. Legacy v1.0 baselines (with line) auto-normalize at read time via `normalizeBaselineEntry` — no migration required.
- **Smoke-test harness** at `tests/`: 12 unit + 6 integration cases (greenfield clean, default detection, update→ci pass, new violation, line-shift, legacy normalization). Runs in <2s, requires only node, exits non-zero on any failure.

### Rejected by design
- **Cleanup-on-touch escape hatch** — see §4.3 "No escape hatch by design". Any formal escape hatch becomes default; baseline is the only formal amnesty.
- **Operator profile separation** (Gurgen-mode vs universal core) — see header "Operator profile". Claude + ralphex + Codex is a deliberate stack choice, not abstracted away.

### Acknowledged in backlog
- Universal = TS/Nest-first → additional overlays needed (next-react, serverless-worker added to python-fastapi/aiogram/go-stdlib list). Awaiting real projects on these stacks.

### Added
- **`BACKLOG.md`** formalizes future overlays, template-script holds, open question §17 plan-template variations, validation backlog (real-world bootstrap tests), Codex round verdicts table.
- Two by-design markers in core (anti-cycling for future review rounds).

---

## [v1.0] — 2026-05-12 — Initial kit (6 iterations + 4 Codex rounds, 57 findings closed)

First release. Portable kit extracted from Portiqa OS / Clever Agent.

### Structure
- `UNIVERSAL_CORE.md` (~890 LOC, 19 sections, hot-path)
- `core/details/` (9 load-on-demand files: memory, skills, hooks, security, observability, data-migration, mcp, codebase-map, cost-discipline)
- `overlays/typescript-nestjs.md` (~1500 LOC, 23 sections — production-validated)
- `bootstrap/{greenfield,brownfield}.md` (640 + 640 LOC, 13-step playbooks)
- `bootstrap/templates/` (AGENTS.md, DOCS_RULES.md, ralphex-plan-template.md, 3 hooks/*.sh, 8 skills/*/SKILL.md, 5 scripts/*.js)

### Iterations
- **Iteration 1:** initial kit + Codex round-1 closures (5 blockers + 5 majors + 3 minors)
- **Iteration 2:** core split into slim core + `core/details/` (1243→830 LOC, -33%) + 6 overlay sections (Security/Observability/CodebaseMap/DocsLint tooling + CleanupOnTouch FAIL guard)
- **Iteration 3:** 5 universal Node.js scripts + 2 conditional skills (add-bridge-module, transaction-aware-outbox) + universal/stack-specific skills split
- **Iteration 4:** Codex round-2 closures (3 blockers + 10 majors + 4 minors) + new §19 Cost discipline (closes Q3)
- **Iteration 5:** Codex round-3 closures (2 blockers identity-based diff-guard refactor + module-aware cross-module resolver; 10 majors; 2 minors)
- **Iteration 6:** Codex round-4 verdict closures (1 major generic non-literal env bracket detector, 1 major overlay §19 LLM cost discipline heading, 1 minor dead branch removed)

### Codex review totals: 23 round-1 + 17 round-2 + 14 round-3 + 3 round-4 = **57 findings closed**

---

## Version naming convention

`vMAJOR.MINOR.PATCH`:

- **MAJOR** — breaking change to identity model, file layout, or kit application contract. Requires migration on consumer side.
- **MINOR** — new overlay, new script, new bootstrap step, new core section. Backward-compatible.
- **PATCH** — bug fix, documentation sync, anti-cycling marker, internal refactor. Always backward-compatible.

Real-world findings without API impact → PATCH. New stack support → MINOR. Identity-model refactor → MAJOR (would be v2.0).
