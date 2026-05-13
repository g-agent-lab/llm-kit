#!/usr/bin/env node
/**
 * Docs lint — validates that docs/ matches actual codebase state.
 *
 * Universal Node.js (≥18, built-ins only) — no external linter dependency.
 *
 * ROOT discovery (in priority order):
 *   1. CLI flag: --root <path>
 *   2. ENV var: DOCS_LINT_ROOT
 *   3. Walk up from script location to find docs/ directory (handles `cd api && npm run lint:docs`)
 *   4. Fallback: process.cwd()
 *
 * Checks implemented:
 *   1. Reference docs exist: env-variables / contracts / module-routing / architecture-exemptions
 *   2. docs/SESSION.md exists; warn if >100 lines
 *   3. Module docs have `> Последняя верификация: YYYY-MM-DD` ≤ MODULE_DOC_FRESHNESS_DAYS (default 60)
 *   4. Plans structure: drafts/, active/, active/completed/ all exist
 *   5. Active plans reference a draft
 *   6. ROADMAP.md links to existing active plan files
 *   7. ENV vars referenced in source documented (static + bracket access; dynamic access errors)
 *   8. Controller coverage: if any *.controller.ts found in src → api-endpoints.md is REQUIRED
 *      and every controller must be referenced. No-API projects skip silently.
 *   9. Broken relative links in docs/*.md (link target file exists)
 *  10. Data model count (if SCHEMA_FILE configured)
 *  11. AGENTS.md placeholder check: root AGENTS.md must not contain unresolved <REPLACE-*>
 *      or <placeholder> tokens (bootstrap incomplete otherwise).
 *
 * Usage:
 *   node scripts/docs-lint.js                              # all checks, exit 1 on errors
 *   node scripts/docs-lint.js --root /path/to/repo         # explicit root
 *   DOCS_LINT_ROOT=/path/to/repo node scripts/docs-lint.js # via env
 */

const fs = require('fs');
const path = require('path');

// ─── CONFIG (adjust per project) ─────────────────────────────────────────
const MODULE_DOC_FRESHNESS_DAYS = 60;

// Where to find source code (relative to ROOT). Empty array → skip source-based checks.
const SOURCE_DIRS = ['src', 'api/src', 'app'];

// Optional: data model schema file (relative to ROOT). Set to null to skip.
const SCHEMA_FILE = null; // e.g. 'api/prisma/schema.prisma'
const DATA_MODEL_DOC_REL = 'docs/reference/data-model.md';

// Controllers: file pattern + endpoints doc.
// Endpoints doc is REQUIRED IF AND ONLY IF controllers are found in source.
// For projects without controllers (no API surface) — silently skipped.
const CONTROLLER_PATTERN = /\.controller\.(ts|js|py)$/;
const ENDPOINTS_DOC_REL = 'docs/reference/api-endpoints.md';

// File extensions to scan for ENV var references
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.py', '.go', '.rs'];

// ─── ROOT DISCOVERY ──────────────────────────────────────────────────────
function walkUpForDocs(startDir) {
  // Walk up filesystem until we find a directory containing docs/, or hit filesystem root.
  let dir = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(dir, 'docs'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null; // hit filesystem root
    dir = parent;
  }
}

function discoverRoot() {
  const cliIdx = process.argv.indexOf('--root');
  if (cliIdx !== -1) return path.resolve(process.argv[cliIdx + 1]);

  if (process.env.DOCS_LINT_ROOT) return path.resolve(process.env.DOCS_LINT_ROOT);

  // Walk up from script dir, then from cwd. Both walks go to filesystem root.
  return (
    walkUpForDocs(path.dirname(__filename)) ||
    walkUpForDocs(process.cwd()) ||
    process.cwd()
  );
}

const ROOT = discoverRoot();
const DOCS = path.join(ROOT, 'docs');

if (!fs.existsSync(DOCS)) {
  console.error(`Error: docs/ not found relative to ROOT=${ROOT}.`);
  console.error('Set DOCS_LINT_ROOT or pass --root <path-to-repo>.');
  process.exit(2);
}

