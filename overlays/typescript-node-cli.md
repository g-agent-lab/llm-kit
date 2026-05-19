# Overlay — TypeScript + Node.js CLI / scripts / orchestrators

> **Audience:** LLM-driven projects на стеке: TypeScript ≥5, Node ≥22, ESM modules, Vitest test runner, CLI binary (commander / yargs / nanoarg) — **без NestJS, без Prisma, без HTTP layer**.
>
> **Источник:** extracted из реального проекта **loom** (Personal CLI orchestrator для multi-agent workflows; 13 domain модулей, 803 vitest cases, ESM, Node 22, subprocess-heavy via execa, state-files via write-file-atomic, native Go helper через postinstall). Sample size = 1 — generalize judiciously, but every pattern below appears in working production code, not imagination.
>
> **Не покрывает (см. другие overlays):** NestJS DI + modules + forwardRef + @Global bridges + public.ts barrel — это в `typescript-nestjs.md`. Prisma / database / migrations / outbox — там же. HTTP controllers / DTOs / OpenAPI — там же. React / SSR — в `next-react.md` (future).

---

## 1. Identification triggers

Применяй этот overlay если:

- `package.json` имеет `"type": "module"` и `"bin": { ... }` секцию
- `package.json` devDependencies содержит `vitest`, **НЕ** `jest` / `@nestjs/*` / `prisma`
- `tsconfig.json` имеет `"module": "ESNext"` или `"NodeNext"` + `"moduleResolution": "Bundler"` или `"NodeNext"`
- Entry-point — `dist/<name>.js` через `#!/usr/bin/env node` shebang
- Subprocess управление через `execa` или `node:child_process`
- State хранится в файлах на диске (не в БД), atomic writes через `write-file-atomic` / `fs.rename`

Если стек смешанный (Next.js + CLI tool + worker в одном repo) — применяй несколько overlay параллельно, каждый к своей директории.

## 2. Project layout

Канонический shape для CLI orchestrator проекта:

```
<root>/
├── src/                       ← TypeScript sources (rootDir per tsconfig)
│   ├── index.ts               ← bin entrypoint (#!/usr/bin/env node)
│   ├── cli/                   ← argv parsing + per-command handlers
│   ├── <domain-1>/            ← domain logic (e.g. `case/`, `orchestrator/`)
│   ├── <domain-2>/
│   ├── config/                ← config reading + path resolution
│   ├── tools/                 ← thin wrappers вокруг external binaries / SDKs
│   ├── util/                  ← stateless helpers (hash, uuid, atomicWrite, ...)
│   └── voices/                ← domain-specific resources (prompts, templates)
│       └── defaults/          ← shipped с пакетом (copied to dist в build)
├── test/                      ← mirror layout `test/<domain>/<file>.test.ts`
│   ├── fixtures/              ← reusable test data (markdown, JSON, etc.)
│   ├── case/
│   ├── orchestrator/
│   └── ...
├── scripts/                   ← maintenance scripts (smoke, preflight, postinstall)
│   ├── build-<helper>.sh
│   ├── preflight-<version>.ts ← run via tsx (no compile step)
│   └── smoke.ts
├── bin/                       ← compiled native helpers (если есть)
│   └── <helper>.go            ← source; <helper> binary built via postinstall
├── prompts/                   ← if LLM-orchestrator: shipped prompt templates
├── external/                  ← read-only third-party artifacts (vendored)
├── dist/                      ← tsc output (gitignored)
├── docs/                      ← project docs (включая llm-kit/ если применён)
├── package.json
├── tsconfig.json              ← main config (src/ only)
├── tsconfig.<purpose>.json    ← secondary configs (e.g. spawn-helpers)
└── .gitignore
```

**Notable absences** vs typescript-nestjs.md:
- Нет `nest-cli.json` / `tsconfig.build.json` (`tsc` natively)
- Нет `prisma/` директории
- Нет `eslint.config.mjs` (опционально — см. §12)
- `node_modules` есть, но pure-deps (no Prisma generated client)

## 3. TypeScript config

