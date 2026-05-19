# Универсальное архитектурное ядро (LLM Discipline Kit)

> **Источник:** извлечено из internal NestJS platform.
> **Цель:** применять во всех будущих и существующих проектах (vibe-coding с LLM).
> **Audience:** LLM (формат — agent instructions: triggers, protocols, anti-patterns).
> **Primary developer:** Claude Code (Anthropic). **External reviewer:** Codex (OpenAI) через ralphex Phase 3.
> **Статус:** v1.3 — 2026-05-13. **First successful brownfield bootstrap on a non-NestJS-host project** (loom, 12/13 шагов pushed, baselines 194/12/0). 6-й universal kit script — `dep-cruiser-baseline.cjs` (extracted from loom). `brownfield.md` §5.3a добавлен prettier mass-normalize pattern (75 файлов normalized без regressions). Smoke 31/31. v1.2.1 (ESM `.cjs` fix) + v1.2 (second overlay typescript-node-cli) + v1.1.1 (canonical identity across all scripts) — все foundation stays intact.
> **Принцип:** оптимизация под чтение LLM (не путаться при росте кодовой базы) + автоматическая защита от регрессий.

> **Operator profile (by design, не abstracted):** kit предполагает связку **Claude Code (primary) + ralphex (orchestrator) + Codex (external reviewer)**. Это **осознанный выбор стека**, не временное допущение, и core invariants намеренно не абстрагированы от него. Замена этой тройки потребует переписать §6 (CLAUDE.md), §7 (Ralphex pipeline), §15.1 (review pipeline). Не reopen'ить как «universal kit должен быть tool-agnostic» в Codex review rounds — premature abstraction под гипотетический use case.

## Portability — это portable kit

Этот kit можно скопировать в любой проект целиком одной директорией. Все internal cross-references — **kit-root-relative** (без `docs/` префикса):

```
<kit-root>/                            ← положи куда удобно (обычно <project>/docs/llm-kit/)
├── UNIVERSAL_CORE.md                  ← этот файл (hot-path, читай ВСЕГДА первым)
├── BACKLOG.md                         ← открытые items / future overlays / Codex round verdicts
├── core/
│   └── details/                       ← load-on-demand по триггеру (не каждую сессию)
│       ├── memory.md                  ← §10 details
│       ├── skills.md                  ← §12 details
│       ├── hooks.md                   ← §13 details
│       ├── security.md                ← §14 details
│       ├── observability.md           ← §15 details
│       ├── data-migration.md          ← §16 details
│       ├── mcp.md                     ← §17 details
│       ├── codebase-map.md            ← §18 details
│       └── cost-discipline.md         ← §19 details (LLM-in-runtime projects only)
├── overlays/
│   ├── typescript-nestjs.md           ← backend stack: NestJS + Prisma + HTTP (extracted из the NestJS host)
│   ├── typescript-node-cli.md         ← CLI / orchestrator stack: ESM Node 22 + Vitest + commander + execa (extracted из loom)
│   ├── python-fastapi.md              ← (будущее, см. BACKLOG.md)
│   ├── python-aiogram.md              ← (будущее, см. BACKLOG.md)
│   └── go-stdlib.md                   ← (будущее, см. BACKLOG.md)
├── bootstrap/
│   ├── greenfield.md                  ← новый проект: zero → discipline в N шагов
│   ├── brownfield.md                  ← legacy → discipline через baselines + cleanup-on-touch
│   └── templates/
│       ├── AGENTS.md                  ← template для root AGENTS.md (external agents contract)
│       ├── DOCS_RULES.md              ← template для docs/DOCS_RULES.md
│       ├── ralphex-plan-template.md   ← parser-strict template для iteration plans
│       ├── hooks/*.sh                 ← 3 hook scripts (post-edit-lint / stop-session-check / session-start)
│       ├── scripts/*.cjs              ← 6 universal Node.js gates (boundary, arch-report, diff-guard, cross-module, dep-cruiser-baseline, docs-lint — все CommonJS .cjs, works в CJS+ESM host projects)
│       └── skills/*/SKILL.md          ← 6 universal Skills для load-on-demand
└── tests/                             ← smoke harness (защита kit'а от drift)
    ├── run-smoke.sh                   ← entrypoint
    ├── identity-stability.test.js     ← unit tests для identity model + legacy baseline normalization
    └── cross-module-detection.test.js ← integration test (spawns checker в temp fixture, регрессия для line-shift)
```

**Path style:** все internal ссылки внутри kit — kit-relative (e.g. `bootstrap/greenfield.md`, `overlays/typescript-nestjs.md`). Они валидны независимо от того, где kit развёрнут в проекте.

**Project paths** (`docs/SESSION.md`, `docs/reference/...`, `docs/plans/...`) остаются `docs/`-prefixed — это **проектная** документация, не часть kit'а.

## LLM workflow при заходе в проект

1. Прочитать `UNIVERSAL_CORE.md` (этот файл — всегда первым).
2. Прочитать `overlays/<detected-stack>.md` (если есть; если нет — следовать principles из core и предложить создать overlay).
3. Если new project → `bootstrap/greenfield.md`. Если existing legacy без discipline → `bootstrap/brownfield.md`. Если discipline уже развёрнута — skip оба.

---

## 0. Фундаментальная идея

### Проблема

При vibe-coding объём кода растёт быстрее, чем человек успевает осознавать. Без жёсткой структуры LLM начинает «путаться»: читает не то, складывает логику не туда, дублирует существующее, ломает невидимые контракты.

### Решение

1. **Архитектура как принудительная DAG.** Каждый файл — однозначное место, каждая зависимость — направлена, каждое нарушение — ловится автоматически.
2. **Claude Code = primary developer.** Память, skills, hooks встроены в workflow, не «опция».
3. **Ralphex + Codex external review = mandatory pipeline.** Независимая модель ловит то, что Claude пропускает.
4. **Документация как проектная память.** LLM заходит холодным, ориентируется за 3 файла.

### Один принцип над всем

**Maximalist discipline с day-1.** Все 9 категорий enforcement настроены с первого commit'а — даже для проекта в 100 LOC. Baseline mechanic делает это бесплатным (baseline=0 для greenfield). Когда проект растёт до 50K LOC — gates **уже работают**, никакого refactoring «потом».

Альтернатива — «start simple, harden later» — провалена опытом: refactoring из лёгкого MVP в крупный продукт стоит на порядок дороже, чем 5 минут настройки на day-1.

---

## 1. Kind-based DAG (5 слоёв, обязательно с day-1)

> **Инвариант.** 5 слоёв применяются для любого проекта любого размера — от 100 LOC бота до 500K LOC платформы. Это «over-engineering» в плохом смысле только если позже придётся мигрировать; разворачивание на day-1 — 5 минут настройки, masштабирование до банка — бесплатно.

### 1.1 Слои (kind taxonomy)

| Kind | Назначение | Может импортировать |
|---|---|---|
| **shared** | platform: config, db client, auth, health, общие типы/утилиты, contracts | shared |
| **infra** | сквозные технические сервисы: websocket, queues, embeddings, metrics, DLQ, logger | shared + infra |
| **domain** | бизнес-сущности и domain logic | shared + infra + domain |
| **orchestration** | оркестрация: brain/agent runtime, execution, scheduler, workflows, actions | shared + infra + domain |
| **adapter** | внешние интеграции: каждый провайдер изолирован | shared + infra + domain |