// ─── STATE ──────────────────────────────────────────────────────────────
const errors = [];
const warnings = [];

const error = (check, msg) => errors.push(`[${check}] ${msg}`);
const warn = (check, msg) => warnings.push(`[${check}] ${msg}`);

// ─── HELPERS ─────────────────────────────────────────────────────────────
function readFileOr(filePath, fallback = '') {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : fallback;
}

function findFiles(dir, predicate) {
  if (!fs.existsSync(dir)) return [];
  const result = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') walk(full);
      else if (e.isFile() && predicate(e.name, full)) result.push(full);
    }
  })(dir);
  return result;
}

function existingSourceDirs() {
  return SOURCE_DIRS.map((d) => path.join(ROOT, d)).filter(fs.existsSync);
}

// ─── CHECKS ──────────────────────────────────────────────────────────────
function checkReferenceDocs() {
  const required = ['env-variables.md', 'contracts.md', 'module-routing.md', 'architecture-exemptions.md'];
  for (const name of required) {
    if (!fs.existsSync(path.join(DOCS, 'reference', name))) {
      error('reference', `Missing required doc: docs/reference/${name}`);
    }
  }
}

function checkSessionMd() {
  const session = path.join(DOCS, 'SESSION.md');
  if (!fs.existsSync(session)) {
    error('session-md', 'docs/SESSION.md is missing (mandatory per UNIVERSAL_CORE §5)');
    return;
  }
  const lines = fs.readFileSync(session, 'utf8').split('\n').length;
  if (lines > 100) {
    warn('session-size', `docs/SESSION.md has ${lines} lines (>100) — rotate old entries to docs/changelog/YYYY-MM.md`);
  }
}

function checkModuleDocs() {
  const modulesDir = path.join(DOCS, 'modules');
  if (!fs.existsSync(modulesDir)) return;
  const files = findFiles(modulesDir, (n) => n.endsWith('.md'));
  for (const f of files) {
    const content = fs.readFileSync(f, 'utf8');
    const match = content.match(/(?:Последняя верификация|Last verified):\s*(\d{4}-\d{2}-\d{2})/);
    if (!match) {
      error('module-verification', `${path.relative(ROOT, f)} missing "Последняя верификация: YYYY-MM-DD"`);
      continue;
    }
    const date = new Date(match[1]);
    const daysOld = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
    if (daysOld > MODULE_DOC_FRESHNESS_DAYS) {
      warn('module-stale', `${path.relative(ROOT, f)} verification date is ${Math.round(daysOld)} days old (>${MODULE_DOC_FRESHNESS_DAYS})`);
    }
  }
}

function checkPlansStructure() {
  const plansDir = path.join(DOCS, 'plans');
  if (!fs.existsSync(plansDir)) {
    error('plans-structure', 'docs/plans/ is missing');
    return;
  }
  for (const sub of ['drafts', 'active', 'active/completed']) {
    if (!fs.existsSync(path.join(plansDir, sub))) {
      error('plans-structure', `docs/plans/${sub}/ is missing`);
    }
  }
}

function checkActivePlansLinkDrafts() {
  const activeDir = path.join(DOCS, 'plans/active');
  if (!fs.existsSync(activeDir)) return;
  const plans = fs.readdirSync(activeDir).filter((f) => f.endsWith('.md'));
  for (const p of plans) {
    const content = fs.readFileSync(path.join(activeDir, p), 'utf8');
    if (!/drafts\/[^\s)]+\.md/.test(content)) {
      warn('active-plan-link', `docs/plans/active/${p} does not reference a draft`);
    }
  }
}