Minimum strictness baseline для CLI кода. Заметь что requirements строже чем «typical» TS — это **намеренно** для long-lived state files и subprocess argument boundaries.

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2023",                       // Node 22 supports
    "module": "ESNext",                       // emit ESM
    "moduleResolution": "Bundler",            // или "NodeNext"
    "lib": ["ES2023"],                        // NO "DOM" для CLI
    "outDir": "dist",
    "rootDir": "src",

    // strictness
    "strict": true,
    "noUncheckedIndexedAccess": true,          // обязательно для CLI с map/record state
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,        // важно для config parsing

    // module interop
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": false,             // важно для default re-exports

    // misc
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "declaration": false,                      // CLI обычно не публикует types
    "sourceMap": true                          // помогает в stack traces
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "test"]
}
```

**Secondary tsconfig'и** для специальных целей (тестовые helpers, spawn workers, etc.):

```jsonc
// tsconfig.spawn-helpers.json — компилирует только helpers для child_process
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "test/spike/_compiled",
    "rootDir": "."
  },
  "include": ["src/**/*.ts", "test/spike/_child.ts"],
  "exclude": ["test/spike/*.test.ts", "src/index.ts"]
}
```

## 4. ESM patterns (важно)

CLI на Node ≥22 — нативный ESM. Это влияет на каждую строчку import.

**Все internal imports — с `.js` extension** (даже если source — `.ts`):

```typescript
// ✓ correct
import { lockCase } from "../case/lockCase.js";
import { uuidv7 } from "../util/uuid.js";

// ✗ wrong — TS won't error, but runtime ESM will fail
import { lockCase } from "../case/lockCase";
```

**Built-in Node modules — с `node:` prefix:**

```typescript
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
```

**`__dirname` / `__filename` отсутствуют в ESM** — резолви через `import.meta.url`:

```typescript
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
```

**Top-level `await` разрешён** в ESM — используй для bootstrap initialization.

**`require()` НЕДОСТУПЕН.** Если нужен dynamic CommonJS require — `createRequire(import.meta.url)`.

## 5. Build, dev, scripts

```jsonc
// package.json scripts (минимум)
{
  "scripts": {
    "build": "tsc",
    "build:assets": "node -e \"require('node:fs').cpSync('src/voices/defaults','dist/voices/defaults',{recursive:true})\"",
    "build:all": "npm run build && npm run build:assets",
    "dev": "tsx watch src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "smoke": "tsx scripts/smoke.ts",
    "postinstall": "bash scripts/build-native-helpers.sh"
  },
  "engines": { "node": ">=22" }
}
```

- **`tsc`** — production build. Не SWC (нет JIT-decorators / Nest IoC concerns).
- **`tsx`** — dev / scripts без compile step. Replaces `ts-node`.
- **`vitest run`** — однократный прогон, exit code разпространяется в CI.
- **Static assets** (prompts, templates) копируются в `dist/` явно — `tsc` их не подхватывает.

## 6. CLI argument parsing

Канонически — `commander` (или `yargs` / `nanoarg` если зависимости минимизировать). Один `Command` инстанс в `src/index.ts`, sub-commands декларируются явно:

```typescript
// src/index.ts
#!/usr/bin/env node
import { Command } from "commander";
import { caseOpen, caseContinue, caseLock } from "./cli/case.js";
import { setupAuth } from "./cli/setup.js";

const program = new Command();
program.name("loom").version(readPackageJsonVersion());

const caseCmd = program.command("case");
caseCmd
  .command("open")
  .description("Open a new case")
  .option("--idea <text>", "Idea text")
  .option("--from <path>", "Import from existing draft")
  .action(async (opts) => {
    const exitCode = await caseOpen(opts);
    process.exit(exitCode);
  });

program.command("setup").action(async () => {
  process.exit(await setupAuth());
});

program.parseAsync().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

**Exit codes — explicit и meaningful:**

| Code | Semantics |
|---|---|
| `0` | Success |
| `1` | Generic failure (user error, missing input, etc.) |
| `2` | Configuration / preflight failure (env var unset, dependency missing) |
| `>2` | Domain-specific (документировать в `--help` или README) |

**Anti-pattern:** `process.exit()` глубоко в handler-функциях. Только entrypoint exit'ит — handlers возвращают exit code.

## 7. Subprocess orchestration via `execa`

Любая команда внешней программы — через `execa`, не `child_process.spawn` напрямую. `execa` даёт нормальный Promise API, default `shell: false` (нет injection), structured stderr/stdout.

```typescript
import { execa } from "execa";

// One-shot command with output capture
const result = await execa("git", ["rev-parse", "HEAD"], {
  cwd: projectPath,
  reject: false,           // don't throw on non-zero exit
});
if (result.exitCode !== 0) {
  return { ok: false, reason: result.stderr.trim() };
}
const sha = result.stdout.trim();

// Long-running subprocess with streaming
const child = execa("ralphex", ["--plan", planPath], {
  cwd: projectPath,
  stdio: ["pipe", "pipe", "pipe"],
});
child.stdout?.on("data", (chunk) => progress(chunk.toString()));
const exit = await child;
```

