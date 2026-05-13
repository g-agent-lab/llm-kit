# Правила ведения документации

> Этот файл — source of truth для структуры и актуальности `docs/`.
> При сомнениях — проверь по правилам ниже.
> Канон над этим: `UNIVERSAL_CORE.md` §5.

## Структура plans/

```
plans/
  ROADMAP.md              ← компактный overview (~100-150 строк)
  drafts/                 ← общие планы для обсуждения с LLM
    done/                 ← drafts, по которым все ralphex-итерации завершены
  active/                 ← ralphex-итерации (готовые к выполнению)
    completed/            ← ralphex CLI автоматически кладёт сюда после успеха (native layout)
```

### Lifecycle плана

```
1. Идея → строчка в ROADMAP.md "Что дальше"
2. Проработка → plans/drafts/NN-feature-name.md (обсуждение с LLM, NN-prefix = current priority)
3. Нарезка → plans/active/<pack-id>-<slug>.md (ralphex-iteration plans, ссылка на draft в header)
4. Запуск ralphex → CLI автоматически перемещает успешный план в plans/active/completed/
5. Все итерации draft'а в active/completed/ → draft в drafts/done/ (manual)
6. Обновить ROADMAP.md (строчка из "дальше" → "сделано")
```

### Правила

- В root `plans/` нет .md файлов кроме `ROADMAP.md`
- Каждый ralphex-план в `active/` имеет в шапке ссылку на draft
- `active/completed/` управляется ralphex CLI (`move_plan_on_completion=true`); вручную туда ничего не кладём
- `drafts/done/` содержит только drafts, по которым ВСЕ итерации в `active/completed/`
- Live drafts в `drafts/` используют sortable numeric prefix `NN-`, совпадающий с порядком в `ROADMAP.md`
- При изменении priority draft'а — переименовать файл и обновить ссылки в `ROADMAP.md`

## Entry points

| Файл | Правила |
|------|---------|
| `README.md` | Стек, числа тестов, tree — соответствуют реальности |
| `CONTEXT.md` | Entry point для LLM. Нет длинных таблиц «✅ done». Ссылки на `plans/`. Пометка: «`archive/` и `plans/active/completed/` — не читать по умолчанию» |
| `SESSION.md` | Только текущие записи. >100 строк → ротировать в `changelog/YYYY-MM.md` |
| `AGENTS.md` | Operational subset для external agents (Codex и др.). Synced с CLAUDE.md |

## Reference docs

| Файл | Что проверять (docs-lint) |
|------|---------------|
| `reference/data-model.md` | Число моделей = `grep -c "^model " api/prisma/schema.prisma` (или эквивалент стека) |
| `reference/api-endpoints.md` | Каждый файл `*.controller.ts` (или route file) имеет секцию |
| `reference/env-variables.md` | Все `process.env.*` / `os.environ.*` из source перечислены |
| `reference/contracts.md` | Ключевые интерфейсы / schemas перечислены |
| `reference/module-routing.md` | Реальные модули проекта классифицированы по zones + status markers |
| `reference/architecture-exemptions.md` | Все bridge modules / @Global() / documented exceptions перечислены |

## Module docs

- Каждый `modules/*.md` имеет метку `> Последняя верификация: YYYY-MM-DD`
- Дата верификации не старше 2 месяцев при активной разработке модуля
- Если модуль существенно менялся с даты верификации — обновить doc + bump дату

## ROADMAP.md

- «В работе» = каждый элемент имеет файл в `plans/active/`
- «Что дальше» = каждый элемент с draft'ом имеет файл в `plans/drafts/`
- Нет «в работе» элементов без файла в `active/`
- Нет завершённых элементов, всё ещё в «В работе»

---

## Module doc template

Каждый `modules/*.md` следует этой структуре:

### Обязательные секции (в порядке)

1. `# Module Name` — h1
2. `> Последняя верификация: YYYY-MM-DD` — дата верификации
3. `> One-liner description` — что делает модуль (1-2 предложения)
4. `## Overview` — 2-5 предложений: назначение и scope
5. `## REST API` — таблица endpoints (skip если нет controller)
6. `## Key Files` — таблица: путь + назначение
7. `## Events` — emitted / consumed events (skip если нет)
8. `## Dependencies` — что модуль импортирует и кто импортирует его

Дополнительные секции (domain-specific) допускаются после обязательных.

### Запрещено в live module docs

- `<!-- Related: ... -->` — старые комментарии (удалить или → `## Dependencies`)
- Таблицы статуса реализации (`| Компонент | Статус | Путь |`) — перенести в `archive/`
- Inline `> **Статус реализации:**` блоки — удалить

---

## SESSION.md — формат записи

```markdown
### [YYYY-MM-DD] <Title>
- Файлы: `path/a`, `path/b`, ...
- Изменение: (1) ...; (2) ...; (3) ...
- Причина: <зачем — кратко, без процессных деталей>
```

Если за день несколько правок — оставь ОДНУ запись, объединив изменения в нумерованный список.

## SESSION.md → changelog ротация

Если `wc -l docs/SESSION.md` >100:

1. Открыть `docs/changelog/YYYY-MM.md` (текущий месяц; создать если нет).
2. Вырезать **старые** записи из SESSION.md (всё, кроме текущей сессии).
3. Вставить в начало changelog (sorted by date descending).
4. В SESSION.md внизу — маркер `_(Entries 2026-NN-DD and earlier rotated to changelog/YYYY-MM.md)_`.
5. **Не теряй ни одной записи** — diff должен показать только перенос.

---

## Команда проверки для LLM-сессии

Вставь этот промпт в начале сессии для аудита:

```
Прочитай docs/DOCS_RULES.md и проведи полную проверку:

1. Структура plans/: правила из «Структура plans/»
2. Entry points: правила из «Entry points»
3. Reference docs: правила из «Reference docs»
4. ROADMAP.md: правила из «ROADMAP.md»

Выведи список нарушений. Если нарушений нет — напиши «Docs OK».
```