function checkRoadmapConsistency() {
  const roadmap = path.join(DOCS, 'plans/ROADMAP.md');
  if (!fs.existsSync(roadmap)) {
    error('roadmap', 'docs/plans/ROADMAP.md is missing');
    return;
  }
  const content = fs.readFileSync(roadmap, 'utf8');
  const linkRe = /active\/([^\s)`]+\.md)/g;
  let m;
  while ((m = linkRe.exec(content)) !== null) {
    const file = m[1];
    if (file.startsWith('completed/')) continue;
    if (!fs.existsSync(path.join(DOCS, 'plans/active', file))) {
      error('roadmap-broken-link', `ROADMAP.md references "active/${file}" but file does not exist`);
    }
  }
}

function checkEnvVarsDocumented() {
  const srcDirs = existingSourceDirs();
  if (srcDirs.length === 0) return;
  const envDoc = readFileOr(path.join(DOCS, 'reference/env-variables.md'));
  const documented = new Set([...envDoc.matchAll(/`([A-Z][A-Z0-9_]+)`/g)].map((m) => m[1]));

  const codeFiles = [];
  for (const srcDir of srcDirs) {
    codeFiles.push(...findFiles(srcDir, (n) => SOURCE_EXTENSIONS.some((ext) => n.endsWith(ext))));
  }

  const referenced = new Set();
  // 1. Static access: process.env.FOO, os.environ['FOO'], os.getenv('FOO'), std::env::var("FOO")
  const staticRe = /(?:process\.env\.|os\.environ\[['"]|os\.getenv\(['"]|std::env::var\(['"])([A-Z][A-Z0-9_]+)/g;
  // 2. Bracket access with string literal: process.env["FOO"], process.env['FOO']
  const bracketRe = /process\.env\[\s*['"]([A-Z][A-Z0-9_]+)['"]\s*\]/g;
  // 3. Any non-literal bracket access: process.env[<anything not starting with quote/backtick>]
  //    Covers: process.env[someVar], process.env[someVar.toUpperCase()],
  //            process.env[`FOO_${x}`], process.env[`${x}`], process.env[fn()].
  //    Cannot statically resolve → ERROR (forces documentation or refactoring).
  //    process.env[CONST] where CONST is a static literal constant is a false positive —
  //    refactor to inline the literal or document the resolved set explicitly.
  const nonLiteralBracketRe = /process\.env\[\s*(?!['"])[^\]]+\]/g;

  const dynamicHits = [];
  for (const f of codeFiles) {
    const content = fs.readFileSync(f, 'utf8');
    let m;
    while ((m = staticRe.exec(content)) !== null) referenced.add(m[1]);
    while ((m = bracketRe.exec(content)) !== null) referenced.add(m[1]);
    if (nonLiteralBracketRe.test(content)) {
      dynamicHits.push(path.relative(ROOT, f));
      nonLiteralBracketRe.lastIndex = 0; // reset
    }
  }

  if (dynamicHits.length > 0) {
    const uniq = [...new Set(dynamicHits)].sort();
    error('env-vars-dynamic', `Dynamic process.env access (cannot be statically documented) in:\n      ${uniq.join('\n      ')}\n  → refactor to static access or document the variable set explicitly in env-variables.md`);
  }

  const undocumented = [...referenced].filter((v) => !documented.has(v)).sort();
  if (undocumented.length > 0) {
    error('env-vars', `Undocumented ENV vars (add to env-variables.md): ${undocumented.join(', ')}`);
  }
}

function checkAgentsPlaceholders() {
  // M-C1: mechanically enforce that root AGENTS.md has no unresolved <REPLACE-*> or
  // <placeholder> tokens. Bootstrap is invalid until these are filled.
  const agentsPath = path.join(ROOT, 'AGENTS.md');
  if (!fs.existsSync(agentsPath)) return; // optional file for non-ralphex projects
  const content = fs.readFileSync(agentsPath, 'utf8');
  const placeholders = [];
  // Match <REPLACE-...>, <YOUR-...>, <TODO...>, <placeholder>, <stack-specific cmd, ...>
  const re = /<(?:REPLACE-[^>]*|YOUR-[^>]*|TODO[^>]*|placeholder|stack-specific[^>]*)>/gi;
  let m;
  while ((m = re.exec(content)) !== null) {
    placeholders.push(m[0]);
  }
  if (placeholders.length > 0) {
    error(
      'agents-placeholders',
      `AGENTS.md contains unresolved placeholders (${placeholders.length}): ${[...new Set(placeholders)].slice(0, 5).join(', ')} — bootstrap incomplete, fill before first ralphex run`
    );
  }
}

function checkControllerCoverage() {
  const srcDirs = existingSourceDirs();
  if (srcDirs.length === 0) return;

  // Find controllers first. If none → project has no API surface, skip silently.
  const controllers = [];
  for (const srcDir of srcDirs) {
    controllers.push(...findFiles(srcDir, (n) => CONTROLLER_PATTERN.test(n)));
  }
  if (controllers.length === 0) return;

  // Controllers exist → endpoints doc is MANDATORY.
  const endpointsPath = path.join(ROOT, ENDPOINTS_DOC_REL);
  if (!fs.existsSync(endpointsPath)) {
    error('controller-coverage', `${controllers.length} controllers found in source but ${ENDPOINTS_DOC_REL} missing — create it`);
    return;
  }

  const endpointsContent = fs.readFileSync(endpointsPath, 'utf8').toLowerCase();
  for (const c of controllers) {
    const base = path.basename(c).replace(/\.controller\.(ts|js|py)$/, '');
    if (!endpointsContent.includes(base.toLowerCase())) {
      error('controller-coverage', `${path.relative(ROOT, c)} not referenced in ${ENDPOINTS_DOC_REL}`);
    }
  }
}

function checkBrokenRelativeLinks() {
  const docFiles = findFiles(DOCS, (n) => n.endsWith('.md'));
  const linkRe = /\[[^\]]+\]\(([^)#]+)(?:#[^)]*)?\)/g;
  for (const f of docFiles) {
    const content = fs.readFileSync(f, 'utf8');
    const fileDir = path.dirname(f);
    let m;
    while ((m = linkRe.exec(content)) !== null) {
      const target = m[1];
      if (target.startsWith('http://') || target.startsWith('https://') || target.startsWith('mailto:')) continue;
      if (target.startsWith('#')) continue; // anchor-only
      const resolved = path.resolve(fileDir, target);
      if (!fs.existsSync(resolved)) {
        error('broken-link', `${path.relative(ROOT, f)} links to "${target}" which does not exist`);
      }
    }
  }
}

function checkDataModelCount() {
  if (!SCHEMA_FILE) return;
  const schemaPath = path.join(ROOT, SCHEMA_FILE);
  const dataModelPath = path.join(ROOT, DATA_MODEL_DOC_REL);
  if (!fs.existsSync(schemaPath) || !fs.existsSync(dataModelPath)) return;
  const schema = fs.readFileSync(schemaPath, 'utf8');
  const actual = (schema.match(/^model /gm) || []).length;
  const dataModel = fs.readFileSync(dataModelPath, 'utf8');
  const match = dataModel.match(/(\d+)\s*(?:Prisma-моделей|models|моделей)/);
  if (!match) {
    error('model-count', 'Cannot parse model count from data-model.md header');
    return;
  }
  const documented = parseInt(match[1], 10);
  if (actual !== documented) {
    error('model-count', `data-model.md says ${documented} models, schema has ${actual}`);
  }
}

// ─── MAIN ────────────────────────────────────────────────────────────────
function main() {
  console.log(`=== Documentation Lint (ROOT=${ROOT}) ===\n`);

  checkReferenceDocs();
  checkSessionMd();
  checkModuleDocs();
  checkPlansStructure();
  checkActivePlansLinkDrafts();
  checkRoadmapConsistency();
  checkEnvVarsDocumented();
  checkControllerCoverage();
  checkBrokenRelativeLinks();
  checkDataModelCount();
  checkAgentsPlaceholders();

  if (warnings.length > 0) {
    console.log(`Warnings (${warnings.length}):\n`);
    for (const w of warnings) console.log(`  ⚠  ${w}`);
    console.log('');
  }

  if (errors.length > 0) {
    console.log(`Errors (${errors.length}):\n`);
    for (const e of errors) console.log(`  ✗  ${e}`);
    console.log('\nFix these before merging. Reference: docs/DOCS_RULES.md\n');
    process.exit(1);
  }

  console.log('All checks passed. ✓');
}

main();
