# Hooks — Writing Rules (Core §13 details)

> **Что выносится в Hooks** — список в core §6.3 (CLAUDE.md). **Контракт скрипта и правила** — здесь.

## Структура

```
<project>/.claude/
  settings.json              ← регистрация hooks (versioned в git)
  hooks/
    post-edit-lint.sh
    stop-session-check.sh
    session-start.sh
```

Глобальные hooks — `~/.claude/settings.json` + `~/.claude/hooks/`.

## Контракт скрипта

| Channel | Format |
|---|---|
| **stdin** | JSON с данными события (`tool_input`, `file_path` для PostToolUse и т.д.) |
| **stdout** | Текст для добавления в контекст LLM (или для пользователя на SessionStart) |
| **stderr + exit 2** | Блокировка действия + показать сообщение LLM (используется в Stop) |
| **exit 0** | OK, продолжай |
| **timeout** | Обязателен в `settings.json`. Иначе зависший скрипт повесит сессию. |

## Правила написания

1. **Быстрые.** ≤2 секунд для PostToolUse/Stop. Тяжёлое — в background.
2. **Тихие.** Молчат при OK, шумят только при проблеме. Иначе засоряют контекст.
3. **Non-blocking by default.** Блокировать (exit 2) только критичное: попытка commit'нуть secret, забытый SESSION.md update после code change.
4. **Fail-safe.** Если падает или внешний инструмент не найден → молча exit 0. Сломанный hook не должен ломать работу.
5. **Idempotent.** Многократный запуск на одном файле даёт одинаковый результат.

## Skills × Hooks paired discipline

Skills говорят LLM **что** делать (knowledge). Hooks делают **за** LLM (automation, не зависит от LLM памяти). Они работают парой:

| Discipline | Skill (знание) | Hook (автоматика) |
|---|---|---|
| Module creation | `add-new-module` (правила) | `post-edit-lint` (lint после создания) |
| Code changes | `route-new-logic` (где) | `post-edit-lint` (проверка boundary) |
| Session hygiene | `docs-sync-after-change` (что обновить) | `stop-session-check` (блок Stop пока не обновлено) |
| Session start | — | `session-start` (load git status + SESSION.md) |