Маленький проект (бот 200 LOC): слои могут содержать по 1 файлу. Это нормально — структура **уже правильная** для роста.

### 1.2 Три абсолютных forbidden directions

| Откуда | Куда | Что делать вместо |
|---|---|---|
| adapter | orchestration | EventEmitter / message bus |
| orchestration | adapter | interface в `shared/common/interfaces/` |
| adapter | adapter | каждый адаптер изолирован, общение через domain/orchestration |

**Эти три направления — absolute.** Не зависят от стека, размера, языка. Нарушения должны блокировать CI (см. §4).

### 1.3 Aggregate-only модули

Composition shells (wiring, агрегация). **Не содержат бизнес-логики.** Только DI-конструкция и re-export. Помечаются как `aggregate-only` в `docs/reference/module-routing.md`.

### 1.4 Bridge modules (документированные исключения)

Когда shared layer нужно знать token upper layer (globally-injected service) — создаётся явный bridge module и вносится в `docs/reference/architecture-exemptions.md` с обоснованием. Без записи в exemptions — exemption невалиден.

Конкретный mechanic зависит от framework (NestJS `@Global()`, Spring `@Component`, Django settings injection, и т.д.). Stack-specific реализация — `overlays/<stack>.md` heading "@Global() bridge modules" (для TS+NestJS) или framework-эквивалент.

### 1.5 Contracts-first discipline

> **Если есть API surface (REST endpoint, message schema, event payload, external webhook) — типы живут в `contracts/` директории и являются source of truth.**

| Что | Где | Формат (выбирается per stack) |
|---|---|---|
| REST request/response | `contracts/api/` | Schema (Zod / Pydantic / JSON Schema / OpenAPI / Protobuf) |
| Event payloads | `contracts/events/` | Schema |
| External webhooks | `contracts/webhooks/` | Schema |
| Internal interfaces | `contracts/interfaces/` | Native type system (TypeScript interface / Python TypedDict / Go interface) |

**Правило для LLM:** новые поля **не выдумываются**. Если в контракте поля нет — добавь сначала в `contracts/`, потом в код. LLM плохо invent'ит поля, хорошо follow'ит схему.

Конкретные формат и tools — `overlays/<stack>.md` heading "Contracts tooling".

---

## 2. Когнитивный бюджет (6 порогов, день-1)

Главный «budget», на котором держится readability для LLM. Пороги — **warn**, не error (сигнал «пора декомпозировать», не блокировка работы).

### 2.1 Пороги (применимы day-1)

| Метрика | Порог | Scope |
|---|---|---|
| Cognitive complexity | **15** | per function |
| Cyclomatic complexity | **20** | per function |
| File LOC | **600** | per file (без blanks/comments) |
| Function LOC | **80** | per function |
| Nesting depth | **5** | per function |
| Constructor / function params | **8** | per signature (детектор god-service) |

**Калибровка:** TS/sonarjs baseline. Overlay может **tighten** для idiomatic language (например Python → fn 60), но **не loosen**.

### 2.2 Когда превышение OK

- **Mapping / config файлы** (enum-to-X maps, DTO definitions) — низкая cognitive complexity, размер OK.
- **Orchestrators / state machines** — могут иметь высокую cyclomatic, но **отдельные методы внутри** обязаны держать CC≤15.
- **Превышение допускается** только с inline-обоснованием: `// eslint-disable-next-line <rule> — reason: <explanation>`. Без reason — disable невалиден.

---

## 3. Паттерн декомпозиции «facade + sub-services»

### 3.1 Триггеры роста (action triggers, не «потом-разберёмся»)

Все 5 триггеров активны с day-1. На маленьком проекте просто не срабатывают.

| Триггер | Действие |
|---|---|
| Сервис ≥500 LOC + новое изменение добавляет 100+ | Декомпозиция в той же задаче (facade + sub-services) |
| 3+ метода одного subdomain в сервисе | Извлечь sub-service немедленно |
| Module достигает 10+ providers | Извлечь sub-module с barrel export |
| Constructor / function ≥8 params | God-service signal → бить по dependencies |
| Дублирование логики в 2+ местах одного слоя | Выделить shared service внутри слоя |

### 3.2 Правило новых модулей

Новый модуль стартует **сразу** как facade + минимум один sub-service, даже если sub-service один. Профилактика «add one more method» drift.

### 3.3 Public contract barrel pattern (внешний контракт модуля)

Каждый модуль с публичным API имеет **single public entrypoint** — barrel file экспортирующий только то, что разрешено импортировать снаружи. Внешний код обязан ходить через этот entrypoint, не через internal files.

Реализация per stack (`overlays/<stack>.md` heading "public.ts barrel" для TS+NestJS, или эквивалент):
- TypeScript / JavaScript: `public.ts` файл, импорт через `@/{module}/public` (path alias)
- Python: `__all__` в `__init__.py`, либо отдельный `public.py`
- Go: package boundaries (lowercase = private, uppercase = public)
- Rust: `pub` keyword + `mod.rs` re-exports

**Без public barrier** модуль не имеет «внешнего контракта» — все имена видны снаружи. На маленьком проекте OK, на большом — нарушение boundary discipline.

Linter enforcement (запрет импорта internal files когда есть public barrier) — `overlays/<stack>.md` headings "ESLint flat config" + "dependency-cruiser config" (для TS+NestJS), или эквивалент в overlay.

---

## 4. Многослойный enforcement (maximalist, day-1)

### 4.1 Философия

**Все категории enforcement обязательны с первого commit'а, независимо от размера проекта.** Это не «over-engineering» — это страховка от unknown future scale. На MVP 100 LOC проверки настроены, но почти ничего не ловят (baseline=0). При росте до 50K LOC те же проверки **уже работают**, ничего «включать позже» не нужно.

### 4.2 Обязательные категории (все blocking в CI)

Конкретные tools — `overlays/<stack>.md`. Категории — universal.

| # | Категория | Что ловит |
|---|---|---|
| 1 | **Format check** | Drift форматирования (Prettier / Black / gofmt / rustfmt) |
| 2 | **Quality linter** | Complexity rules (CC/CY/LOC/depth/params per §2) + language idiom rules |
| 3 | **Module boundaries** | DAG нарушения per §1 (3 forbidden directions) |
| 4 | **Public API enforcement** | Импорты module internals когда модуль имеет public barrier |
| 5 | **Cross-module imports** | Запрет `../other-module/*` relative imports |
| 6 | **Dependency cycles + layering** | Циклы между модулями + нарушение kind layering |
| 7 | **Diff-scoped arch guard** | Те же правила, только на changed files vs base ref (agent-driven, perf) |
| 8 | **Docs lint** | Model count / endpoints / env vars / contracts актуальны (см. §5) |
| 9 | **Tests + Build** | Поведение + типы |

### 4.3 Baseline mechanic (делает maximalist enforcement painless)

