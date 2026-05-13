#!/usr/bin/env node
/**
 * Architecture diff guard — runs linter on files changed vs base ref, then:
 *   1. Fails if NEW architecture violation IDENTITIES are introduced (boundary + cross-module imports).
 *   2. Fails if a file with baselined violations is touched and its violation IDENTITY SET is not
 *      strictly reduced (cleanup-on-touch enforcement per UNIVERSAL_CORE §4.3).
 *
 * Identity-based comparison (not counts): a violation is the tuple (file, rule, location-or-target).
 * Fixing one violation and introducing another → both identity sets diff → FAIL even if total count equal.
 *
 * Covers BOTH baselines:
 *   - .boundary-baseline.json — linter-detected boundary violations
 *   - .cross-module-import-baseline.json — regex-detected `../other-module/*` imports
 *
 * Usage:
 *   node scripts/architecture-diff-guard.js                    # default base ref from CONFIG
 *   node scripts/architecture-diff-guard.js --base origin/main # override base ref
 *   node scripts/architecture-diff-guard.js --report           # report without fail
 *
 * Exit codes:
 *   0 — pass (no new identities, cleanup-on-touch satisfied)
 *   1 — fail (new violations OR cleanup-on-touch violated)
 *   2 — internal error
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─── CONFIG (adjust per project) ─────────────────────────────────────────
const DEFAULT_BASE_REF = process.env.ARCH_DIFF_BASE_REF || 'origin/main';
const LINTER_CMD = process.env.ARCH_DIFF_LINTER_CMD || 'npx eslint --format json --no-fix';
const FILE_EXTENSIONS = /\.(ts|tsx|js|jsx)$/;             // adapt per stack
const BOUNDARY_BASELINE = path.join(process.cwd(), '.boundary-baseline.json');
const IMPORT_BASELINE = path.join(process.cwd(), '.cross-module-import-baseline.json');
const SRC_DIR = path.join(process.cwd(), process.env.ARCH_DIFF_SRC_DIR || 'src'); // root of modules tree

// Composition roots: files directly under SRC_DIR allowed to use cross-module relative imports.
// Keep small — only entry points / aggregate composition shells.
const COMPOSITION_ROOT_ALLOWLIST = new Set(['app.module.ts', 'main.ts']);

// Boundary rule IDs in linter output (ESLint default; adapt for other linters)
const BOUNDARY_RULES = new Set([
  'boundaries/element-types',
  'boundaries/no-private',
  'no-restricted-imports',
  'import/no-restricted-paths',
]);

// Relative import regex (universal). We narrow to cross-module via resolver below.
const IMPORT_RE = /(?:import\s[^'"]*from\s|require\s*\()?\s*['"](\.\.[\\/][^'"]*)['"]/g;

// ─── ARGS ────────────────────────────────────────────────────────────────
const BASE_REF = (() => {
  const idx = process.argv.indexOf('--base');
  return idx !== -1 ? process.argv[idx + 1] : DEFAULT_BASE_REF;
})();
const REPORT = process.argv.includes('--report');

// ─── HELPERS ─────────────────────────────────────────────────────────────
function getChangedFiles() {
  try {
    const diff = execSync(`git diff --name-only ${BASE_REF}...HEAD`, { encoding: 'utf8' });
    return diff
      .split('\n')
      .filter(Boolean)
      .filter((f) => FILE_EXTENSIONS.test(f))
      .filter((f) => fs.existsSync(f));
  } catch (err) {
    console.error(`Error: cannot get diff against ${BASE_REF}. Is the ref correct?`);
    console.error(err.message);
    process.exit(2);
  }
}

function runLinterOnFiles(files) {
  if (files.length === 0) return [];
  try {
    const args = files.map((f) => JSON.stringify(f)).join(' ');
    const out = execSync(`${LINTER_CMD} ${args}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return JSON.parse(out);
  } catch (err) {
    if (err.stdout) {
      try {
        return JSON.parse(err.stdout);
      } catch {
        // fall through
      }
    }
    console.error('Error: linter failed and no JSON output.');
    console.error(err.message);
    process.exit(2);
  }
}

function loadJsonOrEmpty(p) {
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return [];
  }
}

// ─── IDENTITY MODEL (v1.1.1, canonical across all 3 template scripts) ────
// Identity format: "<file>:<rule>:<target>" — STABLE under line shifts.
//
// For boundary: <rule> = ESLint rule id (e.g. 'no-restricted-imports'),
//               <target> = adapter-provided msg.target → first quoted string → ruleId fallback
// For cross-module imports: <rule> = literal 'cross-module-import',
//               <target> = import path (e.g. '../other-module/x')
//
// Why no <line>: line-included identity creates false positives. If LLM inserts an
// import block at the top of a file, all existing violations shift down N lines and
// are seen as "new", blocking the diff with phantom violations.
//
// Collision risk: two genuinely distinct violations of the same rule with the same
// target in the same file collapse to one identity. This is acceptable — semantically
// they ARE the same architectural violation; the second occurrence isn't independently
// meaningful for diff-guard purposes.
//
// Baseline migration (legacy → canonical) is automatic at read time. See
// `normalizeBoundaryBaselineEntry` / `normalizeImportBaselineEntry` below.
// Run baseline --update after upgrade to rewrite files in canonical format.

function boundaryViolationsFromLinter(linterOutput, fileFilter = null) {
  const violations = [];
  for (const result of linterOutput) {
    const file = path.relative(process.cwd(), result.filePath);
    if (fileFilter && !fileFilter.has(file)) continue;
    for (const msg of result.messages || []) {
      if (!BOUNDARY_RULES.has(msg.ruleId)) continue;
      const target = extractImportTarget(msg) || msg.ruleId;
      violations.push({
        file,
        line: msg.line,  // retained for reporting only, NOT in identity
        rule: msg.ruleId,
        target,
        identity: `${file}:${msg.ruleId}:${target}`,
      });
    }
  }
  return violations;
}

function extractImportTarget(msg) {
  // Adapter contract (scripts/README.md): adapters SHOULD set explicit `msg.target`
  // for boundary / public-API rules. Prefer it. Fall back to first quoted string in message
  // only for native ESLint output where target wasn't set.
  //
  // Risk: ESLint messages with multiple quoted strings (e.g. `"Cannot import 'foo' (use '@/foo/public')"`)
  // pick `foo` as target rather than the suggestion. The target field MUST be provided
  // by adapter for non-ambiguous identity. Without `msg.target`, we MAY produce wrong
  // identity for adversarial messages — fail-safe choice is to use a stable structural
  // form rather than raw message parsing.
  if (typeof msg.target === 'string' && msg.target) return msg.target;

  if (typeof msg.message === 'string') {
    const m = msg.message.match(/['"]([^'"]+)['"]/);
    if (m) return m[1];
  }
  return null;
}

// ─── Cross-module import detection (reuses logic from check-cross-module-relative-imports.js) ──

function getModuleName(filePath) {
  // Module name = first directory segment under SRC_DIR.
  // Returns null if file is at SRC_DIR root or outside SRC_DIR.
  const absPath = path.resolve(filePath);
  const rel = path.relative(SRC_DIR, absPath);
  if (rel.startsWith('..') || rel === '') return null;
  const parts = rel.split(path.sep);
  return parts.length > 1 ? parts[0] : null;
}

function resolveRelativeImport(filePath, importPath) {
  const importDir = path.dirname(path.resolve(filePath));
  return path.resolve(importDir, importPath);
}

function isCrossModuleImport(filePath, importPath) {
  const fileModule = getModuleName(filePath);

  // File outside SRC_DIR or at SRC_DIR root (e.g. main.ts, app.module.ts composition shells)
  // → no module concept, no cross-module possible. The COMPOSITION_ROOT_ALLOWLIST is informational;
  // SRC_DIR-root files are already exempted because fileModule is null.
  if (!fileModule) return false;

  const resolvedImport = resolveRelativeImport(filePath, importPath);
  const resolvedModule = getModuleName(resolvedImport);

  if (!resolvedModule) return false; // import resolves outside any module
  return fileModule !== resolvedModule;
}

function crossModuleImportsForFiles(files) {
  // Only flag relative imports that ACTUALLY cross module boundaries.
  // Intra-module relative imports (e.g. `./internal/foo`, `../dto/bar` within same module) → not flagged.
  const violations = [];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      const re = new RegExp(IMPORT_RE.source, 'g');
      let m;
      while ((m = re.exec(line)) !== null) {
        const importPath = m[1];
        if (!importPath.startsWith('..')) continue; // intra-dir, never cross-module
        if (!isCrossModuleImport(file, importPath)) continue; // resolves to same module
        violations.push({
          file,
          line: idx + 1,  // retained for reporting only, NOT in identity
          rule: 'cross-module-import',
          target: importPath,
          identity: `${file}:cross-module-import:${importPath}`,
        });
      }
    });
  }
  return violations;
}

// Two distinct normalize functions because boundary and cross-module baselines have
// different historical formats and different canonical identities. A single generic
// normalizer cannot disambiguate v1.1-brief cross-module ("<file>:<importPath>") from
// v1.0 boundary-without-target ("<file>:<rule>") — they have the same 2-segment shape.

function normalizeBoundaryBaselineEntry(entry) {
  // Canonical (v1.1.1): "<file>:<rule>:<target>"
  // Legacy v1.0:        "<file>:<line>:<rule>:<target>"        → strip line
  // Legacy v1.0 no-tgt: "<file>:<line>:<rule>"                  → strip line, fallback target to rule
  if (typeof entry !== 'string') return entry;
  const segs = entry.split(':');
  if (segs.length >= 3 && /^\d+$/.test(segs[1])) {
    const stripped = [segs[0], ...segs.slice(2)];
    if (stripped.length === 2) {
      return `${stripped[0]}:${stripped[1]}:${stripped[1]}`;
    }
    return stripped.join(':');
  }
  if (segs.length === 2) {
    return `${segs[0]}:${segs[1]}:${segs[1]}`;
  }
  return entry;
}

function normalizeImportBaselineEntry(entry) {
  // Canonical (v1.1.1): "<file>:cross-module-import:<importPath>"
  // v1.1 brief:         "<file>:<importPath>"                          → prepend rule segment
  // Legacy v1.0:        "<file>:<line>:<importPath>"                    → strip line, prepend rule
  // Legacy v1.0 alt:    "<file>:<line>:cross-module-import:<importPath>" → strip line (rule already present)
  if (typeof entry !== 'string') return entry;
  if (entry.includes(':cross-module-import:')) {
    // Already has rule segment. Strip line if present.
    const segs = entry.split(':');
    if (segs.length >= 4 && /^\d+$/.test(segs[1])) {
      return [segs[0], ...segs.slice(2)].join(':');
    }
    return entry;
  }
  const segs = entry.split(':');
  if (segs.length >= 3 && /^\d+$/.test(segs[1])) {
    const stripped = [segs[0], ...segs.slice(2)];
    return `${stripped[0]}:cross-module-import:${stripped.slice(1).join(':')}`;
  }
  if (segs.length >= 2) {
    return `${segs[0]}:cross-module-import:${segs.slice(1).join(':')}`;
  }
  return entry;
}

// Back-compat alias for older callers (defaults to boundary semantics — broader pattern).
function normalizeBaselineEntry(entry) {
  return normalizeBoundaryBaselineEntry(entry);
}

function baselineIdentitiesForFile(baseline, file, kind = 'boundary') {
  // Match baseline entries that belong to this file. Normalize legacy entries to
  // canonical v1.1.1 identity so matching works after code shifts and across format
  // versions. `kind` selects normalization (boundary vs cross-module import) because
  // the two baselines have different historical shapes.
  const normalize = kind === 'import' ? normalizeImportBaselineEntry : normalizeBoundaryBaselineEntry;
  const normalized = baseline
    .filter((entry) => typeof entry === 'string' && entry.startsWith(`${file}:`))
    .map(normalize);
  return new Set(normalized);
}

// ─── CORE CHECK ──────────────────────────────────────────────────────────
function check() {
  const changedFiles = getChangedFiles();
  if (changedFiles.length === 0) {
    console.log('✓ No source files changed vs base ref.');
    return { newViolations: [], cleanupViolations: [] };
  }

  console.log(`Checking ${changedFiles.length} changed files vs ${BASE_REF}...`);
  const linterOutput = runLinterOnFiles(changedFiles);
  const changedSet = new Set(changedFiles);

  const currentBoundary = boundaryViolationsFromLinter(linterOutput, changedSet);
  const currentImports = crossModuleImportsForFiles(changedFiles);
  const currentByFile = new Map();
  for (const v of [...currentBoundary, ...currentImports]) {
    if (!currentByFile.has(v.file)) currentByFile.set(v.file, new Set());
    currentByFile.get(v.file).add(v.identity);
  }

  const boundaryBaseline = loadJsonOrEmpty(BOUNDARY_BASELINE);
  const importBaseline = loadJsonOrEmpty(IMPORT_BASELINE);

  const newViolations = [];
  const cleanupViolations = [];

  for (const file of changedFiles) {
    const currentIds = currentByFile.get(file) || new Set();
    const baselineBoundaryIds = baselineIdentitiesForFile(boundaryBaseline, file, 'boundary');
    const baselineImportIds = baselineIdentitiesForFile(importBaseline, file, 'import');
    const baselineAllIds = new Set([...baselineBoundaryIds, ...baselineImportIds]);

    if (baselineAllIds.size === 0) {
      // File not in any baseline → any current violation is NEW.
      for (const id of currentIds) {
        newViolations.push({ file, identity: id });
      }
    } else {
      // File HAS baselined violations. Cleanup-on-touch:
      //  - Any identity in current that is NOT in baseline → NEW (always fails)
      //  - currentIds must be a STRICT SUBSET of baselineAllIds (size < baseline) → reduction
      const truelyNew = [...currentIds].filter((id) => !baselineAllIds.has(id));
      for (const id of truelyNew) {
        newViolations.push({ file, identity: id });
      }
      // Check reduction (strict subset, size < baseline size, AND no new identities)
      const survivingBaselineIds = [...currentIds].filter((id) => baselineAllIds.has(id));
      if (truelyNew.length === 0 && survivingBaselineIds.length >= baselineAllIds.size) {
        // No new identities, but no reduction either → cleanup-on-touch failure.
        cleanupViolations.push({
          file,
          currentInBaseline: survivingBaselineIds.length,
          baselineSize: baselineAllIds.size,
        });
      }
    }
  }

  return { newViolations, cleanupViolations };
}

// ─── MAIN ────────────────────────────────────────────────────────────────
function main() {
  const { newViolations, cleanupViolations } = check();

  if (newViolations.length === 0 && cleanupViolations.length === 0) {
    console.log('✓ Architecture diff guard: clean.');
    process.exit(0);
  }

  if (newViolations.length > 0) {
    console.error(`\n✗ ${newViolations.length} NEW architecture violation identities:`);
    for (const v of newViolations) {
      console.error(`  ${v.identity}`);
    }
  }

  if (cleanupViolations.length > 0) {
    console.error(`\n✗ ${cleanupViolations.length} cleanup-on-touch violations`);
    console.error(`  (touched files where baseline violation count is NOT strictly reduced):`);
    for (const v of cleanupViolations) {
      console.error(`  ${v.file}: ${v.currentInBaseline} of ${v.baselineSize} baselined violations still present`);
    }
    console.error(`\nPer UNIVERSAL_CORE §4.3 (cleanup-on-touch):`);
    console.error(`  When touching a baselined file, you must REDUCE at least one violation identity`);
    console.error(`  AND not introduce any new violation identities (no swap-one-for-another).`);
    console.error(`  After fixing, run the baseline update script and commit fix + baseline together.`);
  }

  process.exit(REPORT ? 0 : 1);
}

module.exports = {
  boundaryViolationsFromLinter,
  crossModuleImportsForFiles,
  baselineIdentitiesForFile,
  normalizeBoundaryBaselineEntry,
  normalizeImportBaselineEntry,
  normalizeBaselineEntry,  // deprecated alias — defaults to boundary semantics
  isCrossModuleImport,
  extractImportTarget,
};

if (require.main === module) main();
