# Brownfield Bootstrap

> **Цель:** применить discipline (`UNIVERSAL_CORE.md`) к существующему проекту, БЕЗ rewrite'а и БЕЗ миграционного спринта.
> **Audience:** LLM (primary developer: Claude Code).
> **Применять когда:** проект уже существует (есть код, может быть legacy), и в него заходим с дисциплиной впервые.
> **Канон:** `UNIVERSAL_CORE.md`. Этот файл — operational playbook для legacy takeover.

---

## Главный принцип

Brownfield — это **не «починить legacy»**, а **«остановить рост долга и организованно его сокращать»**.

Альтернатива (что НЕ делаем):
- ❌ Migration sprint («перепишем X модулей, потом включим linter»)
- ❌ Disable gates временно («пока не приведём в порядок»)
- ❌ Mass auto-fix («linter --fix на весь проект»)

Что делаем:
- ✅ Audit текущего состояния как baseline
- ✅ Все gates активированы day-1, но **fail только на NEW violations**
- ✅ Cleanup-on-touch: при касании файла с baselined violation — обязательно исправить
- ✅ Eventually-zero: track baseline size as метрика, target ноль

Результат: дисциплина растёт organic'но, без блокировки текущей работы.

---

## Pre-flight check

| Проверка | Признак | Если FAIL |
|---|---|---|
| Это действительно brownfield | `git log` имеет commits, есть код в src/ | → `bootstrap/greenfield.md` |
| Получено user authorization на enforce | User в conversation сказал «применить discipline» | Спросить before proceeding |
| Стек определён | TypeScript+NestJS / Python / Go / etc. | Узнать у user |
| Working tree clean | `git status` показывает no uncommitted changes | Commit/stash перед bootstrap |

Если 4 OK — идти по шагам ниже.

---

## Шаг 1. Audit текущего состояния (read-only, без edits)

**Цель:** замерить «насколько большой долг», без исправлений.

### 1.1 Базовые метрики

Из корня проекта:

```bash
# Файлов с кодом (per stack — adapt от .ts/.py/.go)
find src -name '*.ts' -not -path '*/node_modules/*' | wc -l

# Total LOC (приблизительно)
find src -name '*.ts' -not -path '*/node_modules/*' -exec cat {} + | wc -l

# Самые большие файлы (top 20)
find src -name '*.ts' | xargs wc -l 2>/dev/null | sort -rn | head -20

# Файлы >600 LOC (превышают порог §2 core)
find src -name '*.ts' | xargs wc -l 2>/dev/null | awk '$1 > 600 {print}'
```

Сохранить в `docs/audit/initial-state.md` (создать если нет).

### 1.2 Architecture violations (если есть какие-то linter configs)

Если в проекте уже есть ESLint / linter — запустить, capture output:

```bash
<linter> > docs/audit/initial-lint-output.txt 2>&1 || true
```

Это **research**, не block. Просто фиксируем что есть сейчас.

### 1.3 Dependency cycles

Если есть dep-cruiser или эквивалент:

```bash
<deps-checker> > docs/audit/initial-cycles.txt 2>&1 || true
```

Если tool не установлен — поставить и run only-for-audit (см. шаг 3).

### 1.4 Cross-module relative imports

```bash
# Например для TS:
grep -rE "from ['\"]\.\./[a-z-]+/" src --include="*.ts" | wc -l
```

### 1.5 Audit summary

Создать `docs/audit/initial-state.md`:

```markdown
# Initial Audit — YYYY-MM-DD

## Scope
- Total files: <N>
- Total LOC: <N>
- Modules: <list>

## Threshold violations (§2 core)
- Files >600 LOC: <count> — list top 10
- Functions >80 LOC: <count> (если linter показывает)
- CC >15: <count>
- Params >8: <count>

## Architecture violations
- Cycles: <count> — list
- Forbidden directions (3 abs): <count>
- Cross-module relative imports: <count>

## Public.ts coverage
- Modules with public.ts: <list>
- Modules without (candidates): <list>

## Docs state
- CLAUDE.md exists: yes/no
- docs/ structure: <что есть>
- Module docs: <count>
```

Этот файл — **read-only snapshot**. Не редактируется потом.

**Anti-pattern:** пытаться fix anything на этом шаге. Только measure.

---

## Шаг 2. Decide priorities (с user'ом, не самостоятельно)

**Action:**

Все defaults — **invariants** (per §4 core). Если user отклоняет любой из них — **STOP bootstrap**. Не применять partial discipline.

