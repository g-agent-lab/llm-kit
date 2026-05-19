# Memory Layer (Core §10 details)

> **Mandatory (Claude Code = primary developer).** Memory — built-in mechanism для cross-session continuity. Не option, не disclaimer — часть workflow.

## Что это и где живёт

**Memory** — слой между «контекстом текущей сессии» (truncates) и «постоянной документацией» (project-wide). Хранит то, что:
- Должно сохраниться между сессиями
- Не должно быть в коде / docs (это не код и не reference)

**Путь:** `~/.claude/projects/<path-encoded-project-dir>/memory/` (Claude Code-managed).

Конкретное имя директории Claude Code формирует path-encoding:
`/Users/<user>/code/MyApp` → `-Users-<user>-code-MyApp`

Получить точное имя:
```bash
ls ~/.claude/projects/ | grep <project-name>
```
после первого старта Claude Code в проекте.

## 4 типа memory (что туда идёт)

| Тип | Что | Пример |
|---|---|---|
| **user** | Роль user'а, экспертиза, preferred communication style | «User не разработчик; объяснять low-code level» |
| **feedback** | Корректировки от user (что делать / не делать) | «Don't mock the database in tests» |
| **project** | In-progress инициативы, дедлайны, decisions с context | «Migrating off Hostaway → 2026-04-21 deadline» |
| **reference** | Где искать инфу в external системах | «Bugs tracked in Linear project INGEST» |

## Что НЕ идёт в memory

- ❌ **Архитектурные patterns** (это в CLAUDE.md / `UNIVERSAL_CORE.md` / Skills)
- ❌ **Code conventions** (это в lint configs)
- ❌ **Git history** / activity logs (есть `git log`)
- ❌ **Debugging recipes** (фикс уже в коде, контекст в commit message)
- ❌ **Ephemeral state** (текущая task — в TodoWrite/Plan, не в memory)

## Структура

```
memory/
  MEMORY.md              ← индекс, ≤200 строк, всегда в контексте
  user_<topic>.md
  feedback_<topic>.md
  project_<topic>.md
  reference_<topic>.md
```

**MEMORY.md** — это **только индекс**, не storage. Одна строка на запись формата `- [Title](file.md) — one-line hook`. Содержимое — в отдельных topic files.

## Frontmatter обязательный

Каждый memory file:

```markdown
---
name: <memory name>
description: <one-line, used to decide relevance>
type: user | feedback | project | reference
---

<содержимое>
```

Для **feedback / project** body структурируется: rule/fact + `**Why:**` + `**How to apply:**`.

## Lifecycle rules

| Правило | Что значит |
|---|---|
| **Verify-before-recommend** | Memory может protухнуть. Перед action на основе memory — проверить, что упомянутое (file path, function, flag) **существует в текущем коде**. Stale memory → обновить или удалить. |
| **Update or remove stale** | Если memory противоречит наблюдаемому состоянию — trust observed, update memory. |
| **Index ≤200 строк** | Если MEMORY.md перерастает — выносить detail в topic files. |
| **No duplicates** | Перед write check, нет ли существующего file для той же темы. |
