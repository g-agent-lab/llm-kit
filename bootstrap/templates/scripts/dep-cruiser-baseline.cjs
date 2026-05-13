#!/usr/bin/env node
/**
 * dependency-cruiser baseline wrapper.
 *
 * Adds the brownfield baseline mechanic (existing violations tolerated,
 * new ones blocked) to dep-cruiser, which has no native baseline support.
 * Uses the same identity contract as the other kit scripts:
 *   `<file>:<rule>:<target>` where target = resolved import path (or file
 *   itself for module-level rules).
 *
 * Provides the 9th enforcement gate from UNIVERSAL_CORE §4.2 in projects
 * where ESLint's boundaries plugin alone is insufficient (e.g. ESM-only
 * projects, monorepo edges, package-level cycles).
 *
 * Usage:
 *   node scripts/dep-cruiser-baseline.cjs              # CI mode: exit 1 on NEW
 *   node scripts/dep-cruiser-baseline.cjs --update     # regenerate baseline
 *   node scripts/dep-cruiser-baseline.cjs --report     # list violations, no exit
 *   node scripts/dep-cruiser-baseline.cjs --src api/src  # custom source root
 *
 * Inputs:
 *   - `.dependency-cruiser.cjs` (or ENV `DEP_CRUISER_CONFIG`) — config file
 *   - `<src>` directory (default `src`, override via `--src`)
 *
 * Outputs:
 *   - `.dep-cruiser-baseline.json` — canonical identities, sorted
 *
 * Exit codes:
 *   0 — pass (no new violations) OR --update / --report mode
 *   1 — fail (new violations introduced)
 *   2 — internal error (config missing, dep-cruiser missing, JSON parse fail)
 *
 * Origin: extracted from loom (first real-world brownfield application of
 * the kit, 2026-05-13). Confirmed working on a ~250-file ESM Node 22 CLI
 * project with 12 baselined dep-cruiser violations.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ─── CONFIG ──────────────────────────────────────────────────────────────
const BASELINE = path.join(process.cwd(), '.dep-cruiser-baseline.json');
const CONFIG = process.env.DEP_CRUISER_CONFIG
  ? path.resolve(process.env.DEP_CRUISER_CONFIG)
  : path.join(process.cwd(), '.dependency-cruiser.cjs');

// ─── ARGS ────────────────────────────────────────────────────────────────
function getArg(flag, fallback) {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

const SRC = getArg('--src', 'src');
const UPDATE = process.argv.includes('--update') || process.argv.includes('--update-baseline');
const REPORT = process.argv.includes('--report');

// ─── HELPERS ─────────────────────────────────────────────────────────────
function runDepCruiser() {
  if (!fs.existsSync(CONFIG)) {
    console.error(`dep-cruiser config not found at ${CONFIG}`);
    process.exit(2);
  }
  try {
    const out = execSync(
      `npx --no-install depcruise --config ${CONFIG} --output-type json ${SRC}`,
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 32 * 1024 * 1024,
      },
    );
    return JSON.parse(out);
  } catch (e) {
    // dep-cruiser exits non-zero when violations exist; output is still on stdout
    if (e.stdout) {
      try {
        return JSON.parse(e.stdout);
      } catch {
        console.error('Failed to parse dep-cruiser JSON output.');
        process.exit(2);
      }
    }
    console.error(`dep-cruiser failed: ${e.message}`);
    process.exit(2);
  }
}

function extractViolations(report) {
  const violations = [];
  const modules = report.modules || [];
  for (const mod of modules) {
    const file = mod.source;
    for (const dep of mod.dependencies || []) {
      for (const rule of dep.rules || []) {
        if (rule.severity === 'error') {
          violations.push({
            file,
            rule: rule.name,
            target: dep.resolved,
            identity: `${file}:${rule.name}:${dep.resolved}`,
          });
        }
      }
    }
    for (const rule of mod.rules || []) {
      if (rule.severity === 'error') {
        violations.push({
          file,
          rule: rule.name,
          target: file,
          identity: `${file}:${rule.name}:${file}`,
        });
      }
    }
  }
  return violations;
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE)) return new Set();
  try {
    const raw = fs.readFileSync(BASELINE, 'utf8');
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveBaseline(identities) {
  const sorted = [...new Set(identities)].sort();
  fs.writeFileSync(BASELINE, JSON.stringify(sorted, null, 2) + '\n');
}

function diffNew(current, baseline) {
  return current.filter((id) => !baseline.has(id));
}

// ─── MAIN ────────────────────────────────────────────────────────────────
function main() {
  const report = runDepCruiser();
  const violations = extractViolations(report);
  const identities = violations.map((v) => v.identity);

  if (UPDATE) {
    saveBaseline(identities);
    console.log(`dep-cruiser baseline updated: ${identities.length} violations.`);
    return 0;
  }

  const baseline = loadBaseline();
  const newOnes = diffNew(identities, baseline);

  if (REPORT) {
    console.log(
      `Total: ${identities.length}, baselined: ${baseline.size}, new: ${newOnes.length}`,
    );
    for (const v of violations) console.log(`  ${v.identity}`);
    return 0;
  }

  if (newOnes.length === 0) {
    console.log(
      `✓ dep-cruiser: ${identities.length} violations all baselined (baseline: ${baseline.size}).`,
    );
    return 0;
  }

  console.error(`✗ dep-cruiser: ${newOnes.length} NEW violation(s):`);
  for (const id of newOnes) console.error(`  ${id}`);
  return 1;
}

module.exports = {
  runDepCruiser,
  extractViolations,
  loadBaseline,
  saveBaseline,
  diffNew,
};

if (require.main === module) process.exit(main());
