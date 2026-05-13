# Overlay — TypeScript + NestJS

> **Stack:** NestJS 11 + Prisma 7 + TypeScript strict + SWC + ESLint 9 (flat) + sonarjs + Jest (SWC) + Vitest (UI если есть).
> **Производный от:** Portiqa OS (production-validated).
> **Audience:** LLM (primary developer: Claude Code).
> **Канон:** `UNIVERSAL_CORE.md`. Этот файл — implementation reference для TS+NestJS стека.

---

## 1. Версии и dependencies

### 1.1 Обязательные базовые зависимости

```jsonc
{
  "dependencies": {
    "@nestjs/common": "^11.0.0",
    "@nestjs/core": "^11.0.0",
    "@nestjs/platform-express": "^11.0.0",
    "@nestjs/config": "^4.0.0",
    "@prisma/client": "^7.6.0",
    "@prisma/adapter-pg": "^7.6.0",
    "pg": "^8.13.0",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.15.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.0",
    "@nestjs/schematics": "^11.0.0",
    "@nestjs/testing": "^11.0.0",
    "@swc/cli": "^0.5.0",
    "@swc/core": "^1.9.0",
    "@swc/jest": "^0.2.37",
    "@types/jest": "^29.5.0",
    "@types/node": "^22.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "dependency-cruiser": "^16.0.0",
    "eslint": "^9.0.0",
    "eslint-plugin-boundaries": "^6.0.0",
    "eslint-plugin-prettier": "^5.0.0",
    "eslint-plugin-sonarjs": "^3.0.0",
    "jest": "^29.7.0",
    "prettier": "^3.3.0",
    "prisma": "^7.6.0",
    "ts-node": "^10.9.0",
    "tsconfig-paths": "^4.2.0",
    "typescript": "^5.5.0",
    "typescript-eslint": "^8.0.0"
  }
}
```

### 1.2 Без `@nestjs/mapped-types`

DTOs пишем вручную (manual fields), без `PartialType` / `OmitType` / `PickType` helpers. Они менее предсказуемы для LLM при больших схемах.

### 1.3 Без unified `radix-ui` (если UI)

Использовать individual packages: `@radix-ui/react-dialog`, `@radix-ui/react-select`, etc.

### 1.4 Contracts tooling (closes core §1.5)

Для TS+NestJS контракты в `contracts/`:

| Что | Tool | Где живёт |
|---|---|---|
| REST request/response | **Zod** schema (`z.object(...)`) → derive `z.infer` types для DTOs | `contracts/api/<resource>.ts` |
| Event payloads | **Zod** schema | `contracts/events/<event>.ts` |
| External webhooks (Channex, Telnyx, etc.) | **Zod** schema | `contracts/webhooks/<provider>.ts` |
| Internal cross-module interfaces | TypeScript `interface` | `contracts/interfaces/<name>.ts` (или `<shared-module>/interfaces/`) |

Install:
```bash
npm install zod
```

Use в controllers:
```typescript
import { CreateOrderRequest } from '@/contracts/api/orders';
import { z } from 'zod';

export class OrdersController {
  @Post()
  create(@Body() body: z.infer<typeof CreateOrderRequest>) {
    const parsed = CreateOrderRequest.parse(body);  // runtime validation
    // ...
  }
}
```

---

## 2. Project tree shape

```
<project>/
├── api/                           # NestJS backend
│   ├── src/
│   │   ├── <module-name>/
│   │   │   ├── <module-name>.module.ts      # NestJS DI wiring
│   │   │   ├── <module-name>.service.ts     # facade (≤80 LOC методы)
│   │   │   ├── <module-name>.controller.ts  # если есть REST
│   │   │   ├── public.ts                    # barrel export
│   │   │   ├── dto/                         # DTOs (class-validator)
│   │   │   ├── internal/                    # sub-services (private)
│   │   │   │   └── <subdomain>.service.ts
│   │   │   ├── __tests__/                   # test fixtures (если есть)
│   │   │   └── *.spec.ts                    # unit tests рядом с файлами
│   │   ├── common/                          # shared kind
│   │   │   ├── interfaces/                  # cross-kind interfaces
│   │   │   ├── events/                      # domain-events.ts
│   │   │   └── types/
│   │   ├── contracts/                       # if used — Zod schemas, OpenAPI
│   │   ├── prisma/
│   │   │   └── prisma.service.ts
│   │   ├── auth/
│   │   ├── health/
│   │   └── main.ts                          # bootstrap
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── test/
│   │   ├── jest-e2e.config.js
│   │   └── *.e2e-spec.ts
│   ├── scripts/                             # docs-lint, arch-report, etc.
│   ├── eslint.config.mjs                    # flat config
│   ├── .dependency-cruiser.cjs
│   ├── .swcrc                               # SWC transform config
│   ├── .boundary-baseline.json              # zero-baseline gate
│   ├── .cross-module-import-baseline.json
│   ├── package.json
│   ├── tsconfig.json
│   └── jest.config.js
└── ui/                            # React frontend (опционально)
    └── ...
```

---

## 3. `.gitignore` template

```gitignore
# Node
node_modules/
*.log
*.tsbuildinfo

# Builds
dist/
build/
.next/
.nuxt/

# Env
.env
.env.local
.env.*.local

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/

# Test
coverage/
*.lcov

# Prisma
api/prisma/generated/

# Ralphex
.ralphex/progress/
.ralphex/worktrees/

# SWC cache
.swcrc.tmp
```

---

## 4. Tooling install

```bash
# Inside <project>/api/
npm init -y
npm install <core deps из §1.1>
npm install -D <devDeps из §1.1>

# Bootstrap NestJS
npx @nestjs/cli new . --skip-git --skip-install --package-manager npm
# (если выше уже создан package.json — собрать вручную)

# Prisma
npx prisma init
# Отредактировать prisma/schema.prisma и api/prisma.config.ts
```

