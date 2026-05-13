# LLM Discipline Kit — Backlog

> Items, не вошедшие в v1.x. Берём по мере появления реального проекта на этом стеке / сценарии.

## Overlays (нужен реальный проект как референс)

Без реального проекта на стеке абстракция = imagination. Поэтому overlays добавляются только когда первый проект на этом стеке появляется в работе.

| Overlay | Status | Триггер для добавления | Что извлечено / нужно извлечь |
|---|---|---|---|
| `typescript-nestjs` | **Done** | extracted из Portiqa | NestJS 11 + Prisma 7 + Express 5 + SWC + ESLint flat + sonarjs + Jest + boundary plugin + dep-cruiser |
| `typescript-node-cli` | **Done** (2026-05-13) | extracted из loom | ESM Node 22 + Vitest 2 + commander + execa + write-file-atomic + tsc-only + native helpers via postinstall + signal handling + state-file migrations |
| `python-fastapi` | Pending | первый Python backend проект | ruff config, mypy strict, pytest, alembic migrations, dependency-injection (FastAPI Depends vs DI library), boundary-checker под Python imports |
| `python-aiogram` | Pending | первый Telegram bot | ruff/mypy, aiogram routers, FSM patterns, single-file vs modular layout, deployment (poetry vs uv), test harness без real Telegram |
| `go-stdlib` | Pending | первый Go проект | golangci-lint config, package layout (cmd/internal/pkg), interface boundaries, table-driven tests, vet/staticcheck integration |
| `next-react` | Pending | first frontend SSR project | Next.js app/pages router conventions, RSC vs client boundaries, ESLint flat config under Next, Tailwind/CSS-in-JS, build/SSR cache validation |
| `serverless-worker` | Pending | first Lambda / CF Workers / Vercel Functions project | bundle size limits, cold-start budget, env-injection patterns, observability через provider-native logs, no-shared-state enforcement, deploy as gate |

## Templates / scripts

| Item | Решение |
|---|---|
| `cost-regression.js` template | **Hold.** Упоминается в `overlays/typescript-nestjs.md` §19.4 + `core/details/cost-discipline.md`, но реализация project-specific (зависит от провайдера billing API + cost dimensions). Оставлено как «implement per stack» с примером. Если 2+ projects начнут реализовывать одно и то же — вынести в template. |
| Adapter scripts для Python (Ruff) / Go (golangci-lint) / Rust (Clippy) | **Hold.** README scripts описывает adapter contract; конкретные скрипты добавим вместе с соответствующим overlay. Без overlay контекст adapter'а не определён. |

## Open questions (non-blocker для v1)

| Question | Раздел | Текущее решение | Когда reopen |
|---|---|---|---|
| Plan template variations (refactor / feature / migration / bug-fix) | core §17 | Универсальный template достаточен — refactor/feature/migration отличаются содержимым задач, не структурой. Bug-fix может быть отдельным lightweight подформатом. | Если ralphex parser начнёт choke'аться на bug-fix-shaped плане, или iteration tracking покажет что variants реально упрощают LLM работу. |

## Validation backlog (важное)

| Task | Status | Notes |
|---|---|---|
| Real-world apply on second project (loom) | **Partial — 2026-05-13** | Kit скопирован в `loom/llm-kit/`, Claude Code на loom правильно identified missing overlay → triggered creation of `typescript-node-cli.md`. Confirmed kit's known gap (TS/Nest-only), confirmed overlay-extraction loop работает. **Full 13-step bootstrap НЕ прогонялся** — applied partially. |
| Real-world greenfield bootstrap test (13 шагов end-to-end) | Pending | Throwaway project, ни одного раза не прогонялся целиком. |
| Real-world brownfield bootstrap test (legacy не-Portiqa) | Pending | Brownfield mechanic проверен только на Portiqa с already-discipline. На cold legacy может вскрыться missing step. |

Smoke-test harness (`tests/`) частично закрывает risks — но automated synthetic tests ≠ human bootstrap experience.

## Codex round-5 findings — вердикты

