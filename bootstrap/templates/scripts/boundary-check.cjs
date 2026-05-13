#!/usr/bin/env node
/**
 * Module boundary check with baseline.
 *
 * Reads linter JSON output (from stdin), filters boundary-related violations,
 * compares against baseline, exits 1 on NEW boundary violations.
 *
 * Universal Node.js script — works with ESLint JSON format by default.
 * For non-ESLint linters (Python ruff, Go golangci-lint, etc.) — adapt the
 * `extractBoundaryViolations` function or pre-process input to ESLint shape.
 *
 * Usage:
 *   <linter> --format json | node scripts/boundary-check.js              # exit 1 on NEW violations
 *   <linter> --format json | node scripts/boundary-check.js --update     # regenerate baseline
 *   <linter> --format json | node scripts/boundary-check.js --report     # list current violations
 */

const fs = require('fs');
const path = require('path');

// ─── CONFIG ──────────────────────────────────────────────────────────────
const BASELINE_PATH = path.join(process.cwd(), '.boundary-baseline.json');

// Rules that ESLint reports as boundary violations.
// Adapt for non-ESLint linters: list rule IDs / codes that flag DAG / public.ts / etc.
const BOUNDARY_RULES = new Set([
  'boundaries/element-types',
  'boundaries/no-private',
  'no-restricted-imports',
  'import/no-restricted-paths',
]);

// ─── ARGS ────────────────────────────────────────────────────────────────
const UPDATE = process.argv.includes('--update') || process.argv.includes('--update-baseline');
const REPORT = process.argv.includes('--report');

// ─── INPUT ──────────────────────────────────────────────────────────────
function readStdin() {
  if (process.stdin.isTTY) {
    console.error('Error: no stdin. Pipe linter JSON output into this script.');
    process.exit(2);
  }
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
  });
}

function parseLinterOutput(raw) {
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error: failed to parse linter JSON output.');
    console.error(err.message);
    process.exit(2);
  }
}

// ─── CORE ────────────────────────────────────────────────────────────────
/**
 * Extract structured `target` from a linter message (adapter contract — see README).
 * Priority: msg.target (adapter-provided) → first quoted string in message → null.
 * Falls back to ruleId at identity-build time when neither is available.
 */
function extractTarget(msg) {
  if (typeof msg.target === 'string' && msg.target) return msg.target;
  if (typeof msg.message === 'string') {
    const m = msg.message.match(/['"]([^'"]+)['"]/);
    if (m) return m[1];
  }
  return null;
}

/**
 * Extract boundary violations from ESLint JSON output.
 * ESLint output is an array of { filePath, messages: [{ ruleId, line, column, message, target? }] }.
 */
function extractBoundaryViolations(eslintOutput) {
  const violations = [];
  for (const result of eslintOutput) {
    for (const msg of result.messages || []) {
      if (BOUNDARY_RULES.has(msg.ruleId)) {
        const target = extractTarget(msg) || msg.ruleId;
        violations.push({
          file: path.relative(process.cwd(), result.filePath),
          line: msg.line,  // for reporting only, NOT in identity
          rule: msg.ruleId,
          target,
          message: msg.message,
        });
      }
    }
  }
  return violations;
}

// ─── IDENTITY MODEL (v1.1.1, line-stable, canonical) ─────────────────────
// Canonical baseline identity: "<file>:<rule>:<target>"
// `line` is NOT in identity — inserting code above a violation does not shift identity
// and trigger phantom-new flags. See architecture-diff-guard.js for full rationale.
//
// Target resolution priority (see README "Identity contract"):
//   1. msg.target (adapter-provided, MANDATORY for boundary rules)
//   2. First quoted string in msg.message (fallback for native ESLint)
//   3. ruleId (last-resort — collapses target discrimination)
//
// Legacy normalization at read time:
//   v1.0 4-seg with line:    "<file>:<line>:<rule>:<target>"  → strip line
//   v1.0 3-seg w/o target:   "<file>:<line>:<rule>"           → strip line, append ":<rule>" (target fallback to ruleId)
//   v1.1.1 canonical:        "<file>:<rule>:<target>"          → unchanged
//
// Note: legacy 3-seg without target loses real target info — `--update` recommended
// after upgrade to capture current structured targets.

function violationKey(v) {
  return `${v.file}:${v.rule}:${v.target}`;
}

function normalizeBaselineEntry(entry) {
  if (typeof entry !== 'string') return entry;
  const segs = entry.split(':');
  // Legacy detection: second segment is a numeric line.
  if (segs.length >= 3 && /^\d+$/.test(segs[1])) {
    const stripped = [segs[0], ...segs.slice(2)];
    // After stripping line: either <file>:<rule>:<target> (4-seg legacy) — already canonical,
    // or <file>:<rule> (3-seg legacy without target) — fallback target to rule.
    if (stripped.length === 2) {
      return `${stripped[0]}:${stripped[1]}:${stripped[1]}`;
    }
    return stripped.join(':');
  }
  // Pre-v1.0 baseline without line: <file>:<rule> (2-seg, no target) — fallback target to rule.
  if (segs.length === 2) {
    return `${segs[0]}:${segs[1]}:${segs[1]}`;
  }
  return entry;
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function saveBaseline(violations) {
  const seen = new Set();
  const keys = [];
  for (const v of violations) {
    const id = violationKey(v);
    if (seen.has(id)) continue;
    seen.add(id);
    keys.push(id);
  }
  keys.sort();
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(keys, null, 2) + '\n');
}

function diffNew(current, baseline) {
  const baselineSet = new Set(baseline.map(normalizeBaselineEntry));
  return current.filter((v) => !baselineSet.has(violationKey(v)));
}

// ─── MAIN ────────────────────────────────────────────────────────────────
async function main() {
  const raw = await readStdin();
  const linterOutput = parseLinterOutput(raw);
  const violations = extractBoundaryViolations(linterOutput);

  if (UPDATE) {
    saveBaseline(violations);
    console.log(`Boundary baseline updated: ${violations.length} violations.`);
    process.exit(0);
  }

  if (REPORT) {
    console.log(`${violations.length} boundary violations:\n`);
    for (const v of violations) {
      console.log(`  ${v.file}:${v.line} [${v.rule}] ${v.message}`);
    }
    process.exit(0);
  }

  // CI mode (default): compare with baseline, exit 1 on NEW.
  const baseline = loadBaseline();
  const newViolations = diffNew(violations, baseline);

  if (newViolations.length === 0) {
    console.log(`✓ No new boundary violations (baseline: ${baseline.length}).`);
    process.exit(0);
  }

  console.error(`✗ ${newViolations.length} new boundary violations:\n`);
  for (const v of newViolations) {
    console.error(`  ${v.file}:${v.line} [${v.rule}] ${v.message}`);
  }
  process.exit(1);
}

module.exports = {
  extractTarget,
  extractBoundaryViolations,
  violationKey,
  normalizeBaselineEntry,
  diffNew,
  loadBaseline,
  saveBaseline,
};

if (require.main === module) main();
