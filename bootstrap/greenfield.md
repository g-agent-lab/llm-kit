# Greenfield Bootstrap

> **Цель:** за 13 шагов развернуть полную discipline на новом проекте.
> **Audience:** LLM (primary developer: Claude Code).
> **Применять когда:** новый проект, кода ещё нет.
> **Канон:** `UNIVERSAL_CORE.md`. Этот файл — operational playbook.

---

## Pre-flight check

Перед стартом убедись:

| Проверка | Команда / признак | Если FAIL |
|---|---|---|
| Это действительно greenfield | `git log --oneline 2>&1 \| head -5` → пусто/error | → `bootstrap/brownfield.md` |
| Нет существующих linter configs | `ls eslint.config.* .eslintrc.* pyproject.toml ruff.toml 2>/dev/null` → пусто | → `bootstrap/brownfield.md` |
| Нет CLAUDE.md в корне | `test -f CLAUDE.md` → false | Прочитать существующий, не перезаписывать без user разрешения |
| User указал стек | Спросить если не очевидно: «TypeScript+NestJS / Python+FastAPI / Go / etc.?» | Без стека дальше не идти |

Если все 4 OK — идти по шагам ниже.

---

## Шаг 1. Initialize repository

**Action:**

```bash
git init
git branch -m main          # или test, согласовать с user
git config commit.gpgsign false  # опционально, если не настроена подпись
```

Создать `.gitignore` per stack (взять из `overlays/<stack>.md` § ".gitignore template").

Минимум для любого стека:
```
node_modules/
*.log
.DS_Store
.env
.env.local
.ralphex/progress/
.ralphex/worktrees/
```

Создать placeholder `README.md` с однострочным описанием проекта.

**Verify:** `git status` показывает чистое состояние (только untracked initial files).

---

## Шаг 2. Install ralphex

**Action:**

```bash
brew install umputun/apps/ralphex
# ИЛИ
go install github.com/umputun/ralphex/cmd/ralphex@latest
```

Если user — не разработчик и хочет максимальную изоляцию:

```bash
curl -sL https://raw.githubusercontent.com/umputun/ralphex/master/scripts/ralphex-dk.sh -o /usr/local/bin/ralphex
chmod +x /usr/local/bin/ralphex
```

**Verify:**

```bash
ralphex --version
# Должно вернуть v1.1.0 или выше
```

Если ниже — `brew upgrade ralphex`. На < v1.1.0 не работаем (§7.1 core).

---

## Шаг 3. Configure ralphex

### 3.1 Global config (`~/.config/ralphex/config`)

Создать файл если не существует:

```ini
# Claude executor
claude_command = /Users/<user>/.local/bin/claude    # или путь к Claude Code CLI
claude_args = --dangerously-skip-permissions --output-format stream-json --verbose --model opus --effort high --strict-mcp-config

# External reviewer (mandatory)
codex_command = /Users/<user>/.config/ralphex/scripts/codex-wrapper.sh    # или прямой путь к codex
codex_enabled = true
codex_model = gpt-5.4
codex_reasoning_effort = xhigh
codex_sandbox = read-only
codex_timeout_ms = 3600000
external_review_tool = codex

# Timing
iteration_delay_ms = 2000
task_retry_count = 2
review_patience = 3
```

**Замени `<user>`** на реальное имя в путях. Пути к `claude_command` / `codex_command` — спросить у user.

### 3.2 Global prompts/agents

Создать директории + скопировать template prompts:

```bash
mkdir -p ~/.config/ralphex/{prompts,agents,scripts}

# Извлечь default prompts из ralphex CLI
ralphex --dump-defaults ~/.config/ralphex/
```

Это создаст:
- `~/.config/ralphex/prompts/{task,review_first,review_second,codex,make_plan,finalize,custom_eval,custom_review}.txt`
- `~/.config/ralphex/agents/{quality,implementation,testing,simplification,documentation}.txt`

Эти файлы — **дефолты от ralphex**. Не редактируем сразу. Кастомизация — позже когда есть конкретные нужды.

### 3.3 Project-local config (`<project>/.ralphex/config`)

```ini
default_branch = main         # или test, согласовать с user
use_worktree = true
finalize_enabled = true
plans_dir = docs/plans/active     # ralphex auto-discovery root; см. ниже о lifecycle
move_plan_on_completion = true
```