| Finding | Decision | Iteration |
|---|---|---|
| Unstable baseline identities (line-included) | **Fixed** in v1.1 (architecture-diff-guard + check-cross-module) → fully closed in v1.1.1 (boundary-check + canonical alignment across all 3 scripts) | v1.1 → v1.1.1 |
| Cleanup-on-touch absolute → escape hatch | **Rejected by design** — see §4.3 «No escape hatch by design». Любой формальный escape hatch becomes default. | n/a |
| Universal = TS/Nest-first → нужны overlays | **Acknowledged**, в backlog (см. таблицу выше). Не блокирует v1. | future |
| Smoke-test harness | **Implemented** в v1.1 (12 unit + 6 integration); расширен в v1.1.1 до 26 unit + 7 integration с boundary-check coverage | v1.1 → v1.1.1 |
| Operator profile separation (Gurgen-mode vs universal core) | **Rejected by design** — see шапка `UNIVERSAL_CORE.md` «Operator profile». Premature abstraction под гипотетический use case. | n/a |

## Real-world findings — loom ESM compat (v1.2.1)

Second pass на loom (после initial sync) выявил critical compat bug — kit был не usable в ESM-default host projects.

| Finding | Decision | Iteration |
|---|---|---|
| Kit template scripts (`scripts/*.js`) и tests (`tests/*.test.js`) используют CommonJS `require()`, но в host projects с `"type": "module"` Node treat'ит `.js` файлы как ESM → `ReferenceError: require is not defined`. Smoke harness в Portiqa (CommonJS host) bug не ловил. | **Fixed** в v1.2.1 — все kit-internal `.js` файлы переименованы в `.cjs` (5 scripts + 2 tests). `run-smoke.sh` pattern `*.test.js` → `*.test.cjs`. Все require paths внутри tests updated. README scripts contract section updated с примечанием про ESM compat. Both overlay'и (typescript-nestjs / typescript-node-cli) обновлены чтобы npm scripts examples использовали `.cjs`. Smoke 26/26 в обоих host modes verified. | v1.2.1 |

## Real-world findings — loom (v1.2)

Первое применение kit на чужом TS+Node CLI проекте. Подтвердило known gap (kit ранее был TS/Nest-only) и проверило overlay-extraction loop.

| Finding | Decision | Iteration |
|---|---|---|
| Kit не имел overlay для ESM Node CLI стека (loom: Vitest+commander+execa, без NestJS/Prisma/HTTP) | **Fixed** — создан `overlays/typescript-node-cli.md` (709 LOC, 22 секции) extracted из реального loom кода. Pattern: ESM imports с `.js` extension, commander CLI parsing, execa subprocess, write-file-atomic state, signal handling с idempotent cleanup, schemaVersion-based state migrations, native helpers via postinstall (Go probe pattern), Vitest 2.x с fork pool, tmpdir-per-test fixtures | v1.2 |
| Loom использует relative cross-module imports без public.ts (`../other-module/file.js`) — нарушает kit core §11 | **Acknowledged with guidance** — overlay §11 описывает trade-off: для <10 модулей + single dev relative OK; >10 модулей или team — переход на `@/` aliases. Kit baseline mechanic применим к обоим. | v1.2 |
| Loom не использует ESLint (только Prettier + tsc strict) → `lint:boundaries` и `lint:arch` из kit scripts unusable без adapter | **Acknowledged with workaround** — overlay §13 даёт minimal ESLint flat config как recommendation; альтернатива — TS strict + dependency-cruiser + ralphex review без linter-output-based scripts | v1.2 |

## Codex round-6 findings — вердикты (v1.1.1)

После v1.1 был обнаружен incomplete closure пункта 1 + два sibling риска.

| Finding | Decision | Iteration |
|---|---|---|
| `boundary-check.js` идентичность всё ещё line-based (`<file>:<line>:<rule>`) | **Fixed** — переведён на canonical `<file>:<rule>:<target>` с `extractTarget` (msg.target → quoted message → ruleId fallback). +9 unit cases в smoke harness, включая regression test для line-shift. | v1.1.1 |
| `scripts/README.md` documents old line-included identity → опасно для adapter writers | **Fixed** — README Identity contract section полностью переписан под v1.1.1 canonical + добавлена таблица legacy → canonical normalization для 5 форматов. | v1.1.1 |
| Cross-module identity inconsistency между `check-cross-module-relative-imports.js` (`<file>:<importPath>`) и `architecture-diff-guard.js` (`<file>:cross-module-import:<importPath>`) → architecture-diff-guard не matches `.cross-module-import-baseline.json` от check-cross-module | **Fixed** — оба перешли на canonical `<file>:cross-module-import:<importPath>`. `architecture-diff-guard` теперь имеет два явных normalize функций (`normalizeBoundaryBaselineEntry` / `normalizeImportBaselineEntry`), `baselineIdentitiesForFile` принимает `kind` параметр. | v1.1.1 |