---

## 5. TypeScript + SWC configs

### 5.1 `api/tsconfig.json`

```jsonc
{
  "compilerOptions": {
    "module": "commonjs",
    "moduleResolution": "node10",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "target": "ES2022",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./src",
    "paths": {
      "@/*": ["./*"]
    },
    "rootDir": "./src",
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "strictBindCallApply": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 5.2 `api/.swcrc` (для @swc/jest и nest build)

```json
{
  "$schema": "https://swc.rs/schema.json",
  "sourceMaps": true,
  "jsc": {
    "target": "es2022",
    "baseUrl": "./src",
    "paths": { "@/*": ["./*"] },
    "parser": {
      "syntax": "typescript",
      "decorators": true,
      "dynamicImport": true
    },
    "transform": {
      "legacyDecorator": true,
      "decoratorMetadata": true
    }
  },
  "module": {
    "type": "commonjs"
  }
}
```

### 5.3 `api/jest.config.js`

```js
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': '@swc/jest' },
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};
```

---

## 6. ESLint flat config (`api/eslint.config.mjs`)

```javascript
import tseslint from 'typescript-eslint';
import eslintPluginPrettier from 'eslint-plugin-prettier/recommended';
import sonarjs from 'eslint-plugin-sonarjs';
import boundaries from 'eslint-plugin-boundaries';

// Modules with public.ts barrel — external imports must go through @/{module}/public
const MODULES_WITH_PUBLIC_API = [
  // populate per project — список модулей с public.ts
];

// 5 kinds + mixed (transitional only) — per §1 core
const MODULE_KINDS = {
  shared: ['common', 'config', 'prisma', 'auth', 'health'],
  infra: ['websocket', 'embedding', 'rag', 'metrics', 'dlq'],
  domain: [/* business entities */],
  orchestration: [/* brain/execution/workflows/scheduler/actions */],
  adapter: [/* external integrations */],
  mixed: [/* transitional, not classified */],
};

