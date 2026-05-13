#!/usr/bin/env node
/**
 * Cross-module relative import checker.
 *
 * Scans source files and reports relative imports that cross module boundaries.
 * Intra-module relative imports are allowed.
 * Composition-root files are on an allowlist (config below).
 *
 * Usage:
 *   node scripts/check-cross-module-relative-imports.js              # report mode (exit 1 on any violation)
 *   node scripts/check-cross-module-relative-imports.js --report     # list violations, no exit code
 *   node scripts/check-cross-module-relative-imports.js --ci         # CI mode: compare against baseline, exit 1 on NEW only
 *   node scripts/check-cross-module-relative-imports.js --update     # regenerate baseline
 *
 * Exit code 1 when new violations are found (default or --ci mode).
 */

const fs = require('fs');
const path = require('path');

// ─── CONFIG (adjust per project) ──────────────────────────────────────────
const SRC_DIR = path.join(process.cwd(), 'src');           // or 'api/src', 'app', etc.
const BASELINE_PATH = path.join(process.cwd(), '.cross-module-import-baseline.json');
const FILE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];     // adapt per stack (e.g. ['.py'] for Python)
const COMPOSITION_ROOT_ALLOWLIST = ['app.module.ts', 'main.ts'];  // composition shells where cross-module is OK

// Regex for relative import patterns. Adapt for non-JS/TS stacks.
//   import X from '../other-module/...'
//   from '../other-module/...'
//   require('../other-module/...')
const IMPORT_RE = /(?:^|\s)(?:import\s[^'"]*from\s|require\s*\()?\s*['"](\.\.[\\/][^'"]*)['"]/g;

// ─── ARGS ────────────────────────────────────────────────────────────────
const REPORT_MODE = process.argv.includes('--report');
const CI_MODE = process.argv.includes('--ci');
const UPDATE = process.argv.includes('--update') || process.argv.includes('--update-baseline');

// ─── HELPERS ─────────────────────────────────────────────────────────────
function walkSync(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      walkSync(full, files);
    } else if (entry.isFile() && FILE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      files.push(full);
    }
  }
  return files;
}

function getModuleName(filePath) {
  // Module name = first directory under SRC_DIR.
  // e.g. SRC_DIR/foo/bar/baz.ts → module 'foo'
  const rel = path.relative(SRC_DIR, filePath);
  const parts = rel.split(path.sep);
  return parts.length > 1 ? parts[0] : null;
}

function resolveRelativeImport(filePath, importPath) {
  const importDir = path.dirname(filePath);
  const resolved = path.resolve(importDir, importPath);
  return resolved;
}

function isCrossModule(filePath, importPath) {
  // Composition roots are exempt.
  const fileName = path.basename(filePath);
  if (COMPOSITION_ROOT_ALLOWLIST.includes(fileName)) {
    const fileModule = getModuleName(filePath);
    if (!fileModule) return false; // directly under src/, fully exempt
  }

  const fileModule = getModuleName(filePath);
  if (!fileModule) return false; // file is at src/ root, not in any module

  const resolvedImport = resolveRelativeImport(filePath, importPath);
  const resolvedModule = getModuleName(resolvedImport);

  if (!resolvedModule) return false; // import resolves to src/ root
  return fileModule !== resolvedModule;
}

function findViolations() {
  const violations = [];
  const files = walkSync(SRC_DIR);

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      let match;
      const lineRe = new RegExp(IMPORT_RE.source, 'g');
      while ((match = lineRe.exec(line)) !== null) {
        const importPath = match[1];
        if (isCrossModule(file, importPath)) {
          violations.push({
            file: path.relative(process.cwd(), file),
            line: idx + 1,
            import: importPath,
          });
        }
      }
    });
  }
  return violations;
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  } catch {
    return [];
  }
}

