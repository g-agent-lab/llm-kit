---
name: facade-decomposition
description: Use when a service approaches or exceeds 500 LOC AND a new change would add 100+ lines, OR a service has 3+ methods of the same subdomain, OR a constructor exceeds 8 params, OR cognitive complexity warnings appear on a single method. Triggers on "decompose service", "split this service", "extract sub-service", "разбить сервис", "facade", "service is too big". Loads the canonical facade + sub-services pattern with DI rewiring.
---

# Facade Decomposition — service ≥500 LOC

> Decomposition — часть задачи, не «потом». Если планируешь добавить 100+ LOC в файл уже ≥500 LOC — сначала декомпозируй, потом добавляй.
> Канон: `UNIVERSAL_CORE.md` §3.

## Шаг 1. Проверь триггеры

| Триггер | Когда применим |
|---|---|
| **Размер** | файл ≥500 LOC + новая задача добавит 100+ |
| **Subdomain** | 3+ метода одной темы (например, 3+ метода про availability в CalendarService) |
| **CC warning** | linter кричит на один метод (>15) — extract этот метод |
| **Конструктор** | >8 params → god-service signal, бить по dependencies |
| **Module size** | модуль ≥10 providers → бить sub-module с barrel |

Если ни один триггер — НЕ декомпозируй (over-engineering как раз тот плохой смысл — преждевременная абстракция).

## Шаг 2. Identify subdomain seams

Прочитай публичные методы сервиса. Сгруппируй по теме:

```
До:                                 После (facade):
class FooService {                   class FooService {              (facade)
  // group A (3 methods)               constructor(
  doA1() {}                              private a: FooASubService,
  doA2() {}                              private b: FooBSubService,
  doA3() {}                            ) {}
  // group B (4 methods)                doA1() { return this.a.doA1(); }
  doB1() {}                            ...
  doB2() {}                          }
  doB3() {}                          class FooASubService { ... }
  doB4() {}                          class FooBSubService { ... }
}
```

**Правила извлечения:**
- Sub-service несёт **связанный state/контракт** (не 3 случайных метода).
- Facade — **тонкий**: делегирует, не дублирует. Никакой бизнес-логики.
- Sub-service не импортирует другой sub-service напрямую — через facade или event.

## Шаг 3. Шаги извлечения (порядок важен)

1. **Прочитай** все методы целевой группы и их зависимости.
2. **Создай** `<module>/internal/<subdomain>.service.ts` (или `<module>/services/<subdomain>.service.ts` для крупных модулей).
3. **Перенеси** методы + приватные хелперы группы. Внешние зависимости — через constructor injection.
4. **В facade** замени тело методов на `return this.<subdomain>.<method>(...)`. Сигнатура и DI external — **прежние** (zero blast radius для callers).
5. **Module file**: добавь sub-service в `providers`. **Не экспортируй sub-service** (только facade в `public.ts`).
6. **Tests**: spec для каждого sub-service отдельно. Facade spec — только smoke test делегирования (1-2 кейса).

## Шаг 4. Не нарушить контракт

| Должно остаться неизменным | Почему |
|---|---|
| Имя facade-класса + сигнатуры публичных методов | Все callers работают без изменений |
| Module export (`public.ts`) | `@/{module}/public` не сломается |
| Behavior (одинаковый input → одинаковый output) | Это рефактор, не feature change |
| Test names публичного API | CI diff чистый |

**Что меняется:**
- Внутренняя структура.
- Module providers.
- Constructor signature facade (теперь sub-services).
- Появляются новые spec-файлы для sub-services.

## Шаг 5. CI verify

Stack-specific команды — в `overlays/<stack>.md` § "Command map":

- [ ] format check
- [ ] linter (включая complexity rules)
- [ ] cross-module imports — без новых нарушений
- [ ] deps:check — без новых циклов (sub-service → facade?)
- [ ] boundaries — без новых violations
- [ ] tests — zero regression на публичном API

Если `deps:check` ругается на цикл — sub-service пытается импортировать facade. Закрывай через interface или event.

## Антипаттерны

- ❌ Извлечь sub-service в **другой module** (это не декомпозиция, это перевешивание)
- ❌ Facade несёт логику + дублирует sub-service. Facade тонкий
- ❌ Sub-service A импортирует sub-service B напрямую → coupling. Только через facade или event
- ❌ Изменить публичную сигнатуру при декомпозиции (это feature, не refactor)
- ❌ Декомпозировать «впрок» при 200 LOC и одной задаче
- ❌ Размазать 1 группу методов между 3 sub-services. Группа = один sub-service
- ❌ Sub-service ≥ исходного размера → дробление неправильное

## Контрольные вопросы

1. Facade тонкий (только делегация)?
2. Sub-services независимы (нет direct sub→sub импортов)?
3. Constructor injection — у каждого sub-service ≤8 params?
4. Cognitive complexity ≤15 в каждом методе?
5. Tests для каждого sub-service отдельно?
6. Behavior эквивалентен (golden tests зелёные)?
7. `deps:check` — без новых циклов?

## Связанные skills

- `route-new-logic` — если задача требует **нового** модуля вместо декомпозиции
- `add-new-module` — если sub-service вырос до полноценного модуля
- `docs-sync-after-change` — если изменились public контракты
