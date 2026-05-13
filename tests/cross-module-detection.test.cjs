#!/usr/bin/env node
/**
 * Cross-module detection integration test.
 *
 * Creates a temp fixture with two modules (`moduleA`, `moduleB`) where `moduleB`
 * imports from `moduleA` via a relative import. Spawns the actual checker script
 * in the fixture's cwd and asserts behavior across baseline / cleanup / line-shift
 * scenarios. The line-shift case is the regression test for v1.1 line-stable identity.
 *
 * Run via tests/run-smoke.sh — exits non-zero on any failure.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CHECKER = path.resolve(
  __dirname,
  '..',
  'bootstrap',
  'templates',
  'scripts',
  'check-cross-module-relative-imports.cjs'
);

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

function makeFixture(consumerLeadingBlanks = 0) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'llmkit-smoke-'));
  fs.mkdirSync(path.join(root, 'src', 'moduleA'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'moduleB'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'src', 'moduleA', 'service.js'),
    'module.exports = { greet: (name) => `hi ${name}` };\n'
  );
  const blanks = '\n'.repeat(consumerLeadingBlanks);
  fs.writeFileSync(
    path.join(root, 'src', 'moduleB', 'consumer.js'),
    `${blanks}const a = require('../moduleA/service');\nmodule.exports = a.greet;\n`
  );
  return root;
}

function runChecker(cwd, args = []) {
  const result = spawnSync('node', [CHECKER, ...args], { cwd, encoding: 'utf8' });
  return { code: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function loadBaseline(root) {
  const p = path.join(root, '.cross-module-import-baseline.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log('cross-module-detection.test.cjs');

// ─── 1. Greenfield clean: no violations on a fixture with no cross-module imports ──
test('greenfield clean: empty src tree → 0 violations, exit 0', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'llmkit-clean-'));
  fs.mkdirSync(path.join(root, 'src', 'moduleA'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'moduleA', 'index.js'), 'module.exports = 1;\n');
  try {
    const { code, stdout } = runChecker(root);
    assert.equal(code, 0, `expected exit 0, got ${code}`);
    assert.match(stdout, /No cross-module relative imports/);
  } finally {
    cleanup(root);
  }
});

// ─── 2. Default mode: cross-module import is reported, exit 1 ──────────────
test('default mode: cross-module import reported, exit 1', () => {
  const root = makeFixture();
  try {
    const { code, stdout } = runChecker(root);
    assert.equal(code, 1, `expected exit 1, got ${code}`);
    assert.match(stdout, /1 cross-module relative imports/);
    assert.match(stdout, /moduleB\/consumer\.js/);
    assert.match(stdout, /\.\.\/moduleA\/service/);
  } finally {
    cleanup(root);
  }
});

// ─── 3. Update baseline → CI mode passes ──────────────────────────────────
test('update writes baseline; subsequent --ci pass with 0 new', () => {
  const root = makeFixture();
  try {
    let r = runChecker(root, ['--update']);
    assert.equal(r.code, 0);
    const baseline = loadBaseline(root);
    assert.equal(baseline.length, 1);
    // v1.1.1 canonical baseline format: <file>:cross-module-import:<importPath>
    assert.equal(baseline[0], 'src/moduleB/consumer.js:cross-module-import:../moduleA/service');

    r = runChecker(root, ['--ci']);
    assert.equal(r.code, 0, `--ci must pass with no new violations; got exit ${r.code}\nstderr: ${r.stderr}`);
    assert.match(r.stdout, /No new cross-module imports/);
  } finally {
    cleanup(root);
  }
});

// ─── 4. Add a NEW violation: --ci fails ───────────────────────────────────
test('new violation appears: --ci exits 1', () => {
  const root = makeFixture();
  try {
    runChecker(root, ['--update']);
    // Add a second cross-module import.
    fs.appendFileSync(
      path.join(root, 'src', 'moduleB', 'consumer.js'),
      `const other = require('../moduleA/extra');\n`
    );
    const r = runChecker(root, ['--ci']);
    assert.equal(r.code, 1, `--ci must fail on new violation; got exit ${r.code}`);
    assert.match(r.stderr, /1 new cross-module imports/);
    assert.match(r.stderr, /\.\.\/moduleA\/extra/);
  } finally {
    cleanup(root);
  }
});

// ─── 5. REGRESSION (Codex round-5 finding): line-shift must NOT report as new ──
test('REGRESSION: shifting baselined violation by N lines does NOT report as new', () => {
  const root = makeFixture(0);
  try {
    runChecker(root, ['--update']);
    const baselineBefore = loadBaseline(root);

    // Simulate LLM inserting an import block (or anything) at top of consumer.
    const consumerPath = path.join(root, 'src', 'moduleB', 'consumer.js');
    const original = fs.readFileSync(consumerPath, 'utf8');
    fs.writeFileSync(consumerPath, '\n\n\n\n\n' + original);  // shift by 5 lines

    const r = runChecker(root, ['--ci']);
    assert.equal(
      r.code,
      0,
      `line-shift must NOT trigger new violation (v1.1 line-stable identity); ` +
        `got exit ${r.code}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.match(r.stdout, /No new cross-module imports/);

    // Baseline content is unchanged (we did not run --update again).
    const baselineAfter = loadBaseline(root);
    assert.deepEqual(baselineAfter, baselineBefore);
  } finally {
    cleanup(root);
  }
});

// ─── 6. REGRESSION: legacy v1.0 baseline (with line) still matches after shift ──
test('REGRESSION: legacy v1.0 baseline (with line) is normalized at read time', () => {
  const root = makeFixture(0);
  try {
    // Hand-write a legacy v1.0 baseline that references line 1 (current actual line).
    const legacyBaseline = ['src/moduleB/consumer.js:1:../moduleA/service'];
    fs.writeFileSync(
      path.join(root, '.cross-module-import-baseline.json'),
      JSON.stringify(legacyBaseline, null, 2) + '\n'
    );

    // Shift the violation to a new line.
    const consumerPath = path.join(root, 'src', 'moduleB', 'consumer.js');
    const original = fs.readFileSync(consumerPath, 'utf8');
    fs.writeFileSync(consumerPath, '\n\n\n' + original);

    const r = runChecker(root, ['--ci']);
    assert.equal(
      r.code,
      0,
      `legacy v1.0 baseline must auto-normalize (line stripped at read); ` +
        `got exit ${r.code}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
  } finally {
    cleanup(root);
  }
});

// ─── 7. REGRESSION: v1.1 brief baseline format normalizes to v1.1.1 canonical ──
test('REGRESSION: v1.1 brief baseline (no rule segment) is normalized at read time', () => {
  const root = makeFixture(0);
  try {
    // v1.1 brief baseline shipped during the line-shift fix but BEFORE canonical unification.
    // Should still match v1.1.1 current identity.
    const briefBaseline = ['src/moduleB/consumer.js:../moduleA/service'];
    fs.writeFileSync(
      path.join(root, '.cross-module-import-baseline.json'),
      JSON.stringify(briefBaseline, null, 2) + '\n'
    );
    const r = runChecker(root, ['--ci']);
    assert.equal(
      r.code,
      0,
      `v1.1 brief baseline must auto-normalize to canonical at read; ` +
        `got exit ${r.code}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
  } finally {
    cleanup(root);
  }
});

// ─── SUMMARY ─────────────────────────────────────────────────────────────
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