**Правила:**
- **`shell: false`** by default. Если шеллу действительно нужны переменные / pipes / glob — переписать на explicit args.
- **`reject: false`** когда non-zero exit — это data, не exception.
- **Timeouts** для unbounded subprocesses через `{ timeout: ms }` или внешний `AbortController`.
- **`cwd: <projectPath>`** явно, не полагаться на `process.cwd()`.
- **Native helpers** (Go probes, etc.) — же подход. Pre-check `command -v` в startup, fail-loud если binary отсутствует.

## 8. File I/O & state files

CLI tools обычно хранят state на диске. Это hot zone — race conditions при параллельных запусках, partial writes при сбое, file locking edge cases.

**Atomic writes — обязательно для всех state files:**

```typescript
// src/util/atomicWrite.ts
import writeFileAtomic from "write-file-atomic";

export async function atomicWrite(filePath: string, data: string): Promise<void> {
  await writeFileAtomic(filePath, data, { encoding: "utf8" });
}
```

`write-file-atomic` пишет в temp файл рядом, fsync'ит, rename'ит. На большинстве файловых систем rename — atomic, что гарантирует readers либо старое, либо новое — никогда partial.

**File locks — для multi-process safety:**

```typescript
// pattern из loom: separate lockfile per resource, with PID + bootId + machineId identity
import fs from "node:fs/promises";

async function acquireLock(lockPath: string, identity: LockIdentity): Promise<LockReleaser> {
  // Best-effort: lockfile exists → check identity → maybe re-acquire (stale)
  // Cross-platform real flock(2) requires native helper (Go probe pattern, §17).
  // ...
}
```

**Pattern for state migration** (когда формат state.json меняется между версиями):

```typescript
// src/<domain>/migrate.ts
const MIGRATIONS: Migration[] = [
  { from: 1, to: 2, run: (data) => ({ ...data, newField: "default" }) },
  { from: 2, to: 3, run: (data) => renameField(data, "old", "new") },
];

async function loadAndMigrate(path: string): Promise<State> {
  const raw = await fs.readFile(path, "utf8");
  let data = JSON.parse(raw);
  for (const m of MIGRATIONS) {
    if (data.schemaVersion === m.from) data = m.run(data);
  }
  // schemaVersion now matches CURRENT_VERSION
  return data;
}
```

Migrations — version-stamped (`schemaVersion` field в state), idempotent, applied in order. Записывать обратно — через `atomicWrite`.

## 9. Signal handling & graceful shutdown

CLI orchestrator, который может быть прерван (Ctrl+C), требует cleanup. Loom's pattern:

```typescript
// src/orchestrator/sigHandler.ts (sketch)
const releasers = new Set<() => Promise<void>>();
let shuttingDown = false;

export function registerCleanup(fn: () => Promise<void>) {
  releasers.add(fn);
}

export function installSignalHandlers(ctx: { runlogPath: string }) {
  const handler = async (sig: string) => {
    if (shuttingDown) return;        // idempotent — repeat signals = no-op
    shuttingDown = true;

    // Cleanup order (per D27 spec):
    // 1. Stop accepting new mutations
    // 2. Flush pending
    // 3. Atomic state.md write (best-effort)
    // 4. Runlog session_end (best-effort)
    // 5. Run all registered releasers (lockfile unlink, etc.)
    // 6. Exit

    for (const release of releasers) {
      try { await release(); } catch { /* swallow — exit must complete */ }
    }
    process.exit(130);  // 128 + SIGINT(2)
  };

  process.on("SIGINT", handler);
  process.on("SIGTERM", handler);
}
```

**Правила:**
- **`process.on(...)`, не `process.once(...)`** — repeat signals во время cleanup должны быть no-op, не re-trigger handler.
- **Cleanup releasers — best-effort.** Misbehaving releaser НЕ должен блокировать exit.
- **Exit code 130** для SIGINT (128 + 2), 143 для SIGTERM (128 + 15) — POSIX convention.
- **Order matters:** сначала stop accepting new work, потом persist current state, потом release locks, потом exit.

## 10. Module boundaries (kind-based DAG)