Старый долг (baseline-файл с известными нарушениями) **не блокирует**, новые нарушения **блокируют**.

- **Greenfield day-1:** все baseline-файлы инициализируются на `[]` / `0`. Любое нарушение — блокирует.
- **Brownfield day-1:** baseline-файлы фиксируют **текущее состояние** legacy. CI блокирует только **новые** нарушения.
- **Cleanup-on-touch:** при касании файла с baselined violation — обязательно исправить и обновить baseline.

Это даёт: жить с легаси без миграционных спринтов, организованно сокращать, никогда не накапливать новый долг.

> **No escape hatch by design.** Cleanup-on-touch строгий и **не имеет** «emergency exception» / «debt waiver» / «temporary skip» механизма. Baseline (для legacy при первом development) — единственная формализованная амнистия; всё остальное проходит full enforcement. Причина: любой формальный escape hatch со временем becomes default — teams скатываются в «ну в этот раз тоже исключение», и refactoring «потом» превращается в невыполненное обещание. Если правка слишком велика для cleanup'а — это сигнал что её надо разделить на 2 PR (fix + refactor), а не сигнал что нужно exception. Не reopen'ить это решение в Codex review rounds.

### 4.4 Критерий «не усугубляет ситуацию для LLM»

Каждый gate обязан удовлетворять 4 требованиям. Иначе он — **bug enforcement'а**, не code'а.

| Требование | Что значит |
|---|---|
| **Determinism** | Одинаковый input → одинаковый output. Никаких flaky tests / random failures. Flaky gate деградирует доверие → gradually ignored. |
| **Idempotent fix** | Каждое нарушение имеет deterministic single-step fix. Если LLM применила fix и lint снова кричит — это bug правила. Anti-pattern: правила вроде «code should be cleaner» без actionable detail. |
| **Speed** | Один gate <60 секунд (на один файл / diff). CI total <5 минут. Slow gate → LLM теряет state ожидания. |
| **Explicit messages** | Сообщение формата `error: <rule>: <what> at <file>:<line>. Fix: <action>`. Нет «code smell detected». |

### 4.5 AGENTS.md (formal contract для external agents)

> **Корневой `AGENTS.md`** — операционный subset правил для external agents (Codex и др.), которые читают этот файл напрямую при ralphex Phase 3.

Минимум в `AGENTS.md`:
- Architecture constraints (короткая выжимка §1-§3)
- Validation command (`lint:arch:diff` или эквивалент)
- Forbidden directions (3 abs)
- Default boundary (что НЕ читать: `business/`, `archive/`, `plans/active/completed/`)

**Canonical location:** root `AGENTS.md` (project root, **не** `docs/AGENTS.md`). Codex Phase 3 и другие external agents читают именно root copy. Если нужна копия в `docs/` — она generated-from-root или reference-only; root остаётся source of truth.

Глобальный `~/.codex/AGENTS.md` — синхронизирован с repo-level (но не противоречит).

Template для генерации: `bootstrap/templates/AGENTS.md`.

---

## 5. Документация как проектная память для LLM

LLM заходит в проект холодным. Цель — за 3 файла понять, что и куда.

### 5.1 Структура (universal + conditional)

```
docs/
  CONTEXT.md                 ← universal • entry point, ВСЕГДА читается первым
  SESSION.md                 ← universal • журнал текущей сессии (active, ≤100 строк)
  DOCS_RULES.md              ← universal • правила ведения самой документации
  BUSINESS_LOGIC.md          ← conditional • продуктовая логика (если есть продукт со сложными правилами)
  changelog/YYYY-MM.md       ← universal • месячный архив из SESSION.md
  plans/
    ROADMAP.md               ← universal • 100-150 строк, «где мы и куда»
    drafts/NN-*.md           ← universal • общие планы для обсуждения с LLM (sortable prefix)
    drafts/done/             ← universal • drafts с завершёнными итерациями (manual move)
    active/<pack>-<slug>.md  ← universal • итерационные планы (исполнимые ralphex)
    active/completed/        ← universal • auto-managed ralphex CLI
  reference/                 ← universal • canonical справочники
    module-routing.md        ← universal • карта «куда класть новую логику»
    data-model.md            ← conditional • если есть БД (Prisma/DB schema или эквивалент)
    api-endpoints.md         ← conditional • если есть REST/gRPC API
    env-variables.md         ← universal • все ENV переменные из кода
    contracts.md             ← universal • все public интерфейсы (см. §1.5 Contracts-first)
    architecture-exemptions.md ← universal • bridge modules и documented exceptions
    ralphex-plan-template.md ← universal • template для slicing draft → iteration plans
  modules/<name>.md          ← universal • по модулю, с датой верификации
  registry/                  ← conditional • каталог агентов/навыков/инструментов (если AI-проект)
  visualizations/            ← conditional • диаграммы (ERD, architecture, processes — если проект >5K LOC)
  operations/                ← universal • деплой, мониторинг, backup
  archive/                   ← universal • старые планы, не читать по умолчанию
```

**Conditional sections** создаются по триггеру (есть БД → `data-model.md`; есть API → `api-endpoints.md`; AI-проект → `registry/`). Не создаются «впрок».

### 5.2 Авто-валидация (docs lint, mandatory)

| Проверка | Применимо когда |
|---|---|
| Число моделей в `data-model.md` = `grep -c "^model" schema` | есть БД |
| Каждый controller файл имеет секцию в `api-endpoints.md` | есть API |
| Все `process.env.*` / `os.environ.*` из source → запись в `env-variables.md` | universal |
| Каждый `modules/*.md` имеет `> Последняя верификация: YYYY-MM-DD` (≤2 месяцев) | universal |
| Каждый план в `plans/active/` ссылается на draft | universal |
| Roadmap-consistency: «в работе» ↔ `active/*`, «что дальше» ↔ `drafts/*` | universal |
| SESSION.md ≤100 строк (warn, не error) | universal |

Конкретный script — `overlays/<stack>.md` § "docs lint script".

### 5.3 Триггеры авто-обновления

| Если добавил/изменил... | Обновить... |
|---|---|
| БД модель/таблицу | `reference/data-model.md` |
| Controller / endpoint | `reference/api-endpoints.md` |
| `process.env.*` read в коде | `reference/env-variables.md` |
| Public interface/contract | `reference/contracts.md` |
| Public API модуля | `modules/<module>.md` + дата верификации |
| Agent/skill/tool (если AI-проект) | `registry/*.md` |
| Завершил все итерации draft'а | `git mv drafts/X.md drafts/done/` + ROADMAP |
| Любая значимая правка | `SESSION.md` |
| SESSION.md >100 строк | ротация старых записей → `changelog/YYYY-MM.md` |

### 5.4 Lifecycle плана

```
1. Идея                  → строчка в ROADMAP.md «Что дальше»
2. Проработка            → plans/drafts/NN-feature-name.md (обсуждение с LLM)
3. Нарезка               → plans/active/<pack-id>-<slug>.md (по template из overlay)
4. Исполнение            → ralphex → auto git mv в active/completed/
5. Draft → drafts/done/  → когда все pack'и завершены (manual)
6. ROADMAP.md обновлён   → «в работе» → «сделано»
```

