# Codebase Map (Core §18 details)

> **Цель:** дать LLM быструю карту «что где лежит», чтобы не читать random файлы через grep. Снижает context waste при заходе в проект.

## Что такое codebase map

Один markdown-файл с **актуальной** структурой кода: модули, их назначение, key files, зависимости. **Generates от reality**, не пишется руками с нуля.

## Where it lives

`docs/reference/codebase-map.md`. Параллельно с `module-routing.md`:

| Файл | Что |
|---|---|
| `docs/reference/module-routing.md` | **WHERE** новую логику класть (decision-making) |
| `docs/reference/codebase-map.md` | **WHAT уже есть и где** (navigation) |

## Структура файла

```markdown
# Codebase Map

> Last generated: YYYY-MM-DD by `<script>`

## Module index

| Module | Path | Kind | Status | LOC | Public | Brief |
|---|---|---|---|---|---|---|
| auth | api/src/auth/ | shared | active | 234 | yes | Clerk auth integration |
| brain | api/src/brain/ | orchestration | active | 1088 | yes | AI agent runtime |
| ... | ... | ... | ... | ... | ... | ... |

## Public surface

Список всех публичных barrels с exported types:

| Path | Exports |
|---|---|
| api/src/brain/public.ts | BrainService, BrainResult, IBrain |
| ... | ... |

## Dependency graph (high-level)

<ASCII diagram или mermaid с key relationships, generated>

## Hot files (most modified, last 30 days)

| File | Commits |
|---|---|
| api/src/brain/brain.service.ts | 23 |
| ... | ... |
```

## Generation script (overlay-specific)

Codebase map **генерируется** скриптом, не пишется руками. Скрипт:

| Источник | Что извлекает |
|---|---|
| Filesystem scan | Modules + paths + LOC |
| `git log --since="30 days ago" --name-only` | Hot files |
| Public barrel (`public.ts` / `__init__.py` / etc.) | Public exports |
| `module-routing.md` | Kind classification + status markers |
| Linter / dep-cruiser output | Cross-module dependencies |

Конкретный скрипт — `overlays/<stack>.md` § "Codebase map generator". Универсальный shape — Node.js скрипт reading filesystem + git.

## Update cadence

| Trigger | Action |
|---|---|
| Pre-PR (если значимое изменение structure) | Re-generate, commit с code change |
| Weekly cron / scheduled | Auto-generate + open PR if diff |
| Manual on demand | `npm run codebase-map` или эквивалент |

## Правила использования LLM

| Правило | Применение |
|---|---|
| **Перед `grep` / `find` для навигации — посмотри map** | Быстрее и точнее |
| **Если map устарел (>30 days)** — re-generate перед использованием | Stale map хуже чем `grep` |
| **Map ≠ source of truth для контрактов** | Контракты — `contracts.md` / public barrel, map только navigation |

## Anti-patterns

- ❌ Codebase map пишется руками и редактируется в каждом PR (drift)
- ❌ Map содержит implementation details (signatures, internals) — это в `modules/*.md`
- ❌ Использовать map когда устарел >30 days — re-generate сначала
- ❌ Skip map и сразу `grep` — теряем context economy