5-layer DAG из `UNIVERSAL_CORE.md` §1 применима к CLI, просто наполнение слоёв другое:

| Kind | Examples (loom) | Может импортировать |
|---|---|---|
| **shared** | `util/` (hash, uuid, atomicWrite, redaction, normalize) | shared |
| **infra** | `config/`, `tools/` (thin wrappers вокруг execa / SDK / fs) | shared, infra |
| **domain** | `case/`, `evidence/`, `voices/`, `migrations/` | shared, infra, domain |
| **orchestration** | `orchestrator/` (asyncLoop, dialogLoop, ralphexRun, sigHandler) | shared, infra, domain |
| **adapter** | `cli/` (commander wiring), `repl/` (interactive shell) | shared, infra, domain |

**Три forbidden directions** те же:
- adapter ✗ orchestration: `cli/` не вызывает `orchestrator/` напрямую, а через domain entry-point
- orchestration ✗ adapter: orchestrator не печатает в stdout напрямую — через callback `progress` или structured events
- adapter ✗ adapter: cli не импортирует repl и наоборот — оба входят через domain

Для маленьких CLI tools (<5 модулей) DAG может collapse до 2-3 слоёв (util / domain / cli). Это OK — но порядок зависимостей всё равно должен быть acyclic.

## 11. Cross-module imports

**Loom использует относительные cross-module imports** (`import { x } from "../other-module/file.js"`) **без public.ts barrel** и **без TypeScript path aliases**. Это работает, но имеет цену: переименование модуля = ручной find-replace по всем callers.

**Когда применять `@/` aliases (рекомендация kit core §1.5):**
- 10+ модулей в `src/`
- Многоразовые refactor'ы границ
- Команда >1 разработчика

**Loom currently: 13 модулей, single developer, relative imports.** Pragmatic for sample size = 1. Если проект растёт — переход на aliases оправдан.

**Если переходить на aliases:**

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  }
}
```

Vitest подхватит автоматически (через [vite-tsconfig-paths](https://github.com/aleclarson/vite-tsconfig-paths) plugin или vitest's built-in tsconfig support).

**Kit baseline:** новый CLI проект — стартует с aliases day-1 (per UNIVERSAL_CORE §11). Существующий с relative imports — baseline'ит current state, конвертирует cleanup-on-touch.

## 12. Testing — Vitest 2.x

**Минимальный `vitest.config.ts`:**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    testTimeout: 10_000,           // дольше default 5s для subprocess tests
    hookTimeout: 10_000,
    pool: "forks",                  // process isolation для subprocess + fs tests
    poolOptions: { forks: { singleFork: false } },
  },
});
```

Если конфиг минимальный — loom вообще обходится без `vitest.config.ts`, Vitest подхватывает `test/**/*.test.ts` автоматически. Зависит от complexity.

**Test layout — mirror src:**

```
test/case/lock.test.ts  ← tests src/case/lock.ts
test/orchestrator/dialogLoop.test.ts
test/util/hash.test.ts
```

**Test import pattern (без aliases — loom-style):**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { acquireCaseLock } from "../../src/case/lock.js";  // relative из test/
```

Если используешь aliases — `import { acquireCaseLock } from "@/case/lock.js"`.

**Fixture pattern — temp dir per test, cleanup в afterEach:**

```typescript
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let workDir: string;

beforeEach(async () => {
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), "myproj-test-"));
});

afterEach(async () => {
  await fs.rm(workDir, { recursive: true, force: true });
});

it("does the thing", async () => {
  // ... use workDir as scratch space, NEVER share between tests
});
```

**Critical:** `fs.mkdtemp` + `fs.rm` per test — не shared global temp. Иначе `pool: "forks"` параллельные тесты будут racing.

**Vitest mock patterns** (отличается от Jest):

```typescript
import { vi } from "vitest";

// Module mock — hoisted, factory must be pure
vi.mock("execa", () => ({
  execa: vi.fn(async () => ({ exitCode: 0, stdout: "", stderr: "" })),
}));

// Spy on real implementation
const spy = vi.spyOn(fs, "readFile").mockResolvedValueOnce("mocked content");
```

**No `jest.mock` factory pattern caveats** (как в SWC-based Jest setup на the NestJS host) — Vitest ESM подход чище: vi.mock factory is module-scoped, не closure-captured.

## 13. Linting

**Loom использует:** Prettier + tsc strict. **Нет ESLint.** Это **personal project tradeoff** — discipline через TS strict + manual review.

**Kit recommendation:** ESLint flat config — strongly recommended для projects с 5+ модулей или team >1. Minimal flat config (Node CLI):

```javascript
// eslint.config.mjs
import tseslint from "typescript-eslint";
import sonarjs from "eslint-plugin-sonarjs";