| Решение | Status |
|---|---|
| Maximalist enforcement day-1 | ✅ **Invariant** — все 9 gates обязательны (§4 core). Phased rollout запрещён. |
| Baseline = current violations | ✅ **Invariant** — baseline=zero для brownfield ломает CI на legacy. |
| Cleanup-on-touch policy | ✅ **Invariant** — без неё baseline не сокращается. |
| Migration sprint | ❌ **Invariant** — никогда (см. главный принцип). |

**Если user отклоняет maximalist enforcement или другие invariants** → остановить bootstrap, объяснить риски (фрагментированная discipline → продолжение долга), попросить user согласиться с defaults. Не запускать bootstrap с partial discipline.

Если все defaults приняты — идти дальше.

---

## Шаг 3. Install ralphex (если ещё нет)

**Action:**

```bash
which ralphex || brew install umputun/apps/ralphex
ralphex --version    # должно быть ≥ v1.1.0
```

Если ralphex есть, но < v1.1.0:

```bash
brew upgrade ralphex
```

Configure: следовать `bootstrap/greenfield.md` Шаг 3 (создать `~/.config/ralphex/config` + `.ralphex/config`). Никакая project-specific логика тут не отличается.

**Verify:**

```bash
cat ~/.config/ralphex/config | grep -E "codex_enabled|external_review_tool"
# codex_enabled = true
# external_review_tool = codex
```

---

## Шаг 4. Install overlay tooling (без активации в zero-tolerance)

**Action:**

Найти `overlays/<stack>.md`. Если нет — создать stub с заголовком «WIP — derived from UNIVERSAL_CORE, validate when applying».

Скопировать tooling install из overlay § "Tooling install":
- npm/pip/go install packages
- Config files: ESLint flat config, dep-cruiser, etc.

**Important:** конфиги создаём со всеми правилами (как в greenfield). Но **в режиме `warn`**, не `error`. И **baseline'ы будут freeze'нуты** на следующем шаге.

Конкретные команды:

```bash
# Из overlays/<stack>.md § "Tooling install"
npm install -D <packages>
# Скопировать template configs из overlay
```

**Verify:**

Каждая категория из §4.2 core может **запуститься** (без crash), даже если выдаёт много violations:

```bash
<format-check-cmd>       # exit code = irrelevant, главное не crash
<linter-cmd>             # видим violations — OK
<boundaries-cmd>         # видим violations — OK
<deps-check-cmd>         # видим cycles — OK
<test-cmd>               # пока не required pass
```

---

## Шаг 5. Baseline freeze (ключевой шаг)

**Action:**

Здесь и происходит «остановка роста долга». Фиксируем **текущие violations** как baseline.

### 5.1 Module boundaries baseline

```bash
# Запустить boundary check в режиме --update (если overlay поддерживает)
<lint:boundaries:update-baseline-cmd>
# Или вручную: capture violations as JSON
<lint:boundaries-cmd> --format json > .boundary-baseline.json
```

`.boundary-baseline.json` теперь содержит **текущие violations** (не пустой массив, как в greenfield).

### 5.2 Cross-module imports baseline

```bash
<lint:imports:update-baseline-cmd>
# Создаст .cross-module-import-baseline.json с current violations
```

### 5.3 Other baseline files

Для каждого gate, который имеет «zero-baseline» механику — capture current state.

### 5.4 Commit baseline

```bash
git add .boundary-baseline.json .cross-module-import-baseline.json <other-baselines>
git commit -m "chore: baseline current architectural violations

This commit freezes existing violations as the baseline.
New violations will block CI; existing ones are tolerated until cleanup-on-touch."
```

**Anti-pattern:** baseline = `[]` на brownfield. Это означает что **все existing violations** заблокируют CI → паника → решат отключить gates → discipline проиграла.

---

## Шаг 6. Activate CI в new-only mode

**Action:**

Создать `.github/workflows/ci.yml` (если нет) — копировать из overlay § "CI workflow skeleton".

Ключевая настройка: каждый gate сравнивает **current run** vs **baseline**. Fail только если new violations.

Конкретный mechanic зависит от overlay:
- **TS+NestJS:** `lint:boundaries` сравнивает с `.boundary-baseline.json`, fail только on new keys
- **Diff-scoped guard:** `lint:arch:diff` сравнивает changed files vs base ref — для legacy файлов не triggers
- **Cycles:** dep-cruiser в severity=warn для existing, severity=error для new (если поддерживается)

Запустить first CI run на текущей branch:

```bash
git push origin <current-branch>
```