export default tseslint.config(
  { ignores: ['dist/**', 'prisma/**', 'eslint.config.mjs', 'node_modules/**'] },
  ...tseslint.configs.recommended,
  eslintPluginPrettier,
  {
    plugins: { sonarjs },
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/ban-ts-comment': ['error', {
        'ts-ignore': 'allow-with-description',
        minimumDescriptionLength: 10,
      }],

      // ── §2 Cognitive budget (6 порогов) ──
      'sonarjs/cognitive-complexity': ['warn', 15],
      complexity: ['warn', 20],
      'max-lines': ['warn', { max: 600, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['warn', { max: 80, skipBlankLines: true, skipComments: true }],
      'max-depth': ['warn', 5],
      'max-params': ['warn', 8],
    },
  },
  // Tests exemption: длинные тестовые setup'ы OK
  {
    files: ['test/**', '**/*.spec.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'sonarjs/cognitive-complexity': 'off',
      complexity: 'off',
      'max-depth': 'off',
      'max-params': 'off',
    },
  },

  // ── Module boundaries (§1 core, 3 forbidden directions) ──
  {
    files: ['src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': Object.entries(MODULE_KINDS).flatMap(([kind, mods]) =>
        mods.map((mod) => ({ type: kind, pattern: `src/${mod}/**` }))
      ),
      'boundaries/include': ['src/**/*'],
    },
    rules: {
      'boundaries/element-types': ['warn', {
        default: 'disallow',
        rules: [
          { from: 'shared', allow: ['shared'] },
          { from: 'infra', allow: ['shared', 'infra'] },
          { from: 'domain', allow: ['shared', 'infra', 'domain'] },
          { from: 'orchestration', allow: ['shared', 'infra', 'domain'] },
          { from: 'adapter', allow: ['shared', 'infra', 'domain'] },
          // mixed — not enforced, transitional
          { from: 'mixed', allow: ['shared', 'infra', 'domain', 'orchestration', 'adapter', 'mixed'] },
        ],
      }],
    },
  },

  // ── Public API enforcement — no-restricted-imports per module ──
  {
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.spec.ts', 'src/**/*.module.ts'],
    rules: {
      'no-restricted-imports': ['warn', {
        patterns: MODULES_WITH_PUBLIC_API.map((mod) => ({
          group: [`@/${mod}/!(public)`, `@/${mod}/!(public)/**`],
          message: `External imports of ${mod} module must go through @/${mod}/public`,
        })),
      }],
    },
  },
);
```

---

## 7. dependency-cruiser config (`api/.dependency-cruiser.cjs`)

```javascript
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ── §1 core: 3 forbidden directions ──
    {
      name: 'adapter-not-import-orchestration',
      comment: 'Adapter must not import orchestration (use EventEmitter2)',
      severity: 'warn',
      from: { path: '^src/(channex|telnyx|meta-whatsapp|resend|elevenlabs|stripe|push)/' },
      to: { path: '^src/(brain|execution|workflows|scheduler|actions|skills|agents|auto-approval)/' },
    },
    {
      name: 'orchestration-not-import-adapter',
      comment: 'Orchestration must not import adapter (use interfaces in common/)',
      severity: 'warn',
      from: { path: '^src/(brain|execution|workflows|scheduler|actions|skills|agents|auto-approval)/' },
      to: { path: '^src/(channex|telnyx|meta-whatsapp|resend|elevenlabs|stripe|push)/' },
    },
    {
      name: 'adapter-not-import-adapter',
      comment: 'Adapter must not import another adapter (each isolated)',
      severity: 'warn',
      from: { path: '^src/(channex|telnyx|meta-whatsapp|resend|elevenlabs|stripe|push)/' },
      to: { path: '^src/(channex|telnyx|meta-whatsapp|resend|elevenlabs|stripe|push)/', pathNot: '$1' },
    },

    // ── Cycles (mandatory) ──
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependency detected',
      from: {},
      to: { circular: true },
    },

    // ── Shared layer guard ──
    {
      name: 'shared-not-import-upper-layers',
      comment: 'shared can only import from shared',
      severity: 'warn',
      from: { path: '^src/(common|config|prisma|auth|health)/' },
      to: { path: '^src/(?!common|config|prisma|auth|health)' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: './tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};
```

Запуск: `npx depcruise src --config .dependency-cruiser.cjs`.

---

## 8. Path alias setup

В `tsconfig.json` + `.swcrc` + `jest.config.js` все используют `@/*` → `./src/*`. Это даёт:

| Импорт | Что значит |
|---|---|
| `@/{module}/public` | External имп через barrel (ENFORCED для модулей в `MODULES_WITH_PUBLIC_API`) |
| `@/common/interfaces/X` | Cross-kind interfaces |
| `./internal/X` | Только внутри модуля |
| `../other-module/X` | ❌ запрещено (`lint:imports`) |

---

## 9. Command map (9 gate-categories per §4.2 core)

| # | Категория | Команда |
|---|---|---|
| 1 | Format check | `npm run format:check` |
| 2 | Quality linter | `npm run lint` |
| 3 | Module boundaries | `npm run lint:boundaries` |
| 4 | Public API | (часть `npm run lint`, через `no-restricted-imports`) |
| 5 | Cross-module imports | `npm run lint:imports:ci` |
| 6 | Dependency cycles | `npm run deps:check` |
| 7 | Diff-scoped arch guard | `npm run lint:arch:diff` |
| 8 | Docs lint | `npm run lint:docs` |
| 9 | Tests + Build | `npm test && npm run build` |

### 9.1 package.json scripts (минимум)

```jsonc
{
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:prod": "node dist/main",

    "format": "prettier --write \"{src,apps,libs,test}/**/*.ts\"",
    "format:check": "prettier --check \"{src,apps,libs,test}/**/*.ts\"",

    "lint": "eslint \"{src,apps,libs,test}/**/*.ts\"",
    "lint:fix": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix",
    "lint:boundaries": "eslint \"src/**/*.ts\" --no-fix --format json 2>/dev/null | node scripts/boundary-check.cjs",
    "lint:boundaries:update-baseline": "eslint \"src/**/*.ts\" --no-fix --format json 2>/dev/null | node scripts/boundary-check.cjs --update",
    "lint:imports": "node scripts/check-cross-module-relative-imports.cjs",
    "lint:imports:ci": "node scripts/check-cross-module-relative-imports.cjs --ci",
    "lint:imports:update-baseline": "node scripts/check-cross-module-relative-imports.cjs --update",
    "lint:arch": "eslint \"src/**/*.ts\" --no-fix --format json 2>/dev/null | node scripts/arch-report.cjs",
    "lint:arch:diff": "node scripts/architecture-diff-guard.cjs",
    "lint:docs": "node scripts/docs-lint.cjs",
    "deps:check": "depcruise src --config .dependency-cruiser.cjs",

    "test": "jest",
    "test:watch": "jest --watch",
    "test:e2e": "jest --config ./test/jest-e2e.config.js",

    "prisma:generate": "prisma generate",
    "prisma:migrate:dev": "prisma migrate dev",
    "prisma:migrate:deploy": "prisma migrate deploy"
  }
}
```

Скрипты `scripts/{boundary-check,arch-report,architecture-diff-guard,docs-lint,check-cross-module-relative-imports}.cjs` берутся из template (`bootstrap/templates/scripts/`). Они stack-agnostic в логике, но используют npm/Node для запуска. **`.cjs` extension** обязателен для compatibility с ESM-default host projects (`"type": "module"` в package.json).

---

## 10. PrismaService pattern (Prisma 7)

> **Prisma 7 removed Rust query engine.** Используется driver adapter (`@prisma/adapter-pg` + `pg.Pool`).

### 10.1 Schema (`api/prisma/schema.prisma`)

```prisma
generator client {
  provider = "prisma-client-js"
  // No binaryTargets, no previewFeatures для Prisma 7
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Все модели: @id с gen_random_uuid()
model Example {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  createdAt DateTime @default(now()) @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @db.Timestamptz(6)
  // ...
}
```

### 10.2 PrismaService (`api/src/prisma/prisma.service.ts`)

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly pool: Pool;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is required');
    }
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    super({ adapter });
    this.pool = pool;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }
}
```

### 10.3 Standalone scripts (backfill, migration helpers)

Standalone scripts (вне NestJS) создают свой Pool + adapter:

```typescript
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    // logic
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
```

### 10.4 Runtime import path

```typescript
// Prisma 7 переименовал runtime path:
import { Prisma } from '@prisma/client/runtime/client';  // ✅
// НЕ:
import { Prisma } from '@prisma/client/runtime/library'; // ❌ (Prisma 6 path)
```

---

## 11. Transaction-aware outbox pattern

При записи в outbox внутри `$transaction` — двух-этапный pattern, иначе outbox row пишется ВНЕ tx boundary:

```typescript
// Внутри $transaction:
const { record, shouldEmit } = await outboxService.enqueueInTx(tx, data);

// ПОСЛЕ commit транзакции:
if (shouldEmit) {
  outboxService.emitEnqueued(data); // wake-up hint для processor
}
```

| Method | Когда |
|---|---|
| `enqueueInTx(tx, data)` | Внутри `$transaction` — пишет через `tx` |
| `emitEnqueued(data)` | После commit — EventEmitter2 hint |
| `enqueue(data)` | Standalone (не в tx) — root PrismaService + emit вместе |

**Anti-pattern:** использовать `enqueue()` внутри `$transaction` — записывается ВНЕ tx boundary, при rollback outbox остаётся.

---

## 12. NestJS-specific patterns

### 12.1 `public.ts` barrel

```typescript
// api/src/<module>/public.ts
export { <Module>Service } from './<module>.service';
export type { <Public>Dto } from './dto/<public>.dto';
export { <ENUM_NAME> } from './types';
// НЕ экспортировать internal/* — приватная реализация
```

External code: `import { FooService } from '@/foo/public';`

### 12.2 `forwardRef` для circular dependencies между модулями

Когда два модуля ссылаются друг на друга на module-level (DI wiring):

```typescript
@Module({
  imports: [forwardRef(() => OtherModule)],
  providers: [...],
  exports: [...],
})
export class FooModule {}
```

Накопленная боль (Portiqa): 15+ forwardRef pairs было, сейчас сокращены до ~10. Если можешь обойтись событиями (`EventEmitter2`) — лучше events, чем forwardRef.

### 12.3 `@Global()` bridge modules

Когда shared layer нужен токен из upper layer:

```typescript
// api/src/common/<feature>-bridge/<feature>-bridge.module.ts
@Global()
@Module({
  imports: [<UpperModuleThatExportsToken>],
  providers: [{ provide: <TOKEN>, useExisting: <UpperService> }],
  exports: [<TOKEN>],
})
export class <Feature>BridgeModule {}
```

**Внести в `docs/reference/architecture-exemptions.md`** с обоснованием. Без записи bridge невалиден.

### 12.4 `ModuleRef.resolve` для DB-resolved providers

Когда provider создаётся динамически (например, agent registry с DB config):

```typescript
@Injectable()
export class AgentRegistryService {
  constructor(private moduleRef: ModuleRef) {}

  async getBrain(agentName: string): Promise<IBrain> {
    const config = await this.loadConfig(agentName);
    return this.moduleRef.resolve(config.brainClass, undefined, { strict: false });
  }
}
```

### 12.5 `Scope.TRANSIENT` для services с per-request state

```typescript
@Injectable({ scope: Scope.TRANSIENT })
export class AgenticBrain implements IBrain {
  // state living per resolve() call
}
```

Использовать осторожно — больше memory pressure.

### 12.6 NestJS 11 + Express 5 specifics

- `app.set('query parser', 'extended')` в `main.ts` для backward-compat parsing.
- `reactRouterV7BrowserTracingIntegration` для Sentry (если есть React + Sentry).

---

## 13. Test patterns

### 13.1 SWC `jest.mock()` factories — self-contained

`@swc/jest` агрессивно поднимает `jest.mock()` ABOVE imports. Factory **не может ссылаться на outer scope**:

```typescript
// ❌ Сломается:
const mockFn = jest.fn();
jest.mock('module', () => ({ doSomething: mockFn }));

// ✅ Правильно:
jest.mock('module', () => ({
  doSomething: jest.fn(),
}));
// После import:
import { doSomething } from 'module';
const mock = doSomething as jest.Mock;
```

### 13.2 ESM packages (jest.mock обязателен)

Если используются ESM-only packages (`mindee`, `mrz-fast`, etc.) — в spec'ах обязательно `jest.mock('package-name')`:

```typescript
jest.mock('mindee'); // top of file
jest.mock('mrz-fast');
```

Иначе SWC падает на import ESM в CommonJS режиме.

### 13.3 Integration test setup

```typescript
import { Test } from '@nestjs/testing';

describe('<Module>', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        FooService,
        { provide: BarService, useValue: createMockBar() },
        { provide: PrismaService, useValue: createMockPrisma() },
      ],
    }).compile();
  });

  // tests...
});
```

### 13.4 E2E config (`api/test/jest-e2e.config.js`)

```javascript
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.e2e-spec.ts$',
  transform: { '^.+\\.(t|j)s$': '@swc/jest' },
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/../src/$1' },
  globalSetup: '<rootDir>/global-setup.ts',
  testTimeout: 30000,
};
```

`global-setup.ts` обычно вызывает `npx prisma migrate deploy` на test database.

---

## 14. CI workflow skeleton (`.github/workflows/ci.yml`)

```yaml
name: CI

on:
  push:
    branches: [main, test]
  pull_request:

env:
  NODE_VERSION: '22'

jobs:
  format-and-lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }   # для diff-guard нужен полный history
      - uses: actions/setup-node@v4
        with: { node-version: ${{ env.NODE_VERSION }}, cache: npm, cache-dependency-path: api/package-lock.json }
      - run: cd api && npm ci
      - run: cd api && npx prisma generate
      - run: cd api && npm run format:check
      - run: cd api && npm run lint
      - run: cd api && npm run lint:imports:ci
      - run: cd api && npm run lint:boundaries
      - run: cd api && npm run deps:check
      - run: cd api && npm run lint:docs

  arch-diff-guard:
    # diff-scoped guard — agent-driven check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: ${{ env.NODE_VERSION }}, cache: npm, cache-dependency-path: api/package-lock.json }
      - run: cd api && npm ci
      - run: cd api && npx prisma generate
      - run: cd api && npm run lint:arch:diff

  test:
    needs: format-and-lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: ${{ env.NODE_VERSION }}, cache: npm, cache-dependency-path: api/package-lock.json }
      - run: cd api && npm ci
      - run: cd api && npx prisma generate
      - run: cd api && npm test

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: ${{ env.NODE_VERSION }}, cache: npm, cache-dependency-path: api/package-lock.json }
      - run: cd api && npm ci
      - run: cd api && npx prisma generate
      - run: cd api && npm run build

  e2e:
    needs: [format-and-lint, test, build]
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: test
        ports: ['5432:5432']
        options: --health-cmd pg_isready
      redis:
        image: redis:7
        ports: ['6379:6379']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: ${{ env.NODE_VERSION }}, cache: npm, cache-dependency-path: api/package-lock.json }
      - run: cd api && npm ci
      - run: cd api && npx prisma generate
      - run: cd api && npm run test:e2e
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test
          REDIS_URL: redis://localhost:6379

  # security: см. §17 (mandatory security job — secret scan, CVE, SAST, license check)
  # Promotion to master = отдельный workflow с workflow_dispatch (manual)
```

**Note:** полный CI skeleton выше показывает обязательные jobs. Дополнительный `security:` job см. §17.3 (добавляется в тот же `.github/workflows/ci.yml`).

---

## 15. Plan template stack-specific commands

В `docs/plans/active/<pack>-<slug>.md` финальные задачи (Verify acceptance criteria + Update documentation) содержат stack-specific commands:

```markdown
### Task N: Verify acceptance criteria
- [ ] run `cd api && npm run format:check`
- [ ] run `cd api && npm run lint`
- [ ] run `cd api && npm run lint:imports:ci`
- [ ] run `cd api && npm run lint:boundaries`
- [ ] run `cd api && npm run deps:check`
- [ ] run `cd api && npm run lint:arch:diff`
- [ ] run `cd api && npm test`
- [ ] run `cd api && npm run build`

### Task N+1: Update documentation
- [ ] update root `CLAUDE.md` if patterns changed
- [ ] run `cd api && npm run lint:docs`
- [ ] if Prisma model added/removed: `cd api && npm run docs:update-counts`
- [ ] if plan lifecycle changed: update `docs/plans/ROADMAP.md`
```

---

## 16. Anti-patterns (TS+NestJS-specific)

### Imports
- ❌ `import { X } from '@/{module}/internal-file'` когда есть `public.ts` (используй `@/{module}/public`)
- ❌ `import { X } from '../other-module/X'` (cross-module relative — запрещено, см. `lint:imports`)
- ❌ `import { Prisma } from '@prisma/client/runtime/library'` (Prisma 6 path — устарел)
- ❌ `import * as X from 'cjs-package'` (SWC interop ломается, используй `import X from 'cjs-package'`)

### NestJS
- ❌ Использовать `@nestjs/mapped-types` (`PartialType`/`OmitType`/`PickType`) — пишем DTOs вручную для предсказуемости
- ❌ `forwardRef` ради «удобства» — если можешь через `EventEmitter2`, делай events
- ❌ `@Global()` без обоснования в `architecture-exemptions.md`
- ❌ Создание bridge module без entry в exemptions

### Prisma
- ❌ Использовать `outboxService.enqueue()` внутри `$transaction` (не tx-aware, пишет вне boundary)
- ❌ Standalone script без своего `Pool` + `PrismaPg` adapter (использует root PrismaService снаружи NestJS — ломает соединение)
- ❌ `binaryTargets` или `previewFeatures` в schema.prisma (Prisma 7 не нужно)

### Tests
- ❌ `jest.mock()` factory с outer-scope ref'ом (SWC поднимает выше imports → undefined)
- ❌ ESM package без `jest.mock('package')` (`mindee`, `mrz-fast`, etc.)
- ❌ E2E без globalSetup для миграций (БД не готова → тест падает)

### TypeScript
- ❌ `// @ts-ignore` без описания ≥10 символов (ESLint блокирует)
- ❌ `noImplicitAny: false` или `strictNullChecks: false` в tsconfig
- ❌ Использовать `any` для `tools` interface в AI SDK v6 → `Record<string, any>` (минимально)

---

## 17. Security tooling (closes core §14)

> **Core §14 mandates** secret scan + CVE check + SAST + license check. Here are the concrete tools and CI commands.

### 17.1 Tool selection — deterministic install

Все security tools — **dev dependencies или first-party CI actions**, не global brew/pip installs (которые ломают CI определённость).

| Category | Tool | Install |
|---|---|---|
| Secret scan | **gitleaks** | CI: action `gitleaks/gitleaks-action@v2`. Local: `brew install gitleaks` (developer-only). |
| Dependency CVE | **npm audit** | Built-in `npm audit`. Не требует install. |
| SAST | **semgrep** | CI: action `returntocorp/semgrep-action@v1`. Local: `brew install semgrep` ИЛИ `pipx install semgrep`. |
| License check | **license-checker** | `npm install -D license-checker` → `npx license-checker ...` (использует local node_modules, не global). |

**Critical:** не использовать `npm install -g` или `pip install` для CI — это создаёт hidden global state. CI должна работать только с tools available via:
1. Repo dev dependencies (`npm ci` устанавливает) → `npx <tool>`
2. GitHub Actions native (`uses: <action>@<version>`)

### 17.2 Commands

Add to `api/package.json`:

```jsonc
{
  "scripts": {
    "security:cve": "npm audit --omit=dev --audit-level=high",
    "security:licenses": "license-checker --production --excludePrivatePackages --failOn 'GPL;AGPL;LGPL;CPOL;EPL;MPL'"
  },
  "devDependencies": {
    "license-checker": "^25.0.1"
  }
}
```

Secret scan и SAST запускаются через GitHub Actions natively в CI (см. §17.3) — local-only они не required, потому что pre-commit hook уже ловит secret leak (см. §17.4).

### 17.3 CI job (append to `.github/workflows/ci.yml`)

```yaml
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }

      # Secret scan via official action (no local install needed)
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm
          cache-dependency-path: api/package-lock.json
      - run: cd api && npm ci          # installs license-checker as devDep

      - run: cd api && npm run security:cve
      - run: cd api && npm run security:licenses

      # SAST via official action (no local install needed)
      - uses: returntocorp/semgrep-action@v1
        with:
          config: auto
```

### 17.4 ENV management

- `.env` in `.gitignore` (already in §3)
- `.env.example` committed with placeholder values: `DATABASE_URL=postgresql://user:pass@host/db`
- Production secrets: managed secret store (Railway env / Vault / Doppler / AWS Secrets Manager) — never in repo

---

## 18. Observability tooling (closes core §15)

> **Core §15 mandates** structured JSON logger + error tracker + health endpoint + redaction (when production deployment). Here are TS+NestJS-specific tools.

### 18.1 Tool selection (recommended)

| Category | Tool | Install |
|---|---|---|
| Structured logger (replace `console.log`) | **NestJS Logger + JSON transport** (custom) or **pino** | `npm install pino pino-pretty` |
| Error tracker | **Sentry** | `npm install @sentry/nestjs` |
| Health endpoint | **@nestjs/terminus** | `npm install @nestjs/terminus` |
| Log redaction | **pino redact** option or custom Logger interceptor | included in pino |
| (Conditional) LLM tracing | **LangFuse / Helicone** | `npm install langfuse` (LangFuse) |

### 18.2 Logger setup (pino example)

`api/src/common/logger/logger.module.ts`:

```typescript
import { LoggerModule } from 'nestjs-pino';

LoggerModule.forRoot({
  pinoHttp: {
    level: process.env.LOG_LEVEL ?? 'info',
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token', '*.email'],
      remove: true,
    },
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: () => `,"time":"${new Date().toISOString()}"`,
  },
});
```

### 18.3 Sentry integration

`api/src/main.ts`:

```typescript
import * as Sentry from '@sentry/nestjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  beforeSend(event) {
    // Redact sensitive context
    if (event.request?.headers) {
      delete event.request.headers.authorization;
      delete event.request.headers.cookie;
    }
    return event;
  },
});
```

### 18.4 Health endpoint

Terminus не имеет встроенного `PrismaHealthIndicator` (built-in только `TypeOrmHealthIndicator` / `MongooseHealthIndicator` / `MicroserviceHealthIndicator` / `HttpHealthIndicator` etc.). Реализуем кастомный indicator поверх Prisma:

`api/src/health/prisma-health.indicator.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class PrismaHealthIndicator extends HealthIndicator {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async pingCheck(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return this.getStatus(key, true);
    } catch (err) {
      throw new HealthCheckError(
        `Prisma ping failed`,
        this.getStatus(key, false, { message: err?.message }),
      );
    }
  }
}
```

`api/src/health/health.controller.ts`:

```typescript
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { PrismaHealthIndicator } from './prisma-health.indicator';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: PrismaHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database'),
    ]);
  }
}
```

`api/src/health/health.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { PrismaHealthIndicator } from './prisma-health.indicator';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [PrismaHealthIndicator],
})
export class HealthModule {}
```

### 18.5 ENV variables (`api/.env.example`)

```
SENTRY_DSN=https://<your>@<sentry-org>.ingest.sentry.io/<project-id>
LOG_LEVEL=info
NODE_ENV=production
```

---

## 19. LLM cost discipline (closes core §19)

> **Core §19** mandates per-request cap + per-feature daily budget + per-tenant isolation + cost tracking storage + alerts + regression CI gate (if LLM in product runtime). Concrete TS+NestJS implementation:

### 19.1 Tracing layer (recommended)

| Tool | When |
|---|---|
| **LangFuse** (open-source, self-host) | Default choice; built-in budgets + dashboards + alerts |
| **Helicone** (SaaS, drop-in proxy) | Если нужен zero-setup и SaaS OK |
| **OpenLLMetry** + Sentry AI | OTel-based, integrates with existing observability stack |

Install LangFuse client:
```bash
npm install langfuse
```

### 19.2 Cost storage (durable, atomic, per core §19)

Postgres counter via Prisma — survives restart, atomic via `$transaction`. Schema:

```prisma
model CostCounter {
  feature   String
  tenantId  String   @default("default")
  date      String   // YYYY-MM-DD UTC
  totalUsd  Decimal  @db.Decimal(12, 6)
  updatedAt DateTime @updatedAt

  @@id([feature, tenantId, date])
}
```

Increment-and-check pattern (TS+NestJS):

```typescript
@Injectable()
export class CostBudgetService {
  constructor(private readonly prisma: PrismaService) {}

  async checkAndIncrement(opts: {
    feature: string;
    tenantId: string;
    costUsd: number;
    budgetUsd: number;
  }): Promise<{ allowed: boolean; totalUsd: number }> {
    const date = new Date().toISOString().slice(0, 10);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.costCounter.upsert({
        where: { feature_tenantId_date: { feature: opts.feature, tenantId: opts.tenantId, date } },
        update: { totalUsd: { increment: opts.costUsd } },
        create: { feature: opts.feature, tenantId: opts.tenantId, date, totalUsd: opts.costUsd },
      });
      return {
        allowed: row.totalUsd.toNumber() <= opts.budgetUsd,
        totalUsd: row.totalUsd.toNumber(),
      };
    });
  }
}
```

### 19.3 Tenant guard

Derive tenant from server-side auth (Clerk / Auth0 / custom), never user input:

```typescript
@Injectable()
export class TenantContextService {
  constructor(@Inject(REQUEST) private readonly req: Request) {}

  getTenantIdOrFail(): string {
    const tenantId = this.req.user?.tenantId; // populated by ClerkAuthGuard
    if (!tenantId) {
      throw new ForbiddenException('Missing tenant context — LLM call rejected');
    }
    return tenantId;
  }
}
```

### 19.4 Regression CI gate

`api/scripts/cost-regression.js` reads `.cost-regression.json`, compares eval cost vs base ref, fails CI on threshold breach без plan-metadata approval. Implementation per project — same pattern as docs-lint script.

### 19.5 ENV vars

```
LLM_DAILY_BUDGET_USD=50           # per feature, override per-feature in code
LLM_MAX_INPUT_TOKENS=8000
LLM_MAX_OUTPUT_TOKENS=2000
LANGFUSE_PUBLIC_KEY=...
LANGFUSE_SECRET_KEY=...
LANGFUSE_HOST=https://cloud.langfuse.com
```

---

## 20. Codebase map generator (closes core §18)

> **Core §18 requires** generated `docs/reference/codebase-map.md`. Here is the TS+NestJS-specific generator.

### 19.1 Script (`api/scripts/generate-codebase-map.js`)

Node.js >=18, **built-ins only** (no shell pipelines, no placeholders). Parses module-routing.md **as a structured table**, not regex matching against arbitrary text — prevents false matches when module names share fragments (e.g. `booking` vs `booking-events`).

**Default behavior: FAIL on missing routing or unregistered modules.** Pass `--allow-unknown` only for initial scaffolding before routing is filled.

```javascript
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SRC = path.join(__dirname, '..', 'src');
const ROUTING = path.join(__dirname, '..', '..', 'docs', 'reference', 'module-routing.md');
const OUTPUT = path.join(__dirname, '..', '..', 'docs', 'reference', 'codebase-map.md');
const HOT_DAYS = 30;
const TOP_HOT = 10;
const ALLOW_UNKNOWN = process.argv.includes('--allow-unknown');

// ─── Parse module-routing.md as a structured table (exact match, not regex on text) ──
//
// Expected format in module-routing.md:
//   ## Module table
//   | Module | Kind | Status |
//   |---|---|---|
//   | brain | orchestration | active |
//   | thread | domain | active |
//   | cases | domain | frozen-pending-transform |
//   ...
//
// Tables outside the "Module table" section are ignored. Adapt header detection
// per project's routing-map structure.
function parseRouting() {
  if (!fs.existsSync(ROUTING)) {
    if (ALLOW_UNKNOWN) {
      console.warn(`Warning: ${ROUTING} not found — generating map without kind/status (--allow-unknown set).`);
      return new Map();
    }
    console.error(`Error: ${ROUTING} not found. Required for codebase-map. Use --allow-unknown for initial scaffolding.`);
    process.exit(1);
  }
  const content = fs.readFileSync(ROUTING, 'utf8');
  const lines = content.split('\n');
  const result = new Map(); // module-name (exact) → { kind, status }

  // Find the module table by header. Adapt heading text per project convention.
  const TABLE_HEADER = /^##\s+(Module (?:routing )?table|Modules)\b/i;
  let inTable = false;
  let inDataRows = false;
  for (const line of lines) {
    if (TABLE_HEADER.test(line)) {
      inTable = true;
      inDataRows = false;
      continue;
    }
    if (!inTable) continue;
    if (/^##\s+/.test(line) && !TABLE_HEADER.test(line)) {
      inTable = false; // entered next section
      continue;
    }
    if (/^\|\s*-+/.test(line)) {
      inDataRows = true; // separator row → data starts next line
      continue;
    }
    if (!inDataRows) continue;
    if (!line.startsWith('|')) {
      inDataRows = false;
      continue;
    }
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 3) continue;
    const [moduleName, kind, status] = cells;
    if (!moduleName || moduleName === 'Module') continue; // skip header row if re-encountered
    result.set(moduleName, {
      kind: kind || 'unknown',
      status: status || 'active',
    });
  }
  return result;
}

function listModules() {
  return fs.readdirSync(SRC, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function moduleLoc(name) {
  const dir = path.join(SRC, name);
  let count = 0;
  (function walk(p) {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      const full = path.join(p, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && /\.ts$/.test(e.name) && !/\.spec\.ts$/.test(e.name)) {
        count += fs.readFileSync(full, 'utf8').split('\n').length;
      }
    }
  })(dir);
  return count;
}

function hasPublic(name) {
  return fs.existsSync(path.join(SRC, name, 'public.ts'));
}

// ─── Hot files via Node-only git log parsing ──
function hotFiles(days, top) {
  const log = execSync(`git log --since="${days} days ago" --name-only --pretty=format:`, { encoding: 'utf8' });
  const counts = new Map();
  for (const line of log.split('\n')) {
    if (!line || !/\.ts$/.test(line) || /\.spec\.ts$/.test(line)) continue;
    counts.set(line, (counts.get(line) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, top);
}

// ─── Build map (with FAIL on unregistered modules unless --allow-unknown) ──
const routing = parseRouting();
const modules = listModules();
const unregistered = modules.filter((m) => !routing.has(m));

if (unregistered.length > 0 && !ALLOW_UNKNOWN) {
  console.error(`Error: ${unregistered.length} modules in src/ have no entry in ${ROUTING}:`);
  for (const m of unregistered) console.error(`  - ${m}`);
  console.error(`\nAdd them to the module routing table, or pass --allow-unknown for scaffolding.`);
  process.exit(1);
}

const rows = modules.map((m) => {
  const r = routing.get(m) || { kind: '?', status: '?' };
  return `| ${m} | api/src/${m}/ | ${r.kind} | ${r.status} | ${moduleLoc(m)} | ${hasPublic(m) ? 'yes' : 'no'} |`;
});
const hot = hotFiles(HOT_DAYS, TOP_HOT);

const content = `# Codebase Map

> Last generated: ${new Date().toISOString().slice(0, 10)} by \`scripts/generate-codebase-map.js\`
> Source of truth: live filesystem + git log + \`docs/reference/module-routing.md\`. Do NOT edit by hand.

## Module index

| Module | Path | Kind | Status | LOC | Public |
|---|---|---|---|---|---|
${rows.join('\n')}

## Hot files (last ${HOT_DAYS} days, top ${TOP_HOT})

| Commits | File |
|---|---|
${hot.map(([f, c]) => `| ${c} | ${f} |`).join('\n')}
`;

fs.writeFileSync(OUTPUT, content);
console.log(`Generated ${OUTPUT} (${modules.length} modules, ${hot.length} hot files).`);
```

Add to `package.json`:
```jsonc
{
  "scripts": {
    "codebase-map": "node scripts/generate-codebase-map.js"
  }
}
```

Run: `cd api && npm run codebase-map`.

---

## 21. Docs lint script (closes core §5.2)

> **Core §5.2 mandates** docs lint as one of 9 gates. Stack-specific implementation lives in `api/scripts/docs-lint.cjs`.

Реальная реализация в Portiqa — `api/scripts/docs-lint.cjs` (~300 строк Node.js без deps). Проверки:

| Check | Implementation |
|---|---|
| Model count | `(schema.prisma matches /^model /).length === parseInt(dataModel match)` |
| Controller coverage | Each `*.controller.ts` имеет секцию в `api-endpoints.md` |
| Env vars | Каждый `process.env.X` from source → запись в `env-variables.md` |
| Module verification dates | Каждый `modules/*.md` имеет `> Последняя верификация: YYYY-MM-DD` ≤2 месяца |
| Plans structure | `plans/active/*` ссылаются на drafts; ROADMAP consistency |
| Broken relative links | All `[X](Y)` resolve |
| Session size | warn if `docs/SESSION.md` >100 lines |

Скрипт template — `bootstrap/templates/scripts/docs-lint.cjs` (TODO: к Iteration 3).

`api/package.json`:
```jsonc
{
  "scripts": {
    "lint:docs": "node scripts/docs-lint.cjs"
  }
}
```

---

## 22. Cleanup-on-touch fail (closes core §4.3)

> **Core §4.3 mandates** cleanup-on-touch when editing a file with baselined violations. Diff-scoped guard в этом overlay должен **FAIL** не warn если такой файл изменён без fix.

### 22.1 Architecture diff guard logic (identity-based, NOT count-based)

`api/scripts/architecture-diff-guard.cjs` (template: `bootstrap/templates/scripts/architecture-diff-guard.cjs`):

**Identity model (v1.1.1, canonical across all 3 scripts):** для каждого violation формируется identity `<file>:<rule>:<target>`. Для boundary `<rule>` = ESLint rule id (`no-restricted-imports`, `boundaries/element-types`); для cross-module relative imports `<rule>` = literal `cross-module-import`, `<target>` = import path. **`line` НЕ входит в identity** — иначе вставка кода выше существующего violation сдвигает все строки и diff-guard видит phantom-новые violations. Comparison против baseline — по identity, не counts. Legacy формы (v1.0 с line; v1.1 cross-module brief без rule segment) нормализуются при чтении (`normalizeBoundaryBaselineEntry` / `normalizeImportBaselineEntry`); полная регенерация через `--update`.

**Rules:**

| Случай | Result |
|---|---|
| Changed file **не в baseline**, имеет current violations | FAIL (любая new identity) |
| Changed file **в baseline**, current identities ⊃ baseline (новые добавлены) | FAIL |
| Changed file в baseline, current identities = baseline (нет reduction) | FAIL (cleanup-on-touch не сработал) |
| Changed file в baseline, current identities ⊊ baseline (strict subset) | PASS (cleanup-on-touch satisfied) |
| Changed file в baseline, fix-one-introduce-another (same count, different identities) | **FAIL** (новая identity ≠ removed identity) |

Covers BOTH baselines: `.boundary-baseline.json` (linter-detected) + `.cross-module-import-baseline.json` (regex-detected `../*` imports).

**Examples (v1.1.1 canonical identity, no `line` segment):**

```text
baseline for foo.ts = { "foo.ts:boundaries/element-types:@/bar/internal" }
current for foo.ts  = { "foo.ts:boundaries/element-types:@/bar/internal" }
→ FAIL (no reduction; same identity present)

baseline = { "foo.ts:rule-A:target-X" }
current  = { "foo.ts:rule-A:target-Y" }
→ FAIL (fix-one-introduce-another: new identity not in baseline)

baseline = { "foo.ts:rule-A:target-X", "foo.ts:rule-B:target-Y" }
current  = { "foo.ts:rule-B:target-Y" }
→ PASS (strict subset, X removed, no new identities)

baseline = { "foo.ts:cross-module-import:../bar/x" }
current  = { "foo.ts:cross-module-import:../bar/x" }  // shifted from line 5 to line 47
→ PASS (line shifts do not affect identity)
```

Legacy baselines (v1.0 with line, v1.1 brief cross-module) auto-normalize at read time; see [scripts/README.md](../bootstrap/templates/scripts/README.md) "Identity contract" for the full migration table.

### 22.2 CI job

```yaml
  arch-diff-guard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }   # need history for diff vs base ref
      - uses: actions/setup-node@v4
        with: { node-version: ${{ env.NODE_VERSION }}, cache: npm, cache-dependency-path: api/package-lock.json }
      - run: cd api && npm ci
      - run: cd api && npx prisma generate
      - run: cd api && npm run lint:arch:diff
        # exit 0 — pass (no diff, OR cleanup-on-touch satisfied OR no new identities)
        # exit 1 — FAIL (new identity OR cleanup-on-touch not satisfied for touched baselined file)
```

### 22.3 Hook update

`.claude/hooks/post-edit-lint.sh` (in this project) проверяет baseline и предупреждает inline. Но **финальный enforcement** — это `arch-diff-guard` в CI: hook informs, CI gates.

---

## 23. Связанные документы

- `UNIVERSAL_CORE.md` — universal principles
- `bootstrap/greenfield.md` — start new project (использует commands из этого overlay)
- `bootstrap/brownfield.md` — apply discipline к legacy TS+NestJS проекту
