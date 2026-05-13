# Templates — Scripts

Universal Node.js (≥18) скрипты для 5 enforcement gates из core §4.2.

**Все скрипты — `.cjs` extension (explicit CommonJS).** Это намеренно: host project может иметь `"type": "module"` в `package.json` (ESM-default), и тогда `.js` файлы treat'ятся как ESM, что ломает `require()`. `.cjs` extension работает в обоих CJS-default и ESM-default проектах.

| Script | Gate # | Purpose |
|---|---|---|
| `check-cross-module-relative-imports.cjs` | 5 | Find `../other-module/*` imports + baseline comparison |
| `boundary-check.cjs` | 3 | Parse linter JSON output → boundary violations + baseline |
| `arch-report.cjs` | (helper) | Prioritized human-readable report from linter JSON |
| `architecture-diff-guard.cjs` | 7 | Diff-scoped guard + cleanup-on-touch FAIL |
| `dep-cruiser-baseline.cjs` | 6 | dependency-cruiser wrapper adding brownfield baseline mechanic (cycles + DAG layering) |
| `docs-lint.cjs` | 8 | Docs consistency checks (model count, env vars, etc.) |

## Contract

Все скрипты:
- **Node.js ≥18 built-ins only** (no external deps unless explicitly stated)
- **`.cjs` extension** — explicit CommonJS, compatible с host projects где `package.json` имеет `"type": "module"`
- **Configurable via constants at top** (paths, source dirs, baseline files)
- **Standard exit codes:** 0 = pass, 1 = new violations / fail
- **Modes via CLI flags:** `--ci` (compare baseline, fail on new), `--update-baseline` (regenerate), `--report` (print without exit code)

## Installation

При greenfield/brownfield bootstrap, LLM copies scripts to project's scripts location (`<project>/scripts/` или эквивалент стека). Затем:

1. Adapt **CONFIG** block at top of каждого script (source dirs, language file extensions, module kinds list)
2. Add npm scripts (или эквивалент package manager) в `package.json`:

```jsonc
{
  "scripts": {
    "lint:imports": "node scripts/check-cross-module-relative-imports.cjs",
    "lint:imports:ci": "node scripts/check-cross-module-relative-imports.cjs --ci",
    "lint:imports:update-baseline": "node scripts/check-cross-module-relative-imports.cjs --update-baseline",
    "lint:boundaries": "<linter-json-output-cmd> | node scripts/boundary-check.cjs",
    "lint:boundaries:update-baseline": "<linter-json-output-cmd> | node scripts/boundary-check.cjs --update",
    "lint:arch": "<linter-json-output-cmd> | node scripts/arch-report.cjs",
    "lint:arch:diff": "node scripts/architecture-diff-guard.cjs",
    "lint:deps": "depcruise --config .dependency-cruiser.cjs src",
    "lint:deps:ci": "node scripts/dep-cruiser-baseline.cjs",
    "lint:deps:update-baseline": "node scripts/dep-cruiser-baseline.cjs --update",
    "lint:docs": "node scripts/docs-lint.cjs"
  }
}
```

3. Initialize baseline files at zero для greenfield, или populate с current violations для brownfield (см. `bootstrap/brownfield.md` Шаг 5).

## Stack adaptation — formal adapter schema

`boundary-check.cjs` / `arch-report.cjs` / `architecture-diff-guard.cjs` принимают **linter output в ESLint JSON shape** на stdin (или через inline command в `architecture-diff-guard.cjs`). Для не-ESLint стеков overlay предоставляет **adapter** который преобразует output стека в эту shape.

### Adapter output schema (mandatory)

```typescript
type LinterOutput = LinterFileResult[];

interface LinterFileResult {
  filePath: string;        // absolute or repo-relative path
  messages: LinterMessage[];
}

interface LinterMessage {
  ruleId: string;          // identifier of the violated rule (e.g. "sonarjs/cognitive-complexity",
                           //   "boundaries/element-types", "max-lines"); MUST be stable
  line: number;            // 1-indexed line number
  column?: number;         // 1-indexed column (optional)
  message: string;         // human-readable description
  target?: string;         // STRUCTURED identity target — MANDATORY for boundary / public-API /
                           //   cross-module rules. Adapter MUST populate this from the linter's
                           //   structured fields (e.g. `import-path`, `module-name`), NOT by
                           //   parsing `message`. See "Identity contract" below.
  category?: string;       // optional grouping (e.g. "complexity", "boundary")
  severity?: 1 | 2;        // 1 = warn, 2 = error; defaults to error if absent
}
```

### Identity contract (v1.1.1, line-stable, canonical across all 3 scripts)

