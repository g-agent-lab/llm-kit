#!/usr/bin/env node
/**
 * Identity stability unit tests (v1.1.1 canonical: `<file>:<rule>:<target>`).
 *
 * Asserts that violation identity is line-stable across all 3 template scripts
 * (boundary-check, check-cross-module-relative-imports, architecture-diff-guard).
 * Inserting code above a violation must not change its identity, so diff-guard
 * does not report phantom-new violations after a code shift. Also asserts that
 * legacy baselines (v1.0 with line, v1.1 brief without rule segment) are normalized
 * at read time to the canonical v1.1.1 shape.
 *
 * Run via tests/run-smoke.sh — exits non-zero on any failure.
 */

const assert = require('node:assert/strict');
const path = require('node:path');

const SCRIPTS = path.resolve(__dirname, '..', 'bootstrap', 'templates', 'scripts');

const arch = require(path.join(SCRIPTS, 'architecture-diff-guard.cjs'));
const cross = require(path.join(SCRIPTS, 'check-cross-module-relative-imports.cjs'));
const bound = require(path.join(SCRIPTS, 'boundary-check.cjs'));
const depc = require(path.join(SCRIPTS, 'dep-cruiser-baseline.cjs'));

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, err });
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message.split('\n')[0]}`);
  }
}

console.log('identity-stability.test.cjs');

// ─── architecture-diff-guard.js: normalizeBoundaryBaselineEntry ──────────
test('arch.normalizeBoundaryBaselineEntry strips line from legacy 4-seg entry', () => {
  assert.equal(
    arch.normalizeBoundaryBaselineEntry('src/foo/bar.ts:42:no-restricted-imports:../baz/qux'),
    'src/foo/bar.ts:no-restricted-imports:../baz/qux'
  );
});

test('arch.normalizeBoundaryBaselineEntry strips line and fallbacks target to rule for 3-seg legacy', () => {
  // Legacy "<file>:<line>:<rule>" (no target field captured) → fallback target = rule.
  assert.equal(
    arch.normalizeBoundaryBaselineEntry('src/foo.ts:42:boundaries/element-types'),
    'src/foo.ts:boundaries/element-types:boundaries/element-types'
  );
});

test('arch.normalizeBoundaryBaselineEntry leaves v1.1.1 canonical entry unchanged', () => {
  assert.equal(
    arch.normalizeBoundaryBaselineEntry('src/foo.ts:no-restricted-imports:../bar/x'),
    'src/foo.ts:no-restricted-imports:../bar/x'
  );
});

// ─── architecture-diff-guard.js: normalizeImportBaselineEntry ────────────
test('arch.normalizeImportBaselineEntry: v1.0 with line → canonical', () => {
  assert.equal(
    arch.normalizeImportBaselineEntry('src/a.ts:7:../b/x'),
    'src/a.ts:cross-module-import:../b/x'
  );
});

test('arch.normalizeImportBaselineEntry: v1.0 alt with line + rule segment → strip line only', () => {
  assert.equal(
    arch.normalizeImportBaselineEntry('src/a.ts:7:cross-module-import:../b/x'),
    'src/a.ts:cross-module-import:../b/x'
  );
});

test('arch.normalizeImportBaselineEntry: v1.1 brief (no rule segment) → canonical', () => {
  assert.equal(
    arch.normalizeImportBaselineEntry('src/a.ts:../b/x'),
    'src/a.ts:cross-module-import:../b/x'
  );
});

test('arch.normalizeImportBaselineEntry: v1.1.1 canonical → unchanged', () => {
  assert.equal(
    arch.normalizeImportBaselineEntry('src/a.ts:cross-module-import:../b/x'),
    'src/a.ts:cross-module-import:../b/x'
  );
});

// ─── architecture-diff-guard.baselineIdentitiesForFile ───────────────────
test('arch.baselineIdentitiesForFile boundary kind: normalizes legacy entries', () => {
  const baseline = [
    'src/foo.ts:42:no-restricted-imports:../bar/x',  // v1.0 4-seg
    'src/foo.ts:7:max-lines',                         // v1.0 3-seg no target
    'src/other.ts:no-restricted-imports:../z',        // unrelated, ignored
  ];
  const ids = arch.baselineIdentitiesForFile(baseline, 'src/foo.ts', 'boundary');
  assert.equal(ids.size, 2);
  assert.ok(ids.has('src/foo.ts:no-restricted-imports:../bar/x'));
  assert.ok(ids.has('src/foo.ts:max-lines:max-lines'));
});

test('arch.baselineIdentitiesForFile import kind: normalizes v1.0/v1.1 to canonical', () => {
  const baseline = [
    'src/foo.ts:7:../b/x',                            // v1.0
    'src/foo.ts:../c/y',                              // v1.1 brief
    'src/foo.ts:cross-module-import:../d/z',          // canonical
    'src/other.ts:cross-module-import:../bar/q',      // unrelated
  ];
  const ids = arch.baselineIdentitiesForFile(baseline, 'src/foo.ts', 'import');
  assert.equal(ids.size, 3);
  assert.ok(ids.has('src/foo.ts:cross-module-import:../b/x'));
  assert.ok(ids.has('src/foo.ts:cross-module-import:../c/y'));
  assert.ok(ids.has('src/foo.ts:cross-module-import:../d/z'));
});

// ─── check-cross-module-relative-imports.js ──────────────────────────────
test('cross.identityFor produces line-stable canonical identity', () => {
  const v1 = { file: 'src/a.ts', line: 5, import: '../b/x' };
  const v2 = { file: 'src/a.ts', line: 50, import: '../b/x' };  // same violation, shifted
  assert.equal(cross.identityFor(v1), cross.identityFor(v2));
  assert.equal(cross.identityFor(v1), 'src/a.ts:cross-module-import:../b/x');
});

test('cross.normalizeBaselineEntry: v1.0 with line → canonical', () => {
  assert.equal(
    cross.normalizeBaselineEntry('src/a.ts:5:../b/x'),
    'src/a.ts:cross-module-import:../b/x'
  );
});

test('cross.normalizeBaselineEntry: v1.1 brief → canonical', () => {
  assert.equal(
    cross.normalizeBaselineEntry('src/a.ts:../b/x'),
    'src/a.ts:cross-module-import:../b/x'
  );
});

test('cross.normalizeBaselineEntry: v1.1.1 canonical → unchanged', () => {
  assert.equal(
    cross.normalizeBaselineEntry('src/a.ts:cross-module-import:../b/x'),
    'src/a.ts:cross-module-import:../b/x'
  );
});

test('cross.diffNewViolations: line-shifted violation against legacy baseline NOT reported', () => {
  // Closes Codex round-5 finding (unstable identity).
  const baseline = ['src/a.ts:5:../b/x'];  // v1.0
  const current = [{ file: 'src/a.ts', line: 7, import: '../b/x' }];
  const newViolations = cross.diffNewViolations(current, baseline);
  assert.equal(newViolations.length, 0);
});

test('cross.diffNewViolations: genuinely new violation IS reported', () => {
  const baseline = ['src/a.ts:cross-module-import:../b/x'];
  const current = [
    { file: 'src/a.ts', line: 5, import: '../b/x' },  // baselined
    { file: 'src/a.ts', line: 9, import: '../c/y' },  // new
  ];
  const newViolations = cross.diffNewViolations(current, baseline);
  assert.equal(newViolations.length, 1);
  assert.equal(newViolations[0].import, '../c/y');
});

test('cross.diffNewViolations: mix of v1.0 + v1.1 brief + canonical → all match', () => {
  const baseline = [
    'src/a.ts:5:../b/x',                          // v1.0
    'src/d.ts:../e/z',                            // v1.1 brief
    'src/g.ts:cross-module-import:../h/q',        // canonical
  ];
  const current = [
    { file: 'src/a.ts', line: 100, import: '../b/x' },
    { file: 'src/d.ts', line: 1, import: '../e/z' },
    { file: 'src/g.ts', line: 50, import: '../h/q' },
  ];
  const newViolations = cross.diffNewViolations(current, baseline);
  assert.equal(newViolations.length, 0);
});

// ─── boundary-check.js (NEW in v1.1.1, was line-based) ────────────────────
test('bound.violationKey produces line-stable canonical identity', () => {
  const v1 = { file: 'src/a.ts', line: 5, rule: 'no-restricted-imports', target: '../b/x' };
  const v2 = { file: 'src/a.ts', line: 99, rule: 'no-restricted-imports', target: '../b/x' };
  assert.equal(bound.violationKey(v1), bound.violationKey(v2));
  assert.equal(bound.violationKey(v1), 'src/a.ts:no-restricted-imports:../b/x');
});

test('bound.extractTarget prefers msg.target over message parsing', () => {
  assert.equal(
    bound.extractTarget({ target: '@/foo/internal', message: "Cannot import 'foo'" }),
    '@/foo/internal'
  );
});

test('bound.extractTarget falls back to first quoted string in message', () => {
  assert.equal(
    bound.extractTarget({ message: "Cannot import 'foo' (use '@/foo/public')" }),
    'foo'
  );
});

test('bound.extractTarget returns null when no target and no quoted string', () => {
  assert.equal(bound.extractTarget({ message: 'generic error' }), null);
});

test('bound.normalizeBaselineEntry: v1.0 4-seg with line → canonical', () => {
  assert.equal(
    bound.normalizeBaselineEntry('src/a.ts:42:no-restricted-imports:../b/x'),
    'src/a.ts:no-restricted-imports:../b/x'
  );
});

test('bound.normalizeBaselineEntry: v1.0 3-seg no target → fallback target to rule', () => {
  // Pre-target legacy: "<file>:<line>:<rule>" → target loss, fallback to rule for matching.
  assert.equal(
    bound.normalizeBaselineEntry('src/a.ts:42:max-lines'),
    'src/a.ts:max-lines:max-lines'
  );
});

test('bound.normalizeBaselineEntry: v1.1.1 canonical → unchanged', () => {
  assert.equal(
    bound.normalizeBaselineEntry('src/a.ts:no-restricted-imports:../b/x'),
    'src/a.ts:no-restricted-imports:../b/x'
  );
});

test('bound.diffNew: REGRESSION — shifted baselined violation NOT reported as new', () => {
  // Closes Codex round-6 finding (boundary-check.js was still line-based).
  // Baseline written before code shift; current violation moved to a different line.
  const baseline = ['src/a.ts:1:no-restricted-imports'];  // v1.0 3-seg legacy
  const current = [
    { file: 'src/a.ts', line: 6, rule: 'no-restricted-imports', target: 'no-restricted-imports' },
  ];
  const newViolations = bound.diffNew(current, baseline);
  assert.equal(
    newViolations.length,
    0,
    'shifted baselined boundary violation must not be reported as new'
  );
});

test('bound.diffNew: genuinely new boundary violation IS reported', () => {
  const baseline = ['src/a.ts:no-restricted-imports:../b/x'];
  const current = [
    { file: 'src/a.ts', line: 5, rule: 'no-restricted-imports', target: '../b/x' },  // baselined
    { file: 'src/a.ts', line: 9, rule: 'no-restricted-imports', target: '../c/y' },  // new
  ];
  const newViolations = bound.diffNew(current, baseline);
  assert.equal(newViolations.length, 1);
  assert.equal(newViolations[0].target, '../c/y');
});

test('bound.saveBaseline: written entries use canonical v1.1.1 format', () => {
  // Indirect check — saveBaseline writes to disk; we mimic by calling violationKey directly.
  const v = { file: 'src/a.ts', line: 5, rule: 'no-restricted-imports', target: '../b/x' };
  assert.equal(bound.violationKey(v), 'src/a.ts:no-restricted-imports:../b/x');
});

// ─── dep-cruiser-baseline.cjs (NEW in v1.3, extracted из loom) ────────────
test('depc.extractViolations: dependency-level rule → canonical identity', () => {
  const report = {
    modules: [
      {
        source: 'src/a/foo.ts',
        dependencies: [
          {
            resolved: 'src/b/bar.ts',
            rules: [{ name: 'adapter-no-orchestration', severity: 'error' }],
          },
        ],
        rules: [],
      },
    ],
  };
  const violations = depc.extractViolations(report);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].identity, 'src/a/foo.ts:adapter-no-orchestration:src/b/bar.ts');
});

test('depc.extractViolations: module-level rule (orphan) → identity uses file as target', () => {
  const report = {
    modules: [
      {
        source: 'src/a/orphan.ts',
        dependencies: [],
        rules: [{ name: 'no-orphan', severity: 'error' }],
      },
    ],
  };
  const violations = depc.extractViolations(report);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].identity, 'src/a/orphan.ts:no-orphan:src/a/orphan.ts');
});

test('depc.extractViolations: severity=warn is ignored (error-only)', () => {
  const report = {
    modules: [
      {
        source: 'src/a.ts',
        dependencies: [
          { resolved: 'src/b.ts', rules: [{ name: 'soft-rule', severity: 'warn' }] },
        ],
        rules: [],
      },
    ],
  };
  assert.equal(depc.extractViolations(report).length, 0);
});

test('depc.diffNew: identity in baseline → not reported as new', () => {
  const baseline = new Set(['src/a.ts:r:src/b.ts']);
  const current = ['src/a.ts:r:src/b.ts', 'src/a.ts:r:src/c.ts'];
  const newOnes = depc.diffNew(current, baseline);
  assert.deepEqual(newOnes, ['src/a.ts:r:src/c.ts']);
});

test('depc.diffNew: shifted file content cannot break baseline (identity has no line)', () => {
  // dep-cruiser identity model is already line-free by design — included for parity
  // with boundary-check and cross-module regression tests.
  const baseline = new Set(['src/a.ts:adapter-no-orchestration:src/b.ts']);
  const current = ['src/a.ts:adapter-no-orchestration:src/b.ts'];
  assert.equal(depc.diffNew(current, baseline).length, 0);
});

// ─── SUMMARY ─────────────────────────────────────────────────────────────
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\nFailures:`);
  for (const f of failures) {
    console.error(`  ${f.name}:`);
    console.error(`    ${f.err.message}`);
  }
  process.exit(1);
}