export default tseslint.config(
  {
    files: ["src/**/*.ts"],
    languageOptions: { parserOptions: { project: "./tsconfig.json" } },
    plugins: { sonarjs },
    rules: {
      "sonarjs/cognitive-complexity": ["warn", 15],
      "max-lines": ["warn", { max: 600, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["warn", { max: 80 }],
      "max-depth": ["warn", 5],
      "max-params": ["warn", 8],
    },
  },
);
```

Без ESLint — `npm run lint:boundaries` и `lint:arch` из kit unusable (они принимают ESLint JSON output). Compensation:
- TS strict + extra strictness ловит significant subset нарушений
- `dependency-cruiser` (см. §15) ловит boundary cycles без ESLint
- Manual code review через ralphex — financial backstop

**Prettier config (loom-style):**

```jsonc
// .prettierrc.json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100
}
```

## 14. Cognitive complexity / file LOC thresholds

Thresholds из UNIVERSAL_CORE §2 применимы as-is. CLI кода обычно меньше чем серверного (нет controllers + DTOs + endpoint layers) — у loom большинство файлов <300 LOC.

| Metric | Warn | Notes |
|---|---|---|
| Cognitive complexity per fn | 15 | loom: orchestrator/dialogLoop.ts около границы — кандидат для facade |
| Cyclomatic complexity per fn | 20 | |
| File LOC | 600 | loom: 3 файла приближаются (case/state.ts ~580) |
| Function LOC | 80 | |
| Nesting depth | 5 | |
| Constructor params | 8 | CLI редко классы с DI — обычно factory functions |

**CLI-specific exception:** main CLI entrypoint (`src/index.ts`) часто длинный из-за commander wiring (40+ sub-commands → один файл с большой кучей `.action(...)` registrations). Это **mapping/config файл** в смысле UNIVERSAL_CORE §2.2 — низкая cognitive complexity, высокий LOC = OK.

## 15. Dependency-cruiser config

Применим к CLI без изменений. Минимальный `.dependency-cruiser.cjs` для CLI:

```javascript
module.exports = {
  forbidden: [
    { name: "no-circular", severity: "error", from: {}, to: { circular: true } },
    {
      name: "adapter-no-orchestration",
      severity: "error",
      from: { path: "^src/cli/" },
      to: { path: "^src/orchestrator/" },
    },
    {
      name: "orchestration-no-adapter",
      severity: "error",
      from: { path: "^src/orchestrator/" },
      to: { path: "^src/(cli|repl)/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
  },
};
```

CI gate:

```bash
npx dependency-cruiser --config .dependency-cruiser.cjs src/
```

## 16. Docs lint

`scripts/docs-lint.cjs` из kit `bootstrap/templates/scripts/` применим. Конфигурация:

- Adapter scripts для прирости (e.g. Prisma model count) можно пропустить — для CLI нет.
- Доменно-специфичные checks (что `docs/<command>.md` существует для каждой sub-command в `src/cli/`) — добавь по аналогии с docs-lint.js patterns.

Сейчас loom не использует docs-lint (single developer). Если перейдёт в публикуемый CLI с docs — apply.

## 17. CI workflow (GitHub Actions skeleton)

```yaml
# .github/workflows/ci.yml
name: ci
on:
  push:
    branches: [test, master]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "22" }

      # If native helpers (Go) involved
      - uses: actions/setup-go@v5
        with: { go-version: "1.22" }

      - run: npm ci
      - run: npm run build
      - run: npm test

      # Architecture gates (when ESLint setup is in place)
      - run: npx dependency-cruiser --config .dependency-cruiser.cjs src/
      - run: node scripts/check-cross-module-relative-imports.cjs --ci
      - run: node scripts/architecture-diff-guard.cjs --base ${{ github.event.pull_request.base.sha || 'origin/master' }}

      # Docs (optional)
      - run: node scripts/docs-lint.cjs
```

**Каждая job blocking:** any non-zero exit fails the PR.

## 18. Native helpers via postinstall

Some CLI features require things Node can't do natively (e.g. real `flock(2)` cross-platform behavior). Pattern: вендорить source, build via postinstall, fail soft если toolchain отсутствует.

```bash
# scripts/build-native-helpers.sh
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v go >/dev/null 2>&1; then
  printf 'warning: Go not found; native helpers unavailable.\n' >&2
  exit 0          # soft fail — npm install still succeeds
fi

mkdir -p bin
go build -o bin/<helper-name> ./bin/<helper-name>.go
echo "built bin/<helper-name> ($(go version))"
```

```jsonc
// package.json
{
  "scripts": { "postinstall": "bash scripts/build-native-helpers.sh" }
}
```

**Runtime checks:**

```typescript
// src/tools/<helper>.ts
import path from "node:path";
import fs from "node:fs/promises";

const HELPER_PATH = path.resolve(__dirname, "../../bin/<helper-name>");

export async function callHelper(args: string[]) {
  try {
    await fs.access(HELPER_PATH, fs.constants.X_OK);
  } catch {
    throw new Error(
      `Native helper missing at ${HELPER_PATH}. ` +
      `Install Go and re-run 'npm install', or use the fallback path.`
    );
  }
  // ... execa call
}
```

## 19. Identity & baseline migration

Применяется canonical identity model из `bootstrap/templates/scripts/README.md` §"Identity contract":

- Identity = `<file>:<rule>:<target>` (line-stable, v1.1.1 canonical)
- Cross-module: `<file>:cross-module-import:<importPath>`
- Legacy normalization auto at read time

**CLI projects часто маленькие** (1-3K LOC), baseline'ы compact (10-50 entries обычно). Migration impact minimal.

## 20. Ralphex pipeline

Применим без изменений — ralphex stack-agnostic, работает с любым тестовым runner. Конфигурация в `.ralphex/`:

- `~/.config/ralphex/agents/*.txt` — review prompts (universal)
- `.ralphex/prompts/finalize.txt` — project-local: убедись что финал команда `npm test` (не `npm run test:e2e` если нет e2e)
- Для CLI обычно нет separate e2e suite — `vitest run` покрывает unit + integration

## 21. Anti-patterns (CLI-specific)

| Anti-pattern | Почему плохо | Альтернатива |
|---|---|---|
| `child_process.spawn` напрямую вместо `execa` | Manual stdio handling, race conditions, no shell-escape safety | `execa` всегда |
| Sync filesystem APIs (`fs.readFileSync`) в hot path | Блокирует event loop, тормозит concurrent operations | `fs/promises` |
| `fs.writeFile` без atomic | Partial writes при SIGKILL → corrupted state | `write-file-atomic` или manual temp+rename |
| `process.exit()` в библиотечном коде | Невозможно тестировать, не cleanup'ит | Return exit code → exit ОДИН раз в entrypoint |
| `require()` в ESM проекте | Не работает | `import` или `createRequire(import.meta.url)` |
| Forgetting `.js` в internal imports | Runtime error в production | Lint rule или manual discipline |
| `path.join(__dirname, ...)` без `fileURLToPath` в ESM | `__dirname` undefined → runtime error | `fileURLToPath(import.meta.url)` boilerplate |
| Shared global temp dir в тестах | Параллельные тесты racing, flaky CI | `fs.mkdtemp(...)` per test, `afterEach` cleanup |
| `process.on("SIGINT", ...)` через `once` | Repeat signal во время cleanup re-trigger'ит handler | `on(...)` + idempotent closure flag |
| Long-running subprocess без timeout / AbortController | Hung CI, runaway processes | `{ timeout }` или explicit cancellation |
| State migration без `schemaVersion` field | Не знаешь к какой версии применять transform | Stamp version в каждом state file |

## 22. References

- **loom** (source of this overlay): `~/project_it/loom` — production CLI orchestrator, 803 vitest cases, single developer, ESM Node 22, real-world subprocess + state-file patterns
- **typescript-nestjs.md**: backend-heavy stack (NestJS + Prisma + HTTP). Don't conflate — patterns не transferable bi-directionally
- **UNIVERSAL_CORE.md**: kit invariants одинаково применимы (DAG, cognitive complexity, baseline mechanic, ralphex pipeline)
- **bootstrap/templates/scripts/README.md**: identity contract v1.1.1 — same canonical format для CLI baselines
- **Vitest docs**: https://vitest.dev/ — особенно ESM mock patterns
- **execa docs**: https://github.com/sindresorhus/execa
- **write-file-atomic docs**: https://github.com/npm/write-file-atomic
- **commander docs**: https://github.com/tj/commander.js