// ─── IDENTITY MODEL (v1.1.1, line-stable, canonical) ────────────────────
// Canonical identity: "<file>:cross-module-import:<importPath>"
// This is the SAME format used by `architecture-diff-guard.js` for cross-module
// imports, so `.cross-module-import-baseline.json` written here is read consistently
// by both scripts.
//
// Why the `cross-module-import:` middle segment: it matches the canonical
// `<file>:<rule>:<target>` shape shared with `boundary-check.js` (where `<rule>` is
// the ESLint rule id). Cross-module is also a "rule" — its id is the literal string.
//
// Why no `<line>` in identity: inserting code above an existing violation does not
// change identity. Closes Codex round-5 finding (phantom-new violations after shift).
//
// Collision: two identical relative imports of the same target in the same file
// collapse to one identity. Acceptable — semantically same architectural violation.
//
// Legacy baseline normalization at read time:
//   v1.0:        "<file>:<line>:<importPath>"                    → strip line, prepend rule
//   v1.1 (brief): "<file>:<importPath>"                          → prepend rule
//   v1.1.1:      "<file>:cross-module-import:<importPath>"        → unchanged

const RULE_ID = 'cross-module-import';

function identityFor(v) {
  return `${v.file}:${RULE_ID}:${v.import}`;
}

function normalizeBaselineEntry(entry) {
  if (typeof entry !== 'string') return entry;
  // Already canonical?
  if (entry.includes(`:${RULE_ID}:`)) return entry;

  const segs = entry.split(':');
  // Legacy v1.0: "<file>:<line>:<importPath>"
  if (segs.length >= 3 && /^\d+$/.test(segs[1])) {
    const stripped = [segs[0], ...segs.slice(2)];
    // stripped is now <file>:<importPath> — wrap with rule segment.
    return `${stripped[0]}:${RULE_ID}:${stripped.slice(1).join(':')}`;
  }
  // v1.1 brief format: "<file>:<importPath>" (2+ segs, no numeric, no rule segment)
  if (segs.length >= 2) {
    return `${segs[0]}:${RULE_ID}:${segs.slice(1).join(':')}`;
  }
  return entry;
}

function saveBaseline(violations) {
  const seen = new Set();
  const baseline = [];
  for (const v of violations) {
    const id = identityFor(v);
    if (seen.has(id)) continue;
    seen.add(id);
    baseline.push(id);
  }
  baseline.sort();
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
}

function diffNewViolations(current, baseline) {
  const baselineSet = new Set(baseline.map(normalizeBaselineEntry));
  return current.filter((v) => !baselineSet.has(identityFor(v)));
}

// ─── MAIN ────────────────────────────────────────────────────────────────
function main() {
  const violations = findViolations();

  if (UPDATE) {
    saveBaseline(violations);
    console.log(`Baseline updated: ${violations.length} violations.`);
    process.exit(0);
  }

  if (CI_MODE) {
    const baseline = loadBaseline();
    const newViolations = diffNewViolations(violations, baseline);
    if (newViolations.length === 0) {
      console.log(`✓ No new cross-module imports (baseline: ${baseline.length}).`);
      process.exit(0);
    }
    console.error(`✗ ${newViolations.length} new cross-module imports:\n`);
    for (const v of newViolations) {
      console.error(`  ${v.file}:${v.line}: '${v.import}'`);
    }
    process.exit(1);
  }

  // Default mode or --report
  if (violations.length === 0) {
    console.log('✓ No cross-module relative imports.');
    process.exit(0);
  }

  console.log(`${violations.length} cross-module relative imports:\n`);
  for (const v of violations) {
    console.log(`  ${v.file}:${v.line}: '${v.import}'`);
  }
  process.exit(REPORT_MODE ? 0 : 1);
}

module.exports = {
  identityFor,
  normalizeBaselineEntry,
  diffNewViolations,
  isCrossModule,
  getModuleName,
  findViolations,
  loadBaseline,
  saveBaseline,
};

if (require.main === module) main();