> **Important про `plans_dir`:** ralphex `MovePlanToCompleted` использует **directory of the running plan file** + `/completed/` (не `<plans_dir>/completed/`). С `plans_dir = docs/plans/active` новые plans от `ralphex --plan` создаются в `docs/plans/active/<auto-name>.md`, и при успехе перемещаются в `docs/plans/active/completed/<name>.md`. Это согласует с lifecycle structure из §5.4 core. **Не использовать `plans_dir = docs/plans`** — это положит plans в root `docs/plans/`, completed → `docs/plans/completed/`, и lifecycle расходится с docs.

### 3.4 .gitignore для ralphex artifacts

В `.gitignore` добавить:

```
.ralphex/progress/
.ralphex/worktrees/
```

`.ralphex/config` **должен** коммититься (project-local дисциплина).

**Verify:**

```bash
ralphex --version
ls -la .ralphex/
cat ~/.config/ralphex/config | grep -E "codex_enabled|external_review_tool"
# Должно показать codex_enabled=true и external_review_tool=codex
```

---

## Шаг 4. Detect / pick stack overlay

**Action:**

Узнать стек у user явно: «Какой стек? Backend: TypeScript+NestJS / Python+FastAPI / Go / Rust / другое. Frontend: React / Vue / нет. AI: используется LLM в runtime?»

Найти overlay в `overlays/`:

```bash
ls <kit-root>/overlays/<stack>.md
```

| Если | Что делать |
|---|---|
| Overlay существует | Использовать как guide для шагов 5-12 |
| Overlay не существует | Создать stub в `overlays/<stack>.md` с заголовком "WIP — derived from UNIVERSAL_CORE principles, needs validation". Следовать principles из core, при доработке overlay обновлять |

---

## Шаг 5. Apply overlay tooling

**Action:**

Из `overlays/<stack>.md` § "Tooling install" скопировать:
- Команды установки пакетов (linter, complexity rules, dep cruiser, boundaries plugin, etc.)
- Config files (ESLint flat config / pyproject.toml / .golangci.yml etc.) — копируются как есть, потом подстраиваются.

Минимальный обязательный tool set per §4.2 core (9 категорий):

| # | Категория | Tool (стек-agnostic названия) |
|---|---|---|
| 1 | Format check | Prettier / Black / gofmt / rustfmt |
| 2 | Quality linter | ESLint+sonarjs / Ruff / golangci-lint / clippy |
| 3 | Module boundaries | ESLint boundaries plugin / import-linter / depguard |
| 4 | Public API enforcement | ESLint no-restricted-imports / import-linter rules |
| 5 | Cross-module imports | Custom script или linter rule |
| 6 | Dependency cycles | dependency-cruiser / pylint cycles / godepgraph |
| 7 | Diff-scoped guard | Custom script (lint:arch:diff equivalent) |
| 8 | Docs lint | Custom script |
| 9 | Tests + Build | Native stack tools |

Конкретные команды — `overlays/<stack>.md`.

**Verify:**

```bash
# Все категории прогоняются на пустом проекте без ошибок
<format-check-cmd>     # exit 0
<linter-cmd>           # exit 0
<deps-check-cmd>       # exit 0
<test-cmd>             # exit 0 (нет тестов = pass)
```

---

## Шаг 6. Initialize baseline files

**Action:**

Создать baseline-файлы на zero (greenfield = нет легаси violations):

```bash
echo '[]' > .boundary-baseline.json
echo '{"violations": [], "lastUpdated": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}' > .cross-module-import-baseline.json
# Любые другие baseline'ы из overlay
```

Закоммитить как часть initial setup.

**Verify:**

```bash
cat .boundary-baseline.json     # []
cat .cross-module-import-baseline.json    # {"violations": [], ...}
```

**Anti-pattern:** не оставлять baseline-файлы НЕ-zero на greenfield. Это бессмысленно — кода ещё нет.

---

## Шаг 7. Create docs/ structure

**Action:**

```bash
mkdir -p docs/{plans/{drafts/done,active/completed},reference,modules,operations,archive,changelog,bootstrap,overlays}
```

Создать обязательные файлы (universal минимум):