---

## 6. CLAUDE.md как контракт агента

> **Это не документация, а набор обязательных правил для LLM.** Загружается в каждый контекст автоматически. **Жёсткий лимит ≤100 строк** — если правило перерастает, выносить в Skill (§12) или Hook (§13).

### 6.1 Что обязательно в CLAUDE.md (8 minimum sections)

Это правила, нужные **всегда, в любой задаче**.

| # | Секция | Что внутри (короткой строкой) |
|---|---|---|
| 1 | **Language** | На каком языке отвечать пользователю (русский / EN / mix) |
| 2 | **Entry point** | Что читать первым — `docs/CONTEXT.md` |
| 3 | **Default context boundary** | Что НЕ читать по умолчанию (`business/`, `archive/`, `plans/active/completed/`) |
| 4 | **Architecture invariants** | Короткая выжимка: 6 порогов (CC15/CY20/file600/fn80/depth5/params8) + 3 forbidden directions. Полные детали — в `UNIVERSAL_CORE.md` и Skills |
| 5 | **Required validation command** | Одна команда обязательного pre-commit gate (e.g. `cd api && npm run lint:arch:diff`) |
| 6 | **Stack overview** | Backend / Frontend / AI / Infra / Auth — короткий список с версиями (определяет какой overlay использовать) |
| 7 | **DB / external access** | Credentials и connection strings для prod/dev environments |
| 8 | **Skills reference** | Одна строка: «См. `.claude/skills/` для load-on-demand правил» |

### 6.2 Что выносится в Skills (load-on-demand, нужно иногда)

LLM подгружает только когда триггер сработал. Не висит в контексте при каждой задаче.

**Universal skills (6, обязательны независимо от стека) — templates в `bootstrap/templates/skills/`:**

| Skill | Когда триггерится | Что внутри |
|---|---|---|
| `route-new-logic` | перед любым нетривиальным edit'ом | Module routing rules: zones, status markers, decision overrides |
| `add-new-module` | «создать модуль», «новый модуль» | Структура facade + sub-service, public barrel, registration |
| `facade-decomposition` | сервис ≥500 LOC + 100+ delta | Triggers + extraction pattern с DI rewiring |
| `fix-cross-module-import` | при касании файла с `../other-module/*` | Cleanup-on-touch для cross-module relative imports |
| `docs-sync-after-change` | после edit code с триггерами (model/controller/env/contract) | Trigger → doc-to-update mapping |
| `slice-draft-to-plans` | «нарезать draft», подготовка ralphex итерации | Parser contract, sizing rules, task structure |

**Universal conditional skills (2, templates в `bootstrap/templates/skills/`; install только если applicable):**

| Skill | Install если |
|---|---|
| `add-bridge-module` | проект использует DI framework с `@Global()`-like pattern (NestJS, Spring, Django settings injection) |
| `transaction-aware-outbox` | проект использует outbox pattern для event sourcing |

**Stack-specific skills (НЕ universal, живут в `overlays/<stack>.md` § "Stack-specific Skills" или создаются ad-hoc при настройке проекта):**

| Skill | Stack |
|---|---|
| `add-ui-component` | проекты с UI (shadcn / Tailwind / React или эквивалент) |
| `<orm>-migration` | проекты с ORM (Prisma / SQLAlchemy / Diesel / etc.) |
| `<framework>-bridge` (если default `add-bridge-module` нужно extends для конкретной DI mechanic) | per framework |

Эти stack-specific skills LLM создаёт **при первом appropriate triggering** в проекте, не из universal templates. Содержание берётся из соответствующего overlay's stack patterns sections.

### 6.3 Что выносится в Hooks (детерминированная автоматизация)

Hooks выполняются автоматически без участия LLM. Скриптовая защита от регрессий.

| Hook | Событие | Действие |
|---|---|---|
| `post-edit-lint` | PostToolUse (Edit/Write/MultiEdit) | Запустить linter на изменённом файле, вывести warnings в контекст при проблеме |
| `stop-session-check` | Stop (LLM завершает ответ) | Блокирует Stop если были code changes но SESSION.md не обновлён |
| `session-start` | SessionStart (startup/resume/clear) | Загрузить в контекст: текущая ветка, recent commits, working tree, preview SESSION.md |

### 6.4 Уровни CLAUDE.md

| Уровень | Путь | Что содержит |
|---|---|---|
| **Глобальный** | `~/.claude/CLAUDE.md` | Персональные правила: package managers, OS-paths, общие preferences. Применяется ко ВСЕМ проектам |
| **Проектный** | `<project>/CLAUDE.md` | 8 minimum sections выше (≤100 строк) |
| **Module-level** | `<project>/<module>/CLAUDE.md` (опционально) | Только если модуль очень большой и имеет специфические правила. На маленьких проектах не нужен |

### 6.5 Жёсткие правила

- **≤100 строк** total в проектном CLAUDE.md. Если перерастает — выносить в Skill или Hook.
- **Никаких разделов «опционально»** — если правило в CLAUDE.md, оно применяется всегда.
- **Никаких подробных примеров кода** — это в Skills.
- **Никаких stack tutorial'ов** — это в `overlays/<stack>.md`.

---

## 7. Ralphex Pipeline (mandatory)

> **Инвариант экосистемы.** Любой код, попадающий в `master`/`main`, прошёл полный ralphex pipeline. Manual feature commits в обход pipeline запрещены.
>
> Source-of-truth: https://github.com/umputun/ralphex

### 7.1 Два невыполняемых правила

1. **Codex external review (Phase 3) обязателен.** Tool можно подменить (`external_review_tool=custom` с любой моделью другого lineage). Но **фаза не пропускается никогда**. Если Codex недоступен (rate limit, quota, API down) и custom не настроен → **STOP**, ничего не merge'им, ждём восстановления или просим user настроить fallback.
2. **Ralphex всегда последней версии с official GitHub.** Минимум **v1.1.0** (mid-run steering + stalemate detection). Проверка: `ralphex --version`. Если ниже → попросить user `brew upgrade ralphex` или `brew install umputun/apps/ralphex`. На старой версии не работаем.

### 7.2 Слой A — что даёт ralphex «из коробки»

LLM не меняет, не имитирует, не дублирует. Эти константы определены ralphex CLI:

