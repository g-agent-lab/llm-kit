#!/usr/bin/env node
/**
 * Architecture report — prioritized human-readable summary from linter JSON.
 *
 * Reads linter JSON output (stdin), groups violations by category (cognitive
 * complexity, file size, function size, depth, params), sorts by severity,
 * prints top violations + per-file totals.
 *
 * Usage:
 *   <linter> --format json | node scripts/arch-report.js              # full report
 *   <linter> --format json | node scripts/arch-report.js --top 20     # only top 20
 *   <linter> --format json | node scripts/arch-report.js --json       # machine-readable JSON output
 *
 * Exit code: always 0 (report is informational, not a CI gate).
 */

const fs = require('fs');
const path = require('path');

// ─── CONFIG ──────────────────────────────────────────────────────────────
// Map of rule IDs to category labels. Adapt per stack / linter.
const CATEGORIES = {
  'sonarjs/cognitive-complexity': { label: 'CC', threshold: 15 },
  'complexity': { label: 'CY', threshold: 20 },
  'max-lines': { label: 'file LOC', threshold: 600 },
  'max-lines-per-function': { label: 'fn LOC', threshold: 80 },
  'max-depth': { label: 'depth', threshold: 5 },
  'max-params': { label: 'params', threshold: 8 },
  'boundaries/element-types': { label: 'boundary', threshold: null },
  'no-restricted-imports': { label: 'public-api', threshold: null },
};

// ─── ARGS ────────────────────────────────────────────────────────────────
const TOP = (() => {
  const idx = process.argv.indexOf('--top');
  return idx !== -1 ? parseInt(process.argv[idx + 1], 10) || 50 : 50;
})();
const JSON_OUTPUT = process.argv.includes('--json');

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

// ─── CORE ────────────────────────────────────────────────────────────────
function extractValue(message, ruleId) {
  // Parse numeric value from message text. ESLint formats vary by rule.
  // Examples:
  //   "Cognitive Complexity from 25 to 15 allowed."
  //   "Function has too many lines (123). Maximum allowed is 80."
  const match = message.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function processViolations(eslintOutput) {
  const grouped = {};
  for (const result of eslintOutput) {
    for (const msg of result.messages || []) {
      const cat = CATEGORIES[msg.ruleId];
      if (!cat) continue;
      if (!grouped[msg.ruleId]) grouped[msg.ruleId] = [];
      grouped[msg.ruleId].push({
        file: path.relative(process.cwd(), result.filePath),
        line: msg.line,
        category: cat.label,
        value: extractValue(msg.message, msg.ruleId),
        threshold: cat.threshold,
        message: msg.message,
      });
    }
  }
  // Sort each group by value desc (most over-threshold first)
  for (const ruleId of Object.keys(grouped)) {
    grouped[ruleId].sort((a, b) => (b.value || 0) - (a.value || 0));
  }
  return grouped;
}

function fileViolationCount(eslintOutput) {
  const counts = {};
  for (const result of eslintOutput) {
    const file = path.relative(process.cwd(), result.filePath);
    counts[file] = (counts[file] || 0) + (result.messages?.length || 0);
  }
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
}

// ─── OUTPUT ──────────────────────────────────────────────────────────────
function printReport(grouped, fileCounts) {
  const total = Object.values(grouped).reduce((sum, arr) => sum + arr.length, 0);
  console.log(`Architecture report: ${total} violations across ${Object.keys(grouped).length} rule categories\n`);

  for (const ruleId of Object.keys(grouped).sort()) {
    const items = grouped[ruleId];
    const cat = CATEGORIES[ruleId];
    console.log(`── ${cat.label} (${ruleId}): ${items.length} violations${cat.threshold ? ` (threshold ${cat.threshold})` : ''}`);
    const top = items.slice(0, Math.min(10, items.length));
    for (const v of top) {
      const valueStr = v.value !== null ? ` (${v.value})` : '';
      console.log(`  ${v.file}:${v.line}${valueStr}`);
    }
    if (items.length > top.length) {
      console.log(`  ... ${items.length - top.length} more`);
    }
    console.log('');
  }

  console.log(`── Top ${TOP} files by violation count:`);
  for (const [file, count] of fileCounts.slice(0, TOP)) {
    console.log(`  ${count.toString().padStart(4)} ${file}`);
  }
}

// ─── MAIN ────────────────────────────────────────────────────────────────
async function main() {
  const raw = await readStdin();
  let eslintOutput;
  try {
    eslintOutput = JSON.parse(raw);
  } catch (err) {
    console.error('Error: failed to parse linter JSON.');
    process.exit(2);
  }

  const grouped = processViolations(eslintOutput);
  const fileCounts = fileViolationCount(eslintOutput);

  if (JSON_OUTPUT) {
    console.log(JSON.stringify({ grouped, fileCounts: fileCounts.slice(0, TOP) }, null, 2));
  } else {
    printReport(grouped, fileCounts);
  }
}

main();