| File | Содержимое (минимум) |
|---|---|
| `docs/CONTEXT.md` | Entry point: что-проект, stack, links на UNIVERSAL_CORE и module-routing |
| `docs/SESSION.md` | Заголовок + дата начала + пустая секция "Что сделано" |
| `docs/DOCS_RULES.md` | Скопировать template из `bootstrap/templates/DOCS_RULES.md` (или сократить из the NestJS host version) |
| `AGENTS.md` (root) | Operational subset для external agents (Codex) — короткая выжимка CLAUDE.md |
| `docs/plans/ROADMAP.md` | Заголовок + пустые секции "В работе" / "Активные Drafts" / "Что дальше" |
| `docs/reference/module-routing.md` | 4 universal zones + пустой список модулей |
| `docs/reference/env-variables.md` | Пустая таблица |
| `docs/reference/contracts.md` | Пустая таблица |
| `docs/reference/architecture-exemptions.md` | Пустой |
| `docs/reference/ralphex-plan-template.md` | Скопировать из `bootstrap/templates/ralphex-plan-template.md` |

**Conditional** (создавать ТОЛЬКО при появлении триггера):

| Trigger | File |
|---|---|
| Появилась БД | `docs/reference/data-model.md` |
| Появился REST/gRPC API | `docs/reference/api-endpoints.md` |
| Проект AI (агенты/skills/tools) | `docs/registry/{agents,skills,tools}.md` |
| Проект >5K LOC | `docs/visualizations/README.md` + диаграммы |

**Anti-pattern:** создавать conditional docs «впрок». Только когда трigger.

---

## Шаг 8. Write CLAUDE.md

**Action:**

Создать `CLAUDE.md` в корне, **≤100 строк**, со всеми 8 minimum sections (§6.1 core). Template:

```markdown
# CLAUDE.md — <Project Name>

## Language
<язык общения с user — русский / EN / mix>

## Entry point
1. `docs/CONTEXT.md` — что-проект
2. `docs/reference/module-routing.md` — куда класть новую логику
3. `docs/SESSION.md` — текущая сессия

## Default context boundary
Не читать по умолчанию:
- `docs/archive/` (старые планы)
- `docs/plans/active/completed/` (завершённые)
- `business/` если есть (стратегия / sales / GTM — read только при явном запросе)

## Architecture invariants
- **6 порогов:** CC≤15, CY≤20, file≤600 LOC, fn≤80 LOC, depth≤5, params≤8.
- **3 forbidden directions:** adapter→orchestration, orchestration→adapter, adapter→adapter.
- **5 слоёв DAG:** shared / infra / domain / orchestration / adapter.
- Полные детали: `UNIVERSAL_CORE.md` §1-§4.

## Required validation command
Перед commit для backend changes:
```
<stack-specific cmd, e.g. cd api && npm run lint:arch:diff>
```

## Stack
- Backend: <e.g. NestJS 11 + Prisma 7>
- Frontend: <e.g. React 19 + Vite 8>
- AI: <e.g. Claude / OpenRouter, или "не используется в runtime">
- Infra: <e.g. Docker + Redis + Railway>
- Auth: <e.g. Clerk>

## DB / external access
- PostgreSQL: `<connection string или env var name>`
- Redis: `<connection>`
- <prod credentials хранятся где>

## Skills
Load-on-demand правила: `.claude/skills/`. Подгружаются автоматически по триггерам.
```

**Verify:**

```bash
wc -l CLAUDE.md
# Должно быть ≤100
```

**Anti-pattern:** длинные описания, code examples, stack tutorials. Это всё → Skills и overlay.

---

## Шаг 9. Install universal Skills (5 obligatory)

**Action:**

```bash
mkdir -p .claude/skills/
```

Установить 5 universal skills из template (взять из `bootstrap/templates/skills/`):

| Skill | Триггер |
|---|---|
| `route-new-logic` | перед любым нетривиальным edit'ом |
| `add-new-module` | «создать модуль», «новый модуль» |
| `facade-decomposition` | сервис ≥500 LOC + 100+ delta |
| `fix-cross-module-import` | при касании файла с `../other-module/*` |
| `docs-sync-after-change` | после edit code с model/controller/env/contract triggers |

**Universal conditional** (install из templates ТОЛЬКО если applicable):

| Skill | Когда |
|---|---|
| `transaction-aware-outbox` | если используется outbox pattern (event sourcing) |
| `add-bridge-module` | если проект использует DI framework с `@Global()`-like pattern (NestJS, Spring, Django settings injection) |

**Stack-specific skills** (НЕ из universal templates; LLM создаёт ad-hoc на основе overlay):

| Skill | Когда |
|---|---|
| `add-ui-component` | если есть UI — содержание из `overlays/<stack>.md` § "UI patterns" |
| `<orm>-migration` (e.g. `prisma-migration`) | если используется ORM — содержание из `overlays/<stack>.md` § "Migration tooling" |