| Что | Источник |
|---|---|
| **5-фазный pipeline:** Tasks → First Review → External Review → Second Review → Finalize | ralphex CLI |
| **Default review-агенты:** quality, implementation, testing, simplification, documentation | ralphex CLI defaults |
| **Parser contract:** `### Task N: <title>` (EN, с двоеточием), `- [ ]`/`- [x]`, stdout signals `<<<RALPHEX:*>>>` | ralphex CLI |
| **Modes:** full / `-t` tasks-only / `-r` review-only / `-e` external-only / `--plan` interactive / `--worktree` / `-s` web dashboard | ralphex CLI |
| **Mid-run steering** (v1.1): `Ctrl+\` → pause → edit plan → resume с fresh session | ralphex CLI |
| **Stalemate detection** (v1.1): `--review-patience=N` → terminate phase 3 после N rounds без commits | ralphex CLI |
| **Auto plan-move в `completed/`** (v1.1 default): успешный план перемещается в `<plan-directory>/completed/` (т.е. directory того файла который выполняли — для plans в `docs/plans/active/<X>.md` это `docs/plans/active/completed/<X>.md`) | ralphex CLI |
| **Docker isolation** (recommended для не-разработчиков): `ralphex-dk.sh` wrapper, контейнер изолирует `--dangerously-skip-permissions` от системы | ralphex CLI |
| **Notifications:** Telegram / Slack / Email / Webhook — для long autonomous runs (8+ часов overnight) | ralphex CLI |

### 7.3 Слой B — наши настройки поверх (project-accumulated, не из коробки)

Эти значения LLM **не выдумывает**. Они кладутся в bootstrap-плейбук и копируются при init нового проекта.

| Где | Что | Куда документируется |
|---|---|---|
| `~/.config/ralphex/config` | claude_command path, claude_args presets, codex_command path, `codex_model=gpt-5.4`, `codex_reasoning_effort=xhigh`, `codex_sandbox=read-only`, `codex_enabled=true`, `external_review_tool=codex` | `bootstrap/greenfield.md` |
| `~/.config/ralphex/prompts/*.txt` | Накопленные расширенные prompts (anti-cycling rules для codex, sync-block для finalize, и др.) | `bootstrap/greenfield.md` (template, копируется как есть) |
| `~/.config/ralphex/agents/*.txt` | Расширенные agent prompts (stack-aware review checks) | `bootstrap/greenfield.md` |
| `<project>/.ralphex/config` | `default_branch`, `use_worktree=true`, `finalize_enabled=true`, `plans_dir=docs/plans/active`, `move_plan_on_completion=true` | `bootstrap/greenfield.md` |
| `<project>/.ralphex/prompts/*.txt` | Project-local overrides для stack-specific gates (validation commands) | `overlays/<stack>.md` |

### 7.4 Plan structure (mandatory, parser-strict)

Каждый plan имеет sections: `# Title`, `## Overview` (1-3 sentences), `## Context` (files + patterns + deps), `## Development Approach` (testing approach, CI gates from overlay, 3-5 CRITICAL pack-specific statements), `## Implementation Steps` (3-7 tasks).

Parser tokens (immutable):
- `### Task N: <english title>` — EN, нумерация с 1, **с двоеточием**
- `- [ ]` / `- [x]` — checkbox state
- Required final 2 tasks: `Verify acceptance criteria` + `Update documentation`

**Полный template:** [`bootstrap/templates/ralphex-plan-template.md`](bootstrap/templates/ralphex-plan-template.md). Use it as starting skeleton for каждого plan'а.

### 7.5 Sizing rules

| Constraint | Value |
|---|---|
| Tasks per plan | **3-7** (если >10 — split на 2 packs) |
| Task body | **30-150 lines** (<30 — мало контекста, >150 — слишком крупно) |
| Task dependencies | Linear (Task N может depend on 1..N-1, не наоборот) |
| Tests per task | Mandatory (no «tests later») |
| Done-criteria | Только automatable: ✅ `npm test green`, ❌ `manually tested` |

### 7.6 Signal protocol (LLM emit правила)

| Signal | Когда emit |
|---|---|
| `<<<RALPHEX:ALL_TASKS_DONE>>>` | Все `[ ]` → `[x]` |
| `<<<RALPHEX:TASK_FAILED>>>` | Unrecoverable error при task execution |
| `<<<RALPHEX:REVIEW_DONE>>>` | Phase 2/4: findings.length === 0 **AND** no fixes were made в этой итерации |
| `<<<RALPHEX:CODEX_REVIEW_DONE>>>` | Phase 3: то же правило |
| `<<<RALPHEX:QUESTION>>>` | `--plan` mode: нужен user input |
| `<<<RALPHEX:PLAN_DRAFT>>>` / `<<<RALPHEX:PLAN_READY>>>` | `--plan` mode lifecycle |

**Критическое правило для REVIEW_DONE / CODEX_REVIEW_DONE:** «no issues» ≠ «I finished fixing». Если были fixes — signal не emit, ralphex запускает следующую review iteration для проверки fixes.

### 7.7 Plan lifecycle

```
docs/plans/drafts/NN-<feature>.md          ← общий план (sortable prefix)
  ↓ slicing по template из overlay
docs/plans/active/<pack-id>-<slug>.md      ← iteration plan (ralphex-исполнимый)
  ↓ ralphex <plan>.md → 5 phases
docs/plans/active/completed/<pack-id>-<slug>.md  ← auto-moved by ralphex CLI
  ↓ когда ВСЕ pack'и draft'а в completed/
docs/plans/drafts/done/NN-<feature>.md     ← manual git mv
  ↓
ROADMAP.md обновляется (← "в работе" → "сделано")
```

### 7.8 Mode selection

| Mode | Когда LLM рекомендует / использует |
|---|---|
| Full pipeline (`ralphex <plan>.md`) | Default для любой feature work |
| Tasks only (`-t`) | **Никогда** для merged code. Только для experimental probe (с явным user request) |
| Review only (`-r`) | Code был написан вне ralphex (manual edits, IDE plan mode) и нужен review pipeline |
| External only (`-e`) | После manual fixes — re-trigger Phase 3 |
| Plan creation (`--plan "<desc>"`) | Каждый новый план — через interactive flow |
| Worktree isolation (`--worktree`) | Default если `use_worktree=true` в config |
| Web dashboard (`ralphex --serve <plan>.md`) | Long autonomous runs (overnight) — browser view of execution. `-s` short alias. Optional `-w <dir>` для watch-mode мульти-сессий (см. ralphex README) |
| Docker wrapper (`ralphex-dk.sh`) | **Recommended для не-разработчиков** — изолирует `--dangerously-skip-permissions` контейнером |

### 7.9 Anti-patterns (LLM не делает никогда)

- ❌ Merge feature commits в обход ralphex (включая «one-line fix», «typo», «trivial»)
- ❌ Phase 3 skip «потому что изменение маленькое»
- ❌ `external_review_tool=none` в config для production-bound branch
- ❌ Слить несколько `### Task N:` headers в один большой («сэкономлю iteration»)
- ❌ Перевод/перефразировка `### Task N:` token (parser breaks)
- ❌ Положить fixes в `Verify acceptance criteria` task (verify ≠ fix)
- ❌ Manual `git mv` plan в `completed/` (ralphex auto-moves)
- ❌ Manual edit плана во время phase 1 без `Ctrl+\` SIGQUIT pause
- ❌ Emit `REVIEW_DONE` если были fixes (signal означает «не нашёл проблем», не «закончил fix»)
- ❌ Done-criteria non-automatable (`✅ manually tested` запрещено)
- ❌ Запустить ralphex на устаревшей версии (< v1.1.0)

### 7.10 Связи с другими секциями core

| Связь | Куда смотреть |
|---|---|
| Architecture constraints в plan | §1 DAG + §2 cognitive budget |
| `Verify acceptance criteria` commands | §4 enforcement → overlay command map |
| Plan slicing template | `overlays/<stack>.md` heading "Plan template stack-specific commands" |
| Validation per task | `overlays/<stack>.md` heading "Command map" |
| Review/codex prompts (Слой B) | `bootstrap/greenfield.md` |

---

## 8. Module routing (pre-flight для любого edit)

> **Перед любым нетривиальным edit'ом LLM сначала классифицирует zone, потом выбирает модуль.** Без этого шага — random reads и edit в неправильный модуль.
>
> Канон: `docs/reference/module-routing.md`. Этот раздел — universal минимум; конкретные модули проекта — overlay/проектная route map.

### 8.1 Universal минимум: 4 базовых zone

| Zone | Назначение | Применимо для |
|---|---|---|
| **platform** | shared infrastructure: db client, auth, config, common types, contracts, health | любой проект |
| **domain** | бизнес-сущности и domain logic (любого типа: рассылки, calendar, users, etc.) | любой проект |
| **connectors** | external API adapters (изолированные per provider) | проект с внешними интеграциями |
| **orchestration** | оркестрация: brain/runtime, scheduler, workflows, actions | проект с runtime layer (AI-агенты, асинхронные пайплайны) |

Дополнительные zones (`workspace`, `knowledge`, `workforce`, `operations`, etc.) — добавляются в **проектный route map** по необходимости. Universal core их не диктует.

### 8.2 Обязательные маркеры модулей

Каждый модуль помечен одним из statuses в `docs/reference/module-routing.md`:

| Маркер | Что значит для LLM |
|---|---|
| **active** | Normal module, добавление новой логики разрешено |
| **aggregate-only** | Composition shell, **бизнес-логику не добавлять**, только wiring |
| **frozen-pending-transform** | Read-only, ожидает рефакторинга в другой модуль — новые edits запрещены |
| **frozen-pending-removal** | Read-only, ожидает удаления — новые edits запрещены |
| **legacy-confirmed** | Superseded — использовать canonical replacement (указано рядом) |
| **support-shrinking** | Functionality сокращается — расширять запрещено |
| **transition-only** | Migration / cutover модуль — расширять только если задача explicitly transitional |

### 8.3 Routing rules для LLM

1. Классифицируй задачу в **одну zone** до открытия файлов.
2. Выбери **самый узкий реальный домен**, а не aggregate-only wrapper.
3. **Не добавляй бизнес-логику** в aggregate-only / frozen / legacy модули.
4. Если изменение пересекает zones — **write set** в owning zone, **crossings** через events / interfaces / bridge modules.
5. Если сомнения остались — задокументировать routing choice в task notes ДО редактирования.

---

## 9. Тесты как часть архитектуры

Тесты — **архитектурный требование**, не nice-to-have. Каждый code task обязан включать tests.

### 9.1 Layers (все обязательны)

| Layer | Что покрывает | Где runs |
|---|---|---|
| **Unit** | Логика отдельного класса/функции, замокано всё внешнее | Каждый CI run, milliseconds |
| **Integration** | Границы модулей (contracts), реальные внутренние deps | Каждый CI run, секунды |
| **E2E** | Полный flow на реальных внешних сервисах (Docker postgres/redis/etc.) | Gated phase, отдельный CI job, минуты |
| **Eval** (conditional) | LLM ответы в продукт-runtime: датасеты + assertions на качество | См. 9.3 |

### 9.2 Правила

- **Каждый код-task в плане содержит tests** (test-first или вместе с реализацией). «Tests later» = anti-pattern.
- **Unit tests fast** — миллисекунды per test, полностью замоканные.
- **E2E gated** — отдельная CI phase после unit/integration, требует Docker.
- **Coverage НЕ метрика.** Метрика — что **критические пути имеют test**, и что test **ловит regression** при breaking change.
- **CI flow:** lint → test → build → E2E. Каждая фаза gated на предыдущую (fail-fast).

### 9.3 Eval coverage для AI-only path (обязательно если LLM в продукте)

> **Триггер:** проект использует LLM **в runtime продукта** (не только для разработки). Например: AI-агенты отвечают пользователю, AI-классификация сообщений, AI-генерация контента.

В таких проектах есть **невидимые регрессии**: LLM ответил по-другому после изменения промпта / модели → никакой обычный test не поймает. Решение — eval suite:

| Component | Что |
|---|---|
| **Eval datasets** | Каждое AI-feature имеет dataset входов с expected behaviors |
| **Assertions** | Не «exact match» (LLM варьирует), а structural: contains keywords, satisfies regex, conforms schema, scoring above threshold |
| **Baseline tracking** | Score сравнивается с предыдущим runом. Падение >5% — блокирует merge |
| **CI integration** | Eval phase gated на отдельный job (медленный, нужны API calls) |

Tools (Inspect AI / DSPy / LangFuse / собственный) — overlay decision. Core требует: **eval phase exists и блокирует merge при regression.**

---

## 10. Memory layer (mandatory, Claude Code primary developer)

> **Claude Code = primary developer.** Memory — встроенный cross-session continuity mechanism. Не option. Часть workflow.

**Что:** persistent slой между context-окном (truncates) и project docs. Хранит user role / feedback rules / in-progress project state / external references.

**Где:** `~/.claude/projects/<path-encoded-project-dir>/memory/MEMORY.md` (index ≤200 строк) + topic files.

**4 типа memory:** `user`, `feedback`, `project`, `reference`.

**Triggers:** обновлять при learning про user / получении правила / change в in-progress инициативе / упоминании external system.

**Anti-triggers (НЕ writes):** architectural patterns (CLAUDE.md), code conventions (lint configs), git history (`git log`), debugging recipes (code), ephemeral state (TodoWrite/Plan).

**Verify-before-recommend rule:** проверять что memory не stale (file/function/flag из memory всё ещё в коде) до того как recommend action на её основе.

**Полные детали:** [`core/details/memory.md`](core/details/memory.md) — типы, frontmatter format, MEMORY.md index structure, lifecycle rules.

---

## §11. Sub-agents

Claude Code из коробки идёт с суб-агентами: `Explore` (read-only поиск), `Plan` (архитектурное планирование), `general-purpose` (универсальный). Ralphex добавляет 5 review-агентов + Codex external review (§7).

**Правило:** не создавать кастомных суб-агентов для функций, которые уже закрыты built-in. Создавать **только для узких проектных нужд** (специфическая интеграция с внешним инструментом, специфическая review задача с domain knowledge) — не для дублирования существующих ролей.

| Built-in (использовать) | Дублирование (не создавать) |
|---|---|
| `Explore` | кастомный поисковик по коду |
| `Plan` | кастомный планировщик |
| `general-purpose` | кастомный многозадачный агент |
| Ralphex: `quality`, `implementation`, `testing`, `simplification`, `documentation` | кастомные review-агенты по тем же темам |

---

## §12. Skills — load-on-demand правила

> **Что в Skills выносится** — список в §6.2 (CLAUDE.md). **Как писать и поддерживать** — здесь короткая выжимка.

**Размер:** 80-200 строк per skill (≥200 → split).
**Description = auto-trigger.** Включает trigger phrases на используемых языках. Без них skill не подхватывается.
**Anti-patterns секция обязательна.** Без неё LLM достраивает по аналогии и галлюцинирует.
**Versioned with code:** `<project>/.claude/skills/<name>/SKILL.md` коммитятся.

**Полные правила:** [`core/details/skills.md`](core/details/skills.md) — frontmatter format, 7 rules of writing, 4 anti-patterns.

---

## §13. Hooks — детерминированная автоматизация

> **Что в Hooks выносится** — список в §6.3 (CLAUDE.md). **Контракт скрипта** — здесь короткая выжимка.

**Контракт:** stdin = JSON event; stdout = context для LLM; stderr+exit 2 = блок действия; exit 0 = OK. Timeout обязателен.

**Правила:** быстрые (≤2 sec), тихие (молчат при OK), non-blocking by default, fail-safe (broken hook ≠ broken workflow), idempotent.

**Skills × Hooks pair:** Skills говорят LLM **что** делать (knowledge); Hooks делают **за** LLM (automation, не зависит от LLM памяти).

**Полные правила + контракт:** [`core/details/hooks.md`](core/details/hooks.md).

---

## §14. Security baseline (mandatory с day-1)

> **Maximalist принцип §4:** все gates обязательны с первого commit'а. Security не исключение — secrets leak один раз = credentials уже compromised, «исправляется потом» не работает.

**5 категорий gate'ов (все blocking в CI):** secret scan (pre-commit + CI) / dependency CVE check / SAST / license check / ENV management.

**ENV management invariants:** `.env` в `.gitignore`, `.env.example` committed с placeholders, prod credentials в managed secret store, никаких secrets в `docs/` / `SESSION.md` / `CLAUDE.md` / `MEMORY.md` / commits.

**Если leak обнаружен:** STOP commits → inform user → rotate credentials in provider → ONLY THEN remove from code. Git history rewrite не помогает — secret уже compromised.

Конкретные tools per stack — `overlays/<stack>.md` § "Security tooling".

**Полные правила, anti-patterns, leak protocol:** [`core/details/security.md`](core/details/security.md).

---

## §15. Observability baseline (mandatory если есть production deployment)

> **Conditional на наличие production:** если у проекта есть deployed environment (production / staging / live runtime), observability обязательна с day-1. CLI tools / one-shot scripts без runtime — skip.

**3 pillars:** Logs (structured JSON с redaction) / Errors (tracker captures uncaughts) / Metrics (health signals).

**Mandatory baseline (production):**
- Structured JSON logger (НЕ `console.log` / `print`)
- Error tracker (Sentry / Rollbar / Datadog APM / equiv) с auto-capture uncaught exceptions
- Health endpoint (`/health` или `/healthz`)
- Log redaction по name patterns (password / token / email / phone / etc.)

**Conditional layers:** API surface → request/response logging + latency + error rate + 4 golden signals; LLM в runtime → call tracing + token usage + cost tracking (+ eval coverage из §9.3); background jobs → execution logging + queue depth + DLQ tracking.

Конкретные tools per stack — `overlays/<stack>.md` § "Observability tooling".

**Полные правила, conditional layers, anti-patterns:** [`core/details/observability.md`](core/details/observability.md).

---

## §16. Data migration discipline (mandatory если есть persistent state)

> **Conditional:** применимо если у проекта есть БД / persistent state. CLI-tools без БД — skip.
> **Принцип:** миграция — это код, идёт через ralphex pipeline + отдельная transactional discipline.

**Migration files как code:** versioned in git, sortable timestamp filename, атомарна и rollback-able, большие миграции через 5+ deploys (add nullable → backfill → set NOT NULL → switch readers → drop старое).

**Tx-aware outbox pattern** (если есть outbox для event sourcing):
- Внутри транзакции: `enqueueInTx(tx, data)` → возвращает `shouldEmit` flag
- ПОСЛЕ commit: `emitEnqueued(data)` (wake-up hint для processor)
- **Anti-pattern:** `enqueue()` внутри `$transaction` пишет outbox row снаружи tx → ghost events при rollback

**Backfill scripts** (>10K rows): отдельные скрипты с `--dry-run` / `--apply` / batching / progress checkpoint / idempotent / lockable.

**Schema change на large tables (>1M rows):** 6-step protocol (lock-free add → async backfill → verify → set constraint → switch readers → drop) — каждый шаг отдельный deploy.

Конкретный outbox API + migration tools — `overlays/<stack>.md`.

**Полные правила, 6-step protocol, anti-patterns:** [`core/details/data-migration.md`](core/details/data-migration.md).

---

## §17. MCP servers (стандарт 2026)

> **Принцип:** доступ к внешним системам (DB / error tracker / git host / messaging) — через **MCP (Model Context Protocol)**, не через raw bash. MCP = type-safe, auditable, безопасный.

**Mandatory MCPs (по surface проекта):**
- **GitHub / GitLab MCP** если есть git remote + используется для PRs/issues
- **DB MCP** если есть persistent БД (Postgres / MySQL / SQLite)
- **Error tracker MCP** если есть production deployment с observability (§15)
- **Filesystem MCP** только если LLM нужен access к файлам вне repo (rare)

**CLI-tools без git remote / БД / production** → MCPs не обязательны, но preferred.

**Conditional MCPs (по необходимости):** Slack/Discord, Calendar, Linear/Jira, Cloudflare, Stripe, Anthropic-skills.

**Правила использования (LLM):** MCP > raw bash для external systems; read-only first; не invent'ить tool names (если tool не в list — попросить user установить, не пытаться через bash); destructive actions требуют explicit user approval.

**Полный список Conditional + правила + anti-patterns:** [`core/details/mcp.md`](core/details/mcp.md).

---

## §18. Codebase map (живой индекс кода для LLM навигации)

> **Цель:** быстрая карта «что где лежит» для LLM. Снижает context waste при заходе в проект.

**Что:** `docs/reference/codebase-map.md` — generated файл с module index (path / kind / status / LOC / public / brief) + public surface + dependency graph + hot files (last 30 days).

**Roles:**
- `module-routing.md` = **WHERE** новую логику класть (decision-making)
- `codebase-map.md` = **WHAT уже есть и где** (navigation)

**Generation:** скриптом, не руками (drift иначе). Скрипт reads filesystem + git log + public barriers + routing-map + linter output. Конкретный скрипт — `overlays/<stack>.md` § "Codebase map generator".

**Update cadence:** pre-PR при structural changes / weekly cron / manual on demand. Stale map (>30 days) хуже чем `grep` — re-generate перед использованием.

**LLM rule:** перед `grep`/`find` смотри map. Map ≠ source of truth для контрактов (контракты — `contracts.md` / public barrier).

**Полная структура файла, sources, anti-patterns:** [`core/details/codebase-map.md`](core/details/codebase-map.md).

---

## §19. Cost discipline (mandatory если LLM в product runtime)

> **Conditional:** применимо если LLM используется в **product runtime** (агент отвечает пользователю, classification на live data, AI-генерация контента). Для проектов где LLM **только в разработке** (Claude Code, Codex review) — skip.

LLM API calls — это **переменная стоимость без потолка** по умолчанию. Без discipline проект может неожиданно burned monthly budget за один день incident (бесконечный loop, malicious user prompt injection, runaway agent).

**Mandatory components с day-1 (если триггер activates):**

| Component | Что |
|---|---|
| **Per-request token cap** | Hard limit на single LLM call (input + output tokens). Reject overshoot. |
| **Per-feature daily budget** | Cumulative cost для конкретной AI-feature (e.g. `agent_reply`, `classification`) tracked per day. При hit — feature degrades gracefully (fallback / skip). |
| **Per-tenant rate limit** | Если multi-tenant — лимит на tenant'а (prevent one tenant drain'ит budget). |
| **Cost tracking storage** | Persist'ить cost per call: `model_id`, `tenant_id`, `feature`, `input_tokens`, `output_tokens`, `cost_usd`, `timestamp`. |
| **Alert thresholds** | При 50% / 80% / 100% дневного budget'а — alert (Slack / email / Sentry). |
| **Regression cost report** | CI gate (eval-coupled): новая версия prompt'а не должна увеличить cost per request >X% без explicit approval. |

**Per-call enforcement (LLM rule):**
- Перед LLM call: check per-feature daily budget. Если ≥100% — fallback (template reply / skip / queue для review). Не raise exception в product flow.
- После LLM call: record cost in storage.
- Альтернатива: route to cheaper model на 80%+ usage instead of hard cutoff.

**Anti-patterns:**
- ❌ **LLM call без token cap** — runaway iteration жрёт unbounded tokens
- ❌ **No daily budget** — incident за ночь burn'ит month's budget
- ❌ **Cost tracking только в provider dashboard** — лагает, нет alert, нет per-feature breakdown
- ❌ **Hard exception при budget exceeded** — feature ломается, user видит error → лучше graceful degradation
- ❌ **CI без cost regression check** — new prompt template 10x cost'а проходит незаметно

**Tools per stack — `overlays/<stack>.md` heading "LLM cost discipline" (см. `core/details/cost-discipline.md` для contract):**
- LangFuse / Helicone / OpenLLMetry: per-call tracking + budgets + alerts
- Custom: store в БД + dashboard

**Полные правила, alert formats, fallback strategies:** [`core/details/cost-discipline.md`](core/details/cost-discipline.md).

---

## CI workflow (универсальная последовательность)

```yaml
# Базовый shape — детали для стека в overlays/<stack>.md
jobs:
  lint:        # parallel: все статические проверки (§4 категории 1-6, 8)
  test:        # gated on lint — unit + integration
  build:       # parallel with test — compile/transpile
  e2e:         # gated on lint+test+build — реальные внешние сервисы (Docker)
  eval:        # conditional — только если LLM в продукт-runtime (§9.3)
```

**Promotion на prod = manual workflow_dispatch.** Push в working branch → CI runs, prod deploy только после явного promote. Никакого auto-deploy на prod.

---

## Чек-листы

### Запуск нового проекта (см. `bootstrap/greenfield.md`)

- [ ] `CLAUDE.md` ≤100 строк с 8 minimum sections (§6.1)
- [ ] `docs/CONTEXT.md` + `docs/SESSION.md` + `docs/DOCS_RULES.md` + `AGENTS.md` (root)
- [ ] `docs/reference/module-routing.md` с zones для проекта (минимум 4 из §8.1)
- [ ] Linter config со всеми порогами §2 + DAG enforcement §1
- [ ] Dependency cycles detector с kind layering + 3 forbidden directions
- [ ] CI workflow с 9 обязательными gates (§4.2)
- [ ] Diff-scoped arch guard скрипт
- [ ] Docs lint скрипт (для conditional sections — добавлять при появлении триггера)
- [ ] Baseline-файлы инициализированы на zero
- [ ] `plans/ROADMAP.md` + `plans/drafts/` + `plans/active/` структура
- [ ] Ralphex v1.1.0+ установлен, `~/.config/ralphex/` + `.ralphex/config` настроены (§7.2)
- [ ] Codex external review включён (`codex_enabled=true`, `external_review_tool=codex`)
- [ ] `~/.claude/projects/<path-encoded-project-dir>/memory/MEMORY.md` инициализирован (§10)
- [ ] Minimum 6 universal Skills установлены (§6.2)
- [ ] 3 universal Hooks установлены (§6.3)
- [ ] `contracts/` директория создана если есть API surface (§1.5)
- [ ] Security baseline (§14): secret scan + CVE check + SAST + license check + `.env.example`
- [ ] Observability baseline (§15): structured JSON logger + error tracker + health endpoint (если production deployment)
- [ ] Migration discipline (§16): migration framework настроен + outbox tx-aware pattern (если используется outbox)
- [ ] MCP servers (§17): MCPs required by project surfaces installed (GitHub MCP if git remote, DB MCP if persistent БД, error tracker MCP if production deployment) через `~/.claude/settings.json` или эквивалент
- [ ] Codebase map (§18): `docs/reference/codebase-map.md` сгенерирован скриптом
- [ ] Cost discipline (§19): если LLM в product runtime — per-request token cap + per-feature daily budget + cost tracking + alert thresholds установлены

### Перед commit (для LLM)

- [ ] `lint:arch:diff` или эквивалент стека — green
- [ ] Tests green (unit + integration)
- [ ] Docs lint green (если затронуты model/controller/env/contract)
- [ ] `SESSION.md` обновлён записью текущей правки
- [ ] При касании файла с baseline violation — fix + update baseline

### Перед slicing draft → iteration plan

- [ ] Каждый pack имеет explicit Files list (конкретные пути)
- [ ] Acceptance criteria (3-5 пунктов) для каждого pack'а
- [ ] Sequencing между packs задокументирован
- [ ] API surface (interfaces, signatures) verified против реального кода
- [ ] Architecture constraints проверены для каждого затрагиваемого файла
- [ ] Plan parser tokens соответствуют §7.4 (immutable)

---

## Что НЕ входит в universal core (выносится в overlay/bootstrap/CLAUDE.md проекта)

| Что | Куда |
|---|---|
| Конкретные linter tools, configs | `overlays/<stack>.md` |
| Конкретные команды (npm/cargo/go) | `overlays/<stack>.md` |
| Конкретные routing zones и модули | `docs/reference/module-routing.md` проекта |
| Бизнес-логика интеграций | проектные `docs/modules/*.md` |
| Setup ralphex configs | `bootstrap/greenfield.md` |
| Stack-specific patterns (Prisma, NestJS, FastAPI, etc.) | `overlays/<stack>.md` |
| Мобильные настройки (Capacitor, native push) | `overlays/<stack>.md` |
| ENV переменные значения | `docs/reference/env-variables.md` проекта |

---

## Open questions (для следующих итераций)

1. **Plan template вариации** — разные шаблоны под типы задач (refactor / feature / migration / bug-fix)? Или один универсальный template достаточен?

> **Закрыто в v0.2-v1.0:**
> - Security baseline → §14
> - Observability baseline → §15
> - Data migration discipline (tx-aware outbox) → §16
> - MCP servers standard → §17
> - Codebase map → §18
> - Cost discipline для AI-проектов → §19
> - AGENTS.md template → `bootstrap/templates/AGENTS.md`