| Что должно произойти | Действие если нет |
|---|---|
| Все 9 jobs запускаются | Fix workflow config |
| Format check может fail | Запустить `<format-fix-cmd>` локально, commit, retry |
| Linter показывает violations но НЕ блокирует | Проверить severity в config — `warn` для existing |
| Boundary/imports — comparison с baseline → pass | Проверить baseline-файлы committed |
| Tests — пройдут существующие | Если нет тестов вовсе — OK, gate проходит |
| Build — успешен | Если нет — нужно сначала чинить build перед bootstrap |

**Anti-pattern:** «временно отключить gate потому что он fail'ит на legacy». Если gate fail'ит — значит baseline mechanic не работает. Чинить baseline mechanic, не отключать gate.

---

## Шаг 7. Docs structure backfill

**Action:**

Создать минимум docs (universal sections из §5.1 core), если нет:

```bash
mkdir -p docs/{plans/{drafts/done,active/completed},reference,modules,operations,archive,changelog,audit}
```

Файлы — туда же, что и в greenfield Шаг 7. Но содержимое — **реальное состояние**, а не пустое:

| File | Содержимое для brownfield |
|---|---|
| `docs/CONTEXT.md` | Entry point с описанием **что-сейчас**, stack, links на UNIVERSAL_CORE |
| `docs/SESSION.md` | Заголовок + дата старта discipline + первая запись «Bootstrap brownfield» |
| `docs/DOCS_RULES.md` | Template или copy из stack-specific source |
| `AGENTS.md` (root) | Operational subset (для Codex/external agents) |
| `docs/plans/ROADMAP.md` | Заголовок + «В работе» (empty), «Что сделано» (если есть feature history), «Что дальше» (если known) |
| `docs/reference/module-routing.md` | **Реальные модули** проекта, классифицированные по zones (§8.1 core: platform/domain/connectors/orchestration) + status markers |
| `docs/reference/env-variables.md` | **Все** `process.env.*` из codebase (scan + populate) |
| `docs/reference/contracts.md` | Public interfaces (если есть) — backfill |
| `docs/reference/architecture-exemptions.md` | Список существующих exceptions (forwardRef pairs, @Global bridges) с reason'ом или TODO для reasonable explanations |

### 7.1 Module docs backfill

Для каждого модуля в проекте — создать `docs/modules/<name>.md` с шапкой:

```markdown
# <Module Name>

> Последняя верификация: YYYY-MM-DD (brownfield bootstrap)

> One-liner: что делает модуль.

## Overview
<2-3 sentences>

## Key Files
| Path | Purpose |
|---|---|
| ... | ... |

## REST API (если есть)
...

## Events emitted/consumed
...

## Dependencies
...

## Known debt
- (что в этом модуле имеет baselined violations — короткие notes)
```

**Не нужно фиксить debt — нужно его задокументировать**, чтобы LLM знала, что эти violations известны.

---

## Шаг 8. Write CLAUDE.md

**Action:**

Создать `CLAUDE.md` в корне (≤100 строк per §6 core).

Отличие от greenfield: в **Architecture invariants** упомянуть что есть baseline'ы:

```markdown
## Architecture invariants
- **6 порогов:** CC≤15, CY≤20, file≤600 LOC, fn≤80 LOC, depth≤5, params≤8 (per `UNIVERSAL_CORE.md` §2)
- **3 forbidden directions:** adapter→orchestration, orchestration→adapter, adapter→adapter
- **Baseline mechanic:** существующие violations в `.boundary-baseline.json` и `.cross-module-import-baseline.json` — известный долг. CI блокирует только NEW violations.
- **Cleanup-on-touch:** при касании файла с baselined violation — обязательно исправить и обновить baseline (см. skill `fix-cross-module-import`).
```

Остальные 7 sections (Language / Entry point / Default context boundary / Required validation command / Stack / DB access / Skills reference) — как в greenfield.

**Verify:**

```bash
wc -l CLAUDE.md
# ≤100
```

---

## Шаг 9. Install Skills + Hooks

**Action:**

Same as greenfield Шаг 9 + 10. Skills:

```
.claude/skills/
  route-new-logic/SKILL.md
  add-new-module/SKILL.md
  facade-decomposition/SKILL.md
  fix-cross-module-import/SKILL.md
  docs-sync-after-change/SKILL.md
  slice-draft-to-plans/SKILL.md
```

Hooks:

```
.claude/hooks/
  post-edit-lint.sh
  stop-session-check.sh
  session-start.sh
```

`chmod +x .claude/hooks/*.sh`

### 9.1 Brownfield-specific skill: `fix-cross-module-import` критичен

Этот skill активируется когда LLM касается файла с baselined violation. Без него cleanup-on-touch не работает. Убедиться что **description содержит триггер**:

```markdown
description: Use whenever you edit a file with cross-module relative imports
  (`../other-module/*`) detected in `.cross-module-import-baseline.json`.
  The cleanup-on-touch rule requires converting them to `@/{module}/public` or
  module-internal paths and updating the baseline. Triggers when touching any
  file listed in the baseline.
```

---

## Шаг 10. Initialize memory

**Action:**

```bash
# Claude Code path-encodes project directory: /Users/X/path/project → -Users-X-path-project
PROJECT_DIR_ENCODED=$(pwd | sed 's|/|-|g')
mkdir -p ~/.claude/projects/${PROJECT_DIR_ENCODED}/memory/
```

Создать `MEMORY.md` (≤200 строк) с **известными фактами из brownfield audit**:

```markdown
# Memory — <Project Name>

> Bootstrap'ed on YYYY-MM-DD from existing codebase.

## Feedback
- (создаётся когда user даёт правило)

## Project
- [Initial audit](project_initial_audit.md) — состояние на старте discipline (счёт violations)
- (другие in-progress инициативы по мере появления)

## Reference
- (где искать инфу в external системах)

## User
- (создаётся когда узнаём про user'а)
```

И создать `project_initial_audit.md`:

```markdown
---
name: Initial audit summary
description: Brownfield bootstrap audit — baselined violations counts, known debt
type: project
---

Initial audit YYYY-MM-DD (full snapshot: docs/audit/initial-state.md):

- Files >600 LOC: <count>
- Functions CC>15: <count>
- Boundary violations baselined: <count>
- Cross-module imports baselined: <count>
- Cycles known: <count> (e.g. ModuleA ↔ ModuleB through forwardRef)

**Why:** Brownfield bootstrap, discipline applied retroactively. Existing
violations are baselined; cleanup-on-touch reduces baseline organically.

**How to apply:** When editing a file in `<list>`, expect baselined violations.
Apply cleanup-on-touch (fix + update baseline). Do not panic from existing
violations — they are known debt.
```

---

## Шаг 11. Cleanup-on-touch enforcement

**Action:**

Эта policy критична для eventually-zero. Реализация:

### 11.1 Hook (детерминированная автоматизация)

`.claude/hooks/post-edit-lint.sh` (template из overlay § "Hook scripts") должен:

1. После Edit/Write/MultiEdit получить `file_path` из stdin
2. Проверить, упомянут ли file в `.boundary-baseline.json` или `.cross-module-import-baseline.json`
3. Если да — output в stdout: «File has baselined violations. Per cleanup-on-touch rule, fix them and update baseline».
4. Если нет — silent exit 0.

Пример bash:

```bash
#!/bin/bash
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [[ -z "$FILE_PATH" ]]; then exit 0; fi

# Check baselines
if grep -q "\"$FILE_PATH\"" .boundary-baseline.json 2>/dev/null \
   || grep -q "$FILE_PATH" .cross-module-import-baseline.json 2>/dev/null; then
  echo "⚠ Cleanup-on-touch: $FILE_PATH has baselined violations."
  echo "After your edit, run: <stack-specific update-baseline cmd> and fix violations in this file."
fi
exit 0
```

### 11.2 Skill (knowledge for LLM)

`.claude/skills/fix-cross-module-import/SKILL.md` — guide для LLM как преобразовать violation:
- Найти `../other-module/X` в file
- Заменить на `@/{module}/public` если есть, иначе на `@/<full-path>`
- Запустить `npm run lint:imports:update-baseline`
- Закоммитить fix + baseline update вместе

### 11.3 CI gate (blocking enforcement)

`lint:arch:diff` сравнивает changed files vs base ref **identity-based** (не counts):

- **Любая new violation identity** в touched файле → CI **FAIL** (exit 1)
- **Touched baselined file без strict reduction** identity set'а → CI **FAIL**
- **Fix one + introduce another** (totals equal но identities различаются) → CI **FAIL**

Не warning. Без этого fail-guard'а cleanup-on-touch не enforce'ится — в production runs LLM может subconsciously игнорировать warnings.

Реализация: `bootstrap/templates/scripts/architecture-diff-guard.cjs`. Detail логики — `overlays/<stack>.md` § "Cleanup-on-touch fail (closes core §4.3)".

---

## Шаг 12. Eventually-zero tracking

**Action:**

Добавить в SESSION.md / changelog периодический snapshot baseline size:

```bash
# Раз в неделю / sprint
wc -l .boundary-baseline.json .cross-module-import-baseline.json
```

Записать в `docs/SESSION.md`:

```markdown
### [YYYY-MM-DD] Baseline snapshot
- boundary violations: 47 (was 56 last week, -9)
- cross-module imports: 23 (was 28, -5)
- Trend: organic shrinking through cleanup-on-touch ✓
```

**Метрика:** baseline должна **монотонно уменьшаться**. Если растёт — значит cleanup-on-touch не работает, нужно investigate.

**Target:** baseline = `[]` через 6-12 месяцев (зависит от velocity). Не обязательно гнать к нулю — **направление** важнее.

---

## Шаг 13. First ralphex iteration (real feature, не cleanup)

**Action:**

**Не делать «cleanup sprint» как первую задачу.** Первый ralphex run — **real feature**. Это проверяет:

- Pipeline настроен правильно
- Все gates работают и не сюрпризят
- Codex external review подключён и passes
- Baseline mechanic корректно tolerates existing violations
- CI не блокирует на legacy debt

Создать первый план:

```bash
ralphex --plan "<какая-то небольшая feature, которая давно нужна>"
```

После accept:

```bash
ralphex docs/plans/active/<pack>-<slug>.md
```

**Verify pipeline successful end-to-end.** Если что-то сломалось — investigate, fix tooling/config, retry.

---

## Final verify checklist

- [ ] Pre-flight: working tree clean, ralphex ≥v1.1.0, codex enabled
- [ ] Initial audit doc в `docs/audit/initial-state.md`
- [ ] Overlay tooling установлен, все configs скопированы
- [ ] Baseline-файлы commit'нуты с **current violations** (не empty)
- [ ] CI runs все 9 gates, pass (т.к. fail только на NEW)
- [ ] `docs/` minimum structure backfill'ена
- [ ] `CLAUDE.md` ≤100 строк, упоминает baseline mechanic
- [ ] 6 universal skills + 3 hooks установлены
- [ ] Memory `MEMORY.md` + `project_initial_audit.md` созданы
- [ ] Cleanup-on-touch hook active и реагирует на baselined files
- [ ] Первый ralphex run успешный

Если все ✅ — brownfield bootstrap завершён.

---

## Anti-patterns (LLM не делает никогда)

### Migration sprint антипаттерн
- ❌ Создать план «refactor architecture for 4 weeks», отложить feature work
- ❌ `linter --fix` на весь проект в одном PR (huge diff = unreviewable)
- ❌ «Включим gates после того как починим все violations» — gates никогда не включатся

### Baseline антипаттерн
- ❌ `.boundary-baseline.json = []` на brownfield (вся работа заблокирована)
- ❌ Обновлять baseline без fix'а (cheating — добавляем долг)
- ❌ Игнорировать рост baseline («ну норм пока»)

### Discipline-skipping антипаттерн
- ❌ «Временно» отключить gate в CI («fix потом»)
- ❌ Skip codex external review «потому что mature codebase»
- ❌ `external_review_tool=none` после brownfield bootstrap

### CLAUDE.md антипаттерн
- ❌ Перенести весь legacy `docs/architecture.md` в CLAUDE.md (>>>100 строк)
- ❌ Не упомянуть baseline mechanic в Architecture invariants
- ❌ Документировать «как было раньше» — CLAUDE.md только про «как делаем сейчас»

### Audit антипаттерн
- ❌ Audit + fix в одной фазе — измерения нужны до изменений
- ❌ Audit без `docs/audit/initial-state.md` — snapshot потеряется
- ❌ Audit с правками README/docs — это уже не audit

---

## Различия brownfield vs greenfield

| Аспект | Greenfield | Brownfield |
|---|---|---|
| Baseline-файлы | `[]` (zero) | Current violations (frozen) |
| Initial audit | Не нужен | Обязателен (`docs/audit/initial-state.md`) |
| Module docs | Создаются с empty placeholders | Backfill реальных модулей с known debt |
| Module routing | Empty placeholder | Реальные модули классифицированы по zones + status markers |
| CLAUDE.md mentions baseline | Не упоминает (baseline = []) | Упоминает baseline mechanic |
| `architecture-exemptions.md` | Empty | Backfill существующих exceptions с reasons |
| First ralphex task | New feature from scratch | New feature (не cleanup) |
| Memory project entry | Optional | `project_initial_audit.md` обязателен |
| Cleanup-on-touch hook | Установлен но не активен (baseline=[]) | Активен (baseline=current) |
| Тест coverage starting | 0 (нет тестов) | Existing (что есть, то есть) |
| Eventually-zero metric | N/A (старт с zero) | Tracked, target ноль через 6-12 месяцев |

---

## Связанные документы

- `UNIVERSAL_CORE.md` — все principles, особенно §4.3 baseline mechanic
- `overlays/<stack>.md` — stack-specific tooling и configs
- `bootstrap/greenfield.md` — если проект на самом деле new (без кода)
