---
name: docs-sync-after-change
description: Use AFTER editing code that adds/removes a database model, controller, environment variable read, public interface/contract, or module public API. Also use after completing all iterations of a plan draft, or when SESSION.md grows past 100 lines. Triggers on "added model", "new controller", "new endpoint", "new env var", "new interface", "module changed", "обнови документацию", "sync docs", "plan completed". Loads the trigger → doc-to-update mapping and SESSION.md rotation rule.
---

# Docs Sync After Change — синхронизация documentation с кодом

> docs lint блокирует CI: model count / controller coverage / env vars / contracts / plans structure должны быть актуальны.
> Цель — обновить doc **в том же коммите**, что и код. Не «обновлю потом».
> Канон: `docs/DOCS_RULES.md` + `UNIVERSAL_CORE.md` §5.

## Trigger → Doc mapping

| Изменил в коде | Обнови документ | Что именно |
|---|---|---|
| Schema migration (DB model) | `docs/reference/data-model.md` | Число моделей в header + секция новой модели |
| Новый controller / route file | `docs/reference/api-endpoints.md` | Новая секция (исключение: webhook controllers агрегируются в § Webhooks) |
| `process.env.X` / `os.environ['X']` read добавлен | `docs/reference/env-variables.md` | Новая запись с описанием и default |
| Новый public interface/type | `docs/reference/contracts.md` | Запись в правильной секции |
| Module public API изменился | `docs/modules/<module>.md` | Обнови содержимое + bump дату `> Последняя верификация: YYYY-MM-DD` |
| Новый agent/skill/tool (AI project) | `docs/registry/*.md` | Запись в соответствующем registry |
| Все итерации draft'а завершены | `docs/plans/drafts/<draft>.md` → `docs/plans/drafts/done/<draft>.md` | `git mv` + обнови `ROADMAP.md` |
| Любая значимая правка | `docs/SESSION.md` | Новая запись `### [YYYY-MM-DD] <title>` |
| `docs/SESSION.md` >100 строк | `docs/changelog/YYYY-MM.md` | Ротировать старые записи |

## Шаг 1. После каждой edit-сессии checklist

```
[ ] Изменён schema/data-model        → docs/reference/data-model.md
[ ] Создан/удалён controller         → docs/reference/api-endpoints.md
[ ] Появился process.env.NEW         → docs/reference/env-variables.md
[ ] Новый interface/contract         → docs/reference/contracts.md
[ ] Изменился public API модуля      → docs/modules/<name>.md (+ дата)
[ ] Agent/skill/tool изменён         → docs/registry/*.md
[ ] Draft завершён                   → mv в drafts/done/ + ROADMAP
[ ] Запись в SESSION.md              → ВСЕГДА
```

## Шаг 2. SESSION.md — формат записи

Добавляй запись СВЕРХУ блока активной сессии:

```markdown
### [YYYY-MM-DD] <Title>
- Файлы: `path/a`, `path/b`, ...
- Изменение: (1) ...; (2) ...; (3) ...
- Причина: <зачем — кратко, без процессных деталей>
```

Если за день несколько правок — оставь ОДНУ запись, объединив изменения в нумерованный список.

## Шаг 3. SESSION.md → changelog rotation

Если `wc -l docs/SESSION.md` >100:

1. Открой `docs/changelog/YYYY-MM.md` (текущий месяц; создай если нет)
2. Вырежи **старые** записи из SESSION.md (всё, кроме текущей сессии)
3. Вставь в начало changelog (sorted by date descending)
4. В SESSION.md внизу — маркер `_(Entries 2026-NN-DD and earlier rotated to changelog/YYYY-MM.md)_`
5. **Не теряй записей** — diff показывает только перенос

## Шаг 4. Завершение draft'а

Когда все iteration plans для draft'а в `plans/active/completed/`:

```bash
git mv docs/plans/drafts/<NN-name>.md docs/plans/drafts/done/<NN-name>.md
```

Обнови `ROADMAP.md`:
- В таблице «Что сделано» — добавь строку
- В блоке «Активные Drafts» — `~~[name](drafts/done/...)~~ (completed)`
- Если был «В работе» — убери

## Шаг 5. Run validators

Stack-specific команды — в `overlays/<stack>.md`:

```bash
<docs-lint-cmd>
<arch-diff-cmd>
```

Если `docs-lint` падает — **исправь doc**, не отключай check.

## Антипаттерны

- ❌ «Обновлю docs в отдельном PR» — забывается, drift накапливается
- ❌ Скопировал старую запись SESSION.md и забыл поменять дату/файлы
- ❌ Добавил controller, но не добавил в `api-endpoints.md` — CI красный
- ❌ Удалил env var из кода, но не из `env-variables.md` — drift
- ❌ Перенёс draft в `done/`, забыл обновить `ROADMAP.md` → roadmap-consistency fail
- ❌ SESSION.md растёт без ротации → 500+ строк, LLM плохо ориентируется
- ❌ Обновил content модуля, забыл bump дату верификации

## Контрольные вопросы

1. Каждый из 8 trigger'ов проверен?
2. SESSION.md содержит запись о текущей работе?
3. `docs-lint` зелёный?
4. Если SESSION.md >100 строк — ротация сделана?
5. Если draft завершён — `git mv` + ROADMAP обновлён?

## Связанные skills

- `add-new-module` — после создания модуля обязательно: `modules/<name>.md` + `module-routing.md`
- `route-new-logic` — если непонятно, в каком модуле задокументировать interface
- `facade-decomposition` — после декомпозиции обнови `modules/<name>.md` (новые sub-services в Key Files)