**Verify:**

```bash
ls .claude/skills/
# Должно содержать минимум 6 директорий universal + conditional
```

---

## Шаг 10. Install hooks (3 obligatory)

**Action:**

```bash
mkdir -p .claude/hooks/
```

Создать `.claude/settings.json` с регистрацией 3 hooks (template — §13.1 core):

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [{
          "type": "command",
          "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/post-edit-lint.sh",
          "timeout": 20000
        }]
      }
    ],
    "Stop": [
      {
        "hooks": [{
          "type": "command",
          "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/stop-session-check.sh",
          "timeout": 5000
        }]
      }
    ],
    "SessionStart": [
      {
        "matcher": "startup|resume|clear",
        "hooks": [{
          "type": "command",
          "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/session-start.sh",
          "timeout": 5000
        }]
      }
    ]
  }
}
```

Создать сами скрипты:
- `.claude/hooks/post-edit-lint.sh` — запускает linter на изменённом файле (из stdin берёт path)
- `.claude/hooks/stop-session-check.sh` — exit 2 если были code changes без SESSION.md update
- `.claude/hooks/session-start.sh` — echo'ит git status + recent commits + SESSION.md preview

Templates — `bootstrap/templates/hooks/*.sh`. Конкретные команды (linter name) — из overlay.

`chmod +x .claude/hooks/*.sh` обязательно.

**Verify:**

```bash
ls -la .claude/hooks/*.sh    # все executable
cat .claude/settings.json    # содержит 3 hook registrations
```

---

## Шаг 11. Initialize memory

**Action:**

```bash
# Claude Code path-encodes project directory: /Users/X/path/project → -Users-X-path-project
PROJECT_DIR_ENCODED=$(pwd | sed 's|/|-|g')
mkdir -p ~/.claude/projects/${PROJECT_DIR_ENCODED}/memory/

# Verify Claude Code created/recognizes this directory:
ls ~/.claude/projects/${PROJECT_DIR_ENCODED}/
```

Создать `MEMORY.md` (≤200 строк, index-only):

```markdown
# Memory — <Project Name>

> Topic files: создаются по мере накопления знаний.

## User
- (создаётся когда узнаём что-то про user'а)

## Feedback
- (создаётся когда user даёт правило / коррекцию)

## Project
- (создаётся когда узнаём context про in-progress инициативы)

## Reference
- (создаётся когда узнаём где искать инфу в external системах)
```

Если user уже описал свою роль / preferences — создать `user_role.md` с frontmatter:

```markdown
---
name: User profile
description: User's role, expertise, communication preferences
type: user
---
<содержимое>
```

И добавить строку в MEMORY.md под `## User`:
```markdown
- [User profile](user_role.md) — <one-line hook>
```

**Verify:**

```bash
ls ~/.claude/projects/${PROJECT_DIR_ENCODED}/memory/MEMORY.md
```

---

## Шаг 12. CI workflow

**Action:**

Создать `.github/workflows/ci.yml` (или эквивалент для другого CI). Минимум 9 gates per §4.2 core:

```yaml
name: CI

on:
  push:
    branches: [main, test]
  pull_request:

jobs:
  lint:
    # Категории 1-6, 8 параллельно (см. core §4.2). Конкретные команды — overlays/<stack>.md.
    runs-on: ubuntu-latest
    steps:
      - <checkout>
      - <setup runtime>
      - <install deps>
      - run: <format-check-cmd>           # gate 1
      - run: <linter-cmd>                  # gate 2
      - run: <boundaries-cmd>              # gate 3
      - run: <cross-module-import-check>   # gate 5
      - run: <deps-cycle-cmd>              # gate 6
      - run: <docs-lint-cmd>               # gate 8

  arch-diff-guard:
    # gate 7 — diff-scoped + cleanup-on-touch FAIL (см. core §4.3)
    runs-on: ubuntu-latest
    steps:
      - <checkout>  # fetch-depth: 0 для diff
      - <setup runtime>
      - <install deps>
      - run: <lint:arch:diff-cmd>

  security:
    # Mandatory per core §14 — secret scan + CVE + SAST + license check
    runs-on: ubuntu-latest
    steps:
      - <checkout>  # fetch-depth: 0 для full secret scan
      - <secret-scan-cmd>            # e.g. gitleaks action
      - <setup runtime>
      - <install deps>
      - run: <cve-check-cmd>          # e.g. npm audit / pip-audit / cargo audit
      - run: <sast-cmd>               # e.g. semgrep / bandit / gosec
      - run: <license-check-cmd>      # e.g. license-checker

  test:
    needs: lint
    runs-on: ubuntu-latest
    steps:
      - <checkout>
      - <setup>
      - run: <test-cmd>                # gate 9 part 1 (unit + integration)

  build:
    runs-on: ubuntu-latest
    steps:
      - <checkout>
      - <setup>
      - run: <build-cmd>               # gate 9 part 2

  e2e:
    needs: [lint, test, build]
    runs-on: ubuntu-latest
    services:
      <docker services per stack>
    steps:
      - <checkout>
      - <setup>
      - run: <e2e-cmd>

  eval:
    # Conditional: только если LLM в продукт-runtime (core §9.3)
    # needs: [test]
    # steps: <eval suite cmd>
    if: false  # toggle to true when LLM-in-runtime applicable

  promotion:
    # Manual workflow_dispatch — promotion to prod
    # NOT auto on push to <branch>
```

Promotion на prod = отдельный workflow с `workflow_dispatch` (см. §7 / CI workflow в core).

**Verify:**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: initial workflow"
git push origin <branch>
# В GitHub Actions UI — все 4 jobs должны запуститься
# Все должны pass (greenfield = нет нарушений на пустом коде)
```

---

## Шаг 13. First plan + first feature

**Action:**

Создать первый план через ralphex interactive flow:

```bash
ralphex --plan "<short description of первой feature>"
```

Это сгенерирует план в `docs/plans/active/<pack>-<slug>.md` следуя parser contract §7.4 core.

После accept плана:

```bash
ralphex docs/plans/active/<pack>-<slug>.md
```

Pipeline пройдёт все 5 phases (Tasks → Review1 → External → Review2 → Finalize).

**Verify:**

| Что | Как проверить |
|---|---|
| Pipeline successful | `<<<RALPHEX:CODEX_REVIEW_DONE>>>` signal появился |
| Plan moved to completed | `ls docs/plans/active/completed/` содержит план |
| CI green | GitHub Actions all green |
| ROADMAP updated | `docs/plans/ROADMAP.md` отражает завершение |

Если pipeline сломался на какой-то фазе — investigate logs в `.ralphex/progress/`, исправить root cause, retry.

---

## Final verify checklist

После завершения всех 13 шагов — проверка целиком:

- [ ] `ralphex --version` ≥ v1.1.0
- [ ] `~/.config/ralphex/config` содержит `codex_enabled=true`, `external_review_tool=codex`
- [ ] `.ralphex/config` содержит `default_branch` + `use_worktree=true`
- [ ] CI workflow runs всех 9 gate-categories per §4.2
- [ ] `CLAUDE.md` ≤100 строк, содержит 8 minimum sections
- [ ] Все baseline-файлы на zero
- [ ] `docs/` структура соответствует §5.1 core (universal sections созданы)
- [ ] Минимум 5 universal skills в `.claude/skills/`
- [ ] 3 hooks в `.claude/hooks/` (executable)
- [ ] Memory MEMORY.md инициализирован
- [ ] Минимум 1 ralphex plan успешно прошёл pipeline end-to-end

Если все ✅ — greenfield bootstrap завершён. Дальше работа идёт через ralphex.

---

## Anti-patterns (LLM не делает никогда)

- ❌ **Skip Шаг 2 (Install ralphex).** Без ralphex pipeline вся discipline разваливается.
- ❌ **Минимум-3 gate'а** вместо 9 «потому что проект маленький». Maximalist § 4.
- ❌ **Создавать conditional docs впрок** (data-model.md когда БД ещё нет).
- ❌ **CLAUDE.md >100 строк.** Излишки → Skills.
- ❌ **Skip `AGENTS.md` (root)** «у меня нет codex». Codex включится через ralphex Phase 3.
- ❌ **`external_review_tool=none`** или `codex_enabled=false` «для скорости». Это нарушение §7.1 mandatory.
- ❌ **Установка хоть одного hook без `chmod +x`.** Не запустится молча.
- ❌ **Запускать ralphex pipeline до завершения шагов 1-12.** Дисциплина должна стоять до первого кода.

---

## Связанные документы

- `UNIVERSAL_CORE.md` — все principles
- `overlays/<stack>.md` — stack-specific commands и configs
- `bootstrap/brownfield.md` — если проект НЕ greenfield (есть legacy код)