`boundary-check.cjs`, `check-cross-module-relative-imports.cjs`, and `architecture-diff-guard.cjs` share **one** canonical identity format:

```
identity = `${filePath}:${rule}:${target}`
```

**`line` is NOT in identity.** Inserting code above an existing violation does not change its identity — diff-guard does not report phantom-new violations after a code shift. This closes a real failure mode where adding an import block at file top shifted line numbers and falsely flagged all baselined violations as new.

| Rule kind | `rule` | `target` |
|---|---|---|
| Boundary (ESLint output) | `msg.ruleId` (e.g. `no-restricted-imports`) | priority chain below |
| Cross-module relative import | literal `cross-module-import` | the import path (e.g. `../other-module/x`) |

**`target` priority chain (boundary):**
1. **`msg.target`** — adapter-provided, MUST be used for boundary / public-API / cross-module rules
2. First quoted string in `msg.message` — fallback for native ESLint output without explicit target
3. `ruleId` — last-resort fallback (loses target discrimination — only OK for complexity/size rules where target doesn't apply)

**Why `target` is mandatory for boundary rules:**
LLM-friendly identity discrimination requires structurally extracted target. Messages containing multiple quoted strings (e.g. `"Cannot import 'foo' (use '@/foo/public')"`) make fallback parsing pick the wrong target. Adapter authors MUST populate `target` from the linter's typed output, not from message strings.

**Legacy baseline migration (automatic at read time):**

| Format | Example | Auto-normalized to |
|---|---|---|
| v1.0 boundary 4-seg | `src/a.ts:42:no-restricted-imports:../b/x` | `src/a.ts:no-restricted-imports:../b/x` |
| v1.0 boundary 3-seg (no target) | `src/a.ts:42:no-restricted-imports` | `src/a.ts:no-restricted-imports:no-restricted-imports` (target fallback to rule) |
| v1.0 cross-module | `src/a.ts:7:../b/x` | `src/a.ts:cross-module-import:../b/x` |
| v1.1 brief cross-module | `src/a.ts:../b/x` | `src/a.ts:cross-module-import:../b/x` |
| v1.1.1 canonical | `src/a.ts:cross-module-import:../b/x` | (unchanged) |

After upgrade, run `--update` / `--update-baseline` to rewrite the file in canonical format. CI keeps working without migration thanks to read-time normalization.

**Concrete adapter examples (target population):**

| Linter | Source field for `target` |
|---|---|
| **ESLint** `boundaries/element-types` | Plugin metadata: extracted import path |
| **ESLint** `no-restricted-imports` | `data.importSource` (added by rule via reportingContext) |
| **Ruff** `TID252` (banned-imports) | `code.context.import_path` |
| **golangci-lint** `depguard` | `Issue.Pos.Filename` + `Replacement.NewLines[0]` (offending package) |
| **Clippy** structured output | `spans[0].text` matching import target |

**Adapter requirements:**
- `ruleId` MUST be stable (one rule = one ID across runs; not a generated UUID).
- `line` MUST be stable for the same violation (deterministic source position).
- `target` for boundary/public-API/cross-module rules MUST be the structured offending entity (the imported module/path), NOT the suggestion or remediation. Stable across runs.
- If the linter does NOT provide structured target → adapter SHOULD construct it from rule metadata or fail loudly rather than silent message-parsing.

### Reference: ESLint output

ESLint with `--format json` already produces this shape natively. For other linters, write a small adapter in overlay's scripts directory:

| Linter | Adapter approach |
|---|---|
| **Ruff** (Python) | `ruff check --output-format json` → map `code` → `ruleId`, `location.row` → `line`, `message` → `message` |
| **golangci-lint** (Go) | `golangci-lint run --out-format json` → map `Issues[].FromLinter` → `ruleId`, `Issues[].Pos.Line` → `line` |
| **Clippy** (Rust) | `cargo clippy --message-format json` → filter `compiler-message`, map `code.code` → `ruleId` |

Adapter script signature:

```bash
<linter-native-cmd> | node scripts/adapt-<linter>.cjs | node scripts/boundary-check.cjs
```

The adapter script reads stdin, transforms, writes ESLint JSON to stdout.

## Language-agnostic scripts

`check-cross-module-relative-imports.cjs` and `docs-lint.cjs` — **no linter dependency**, work via filesystem + git + regex. Adapt CONFIG block (file extensions, source dirs, regex pattern) per stack.

`dep-cruiser-baseline.cjs` — depends on `dependency-cruiser` npm package (typically devDependency) и `.dependency-cruiser.cjs` config in project root. Stack-agnostic — dep-cruiser supports JS, TS, CommonJS, ESM, Python (3rd-party plugin).
