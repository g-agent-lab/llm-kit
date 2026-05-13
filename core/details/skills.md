# Skills — Writing Rules (Core §12 details)

> **Что выносится в Skills** — список в core §6.2 (CLAUDE.md). **Как они работают и пишутся** — здесь.

## Структура

```
~/.claude/skills/<name>/SKILL.md           ← глобальные (для всех проектов)
<project>/.claude/skills/<name>/SKILL.md   ← проектные
```

Frontmatter:

```markdown
---
name: skill-name
description: When to use — first sentences are the auto-trigger. Be specific, include trigger phrases.
---

# Skill content (markdown, 80-200 строк)
```

## Правила написания

1. **Description = auto-trigger.** Содержит триггерные слова на используемых языках (e.g. «create module» + «создать модуль»). Без чётких триггеров — skill не подхватывается.
2. **Объём 80-200 строк.** <80 — недостаточно контекста. >200 — слишком тяжёлый, разделить.
3. **Конкретность важнее обобщения.** Шаблоны кода, конкретные команды, табличные правила. ❌ «follow best practices» → ✅ «выполни шаги 1-7».
4. **Anti-patterns обязательной секцией.** Не только «как делать», но и «что НЕ делать» — LLM реже галлюцинирует.
5. **Связанные skills внизу.** Cross-references помогают LLM найти соседний skill, если задача шире.
6. **Skill не противоречит CLAUDE.md.** CLAUDE.md — source of truth базовых правил. Skill — extension для узкого сценария.
7. **Versioned with code.** Скиллы коммитятся в git (`<project>/.claude/skills/`).

## Anti-patterns

- ❌ Skill description = «when needed» (нет триггера → не подхватывается).
- ❌ Skill дублирует CLAUDE.md (правило не должно быть в двух местах).
- ❌ Skill >300 строк — порог LLM context efficiency теряется.
- ❌ Skill без anti-patterns секции — LLM достраивает по аналогии и галлюцинирует.
