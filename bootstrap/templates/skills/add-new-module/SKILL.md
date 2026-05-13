---
name: add-new-module
description: Use when the user asks to create a new module, new domain, new service grouping, new bounded context, or "add module X". Triggers on phrases like "create module", "add new module", "новый модуль", "создать модуль", "добавить модуль". Loads the canonical facade + sub-services pattern, public.ts requirements, kind classification, and registration steps.
---

# Создание нового модуля

> Запускается когда пользователь просит создать новый модуль/домен.
> Цель — модуль с самого начала соблюдает архитектурные правила, не «дотачивается» потом.
> Канон: `UNIVERSAL_CORE.md` §1 (DAG) + §3 (decomposition) + §6.2 (public.ts).

## Шаг 1. Классифицировать слой (kind)

| Слой | Когда выбирать |
|---|---|
| **shared** | platform: config, db client, auth, health, общие types/utils, contracts |
| **infra** | сквозной технический сервис: websocket, queues, embeddings, metrics, DLQ |
| **domain** | бизнес-сущность с операциями (calendar, user, payment, etc.) |
| **orchestration** | оркестрация: brain, execution, workflows, actions, scheduler |
| **adapter** | внешняя интеграция (per provider — каждый изолирован) |

Если непонятно — спросить пользователя. Никогда не угадывай слой.

## Шаг 2. Создать структуру facade + sub-services

Модуль СРАЗУ стартует как facade + минимум 1 sub-service. Профилактика «add one more method» drift.

Минимальная структура (адаптируется под стек, см. `overlays/<stack>.md`):

```
<src>/<module-name>/
  <module-name>.module.ts          ← DI wiring (если стек поддерживает)
  <module-name>.service.ts         ← facade (тонкий, делегирует sub-services)
  <module-name>.controller.ts      ← если есть REST endpoints
  public.ts                        ← barrel для external imports
  dto/                             ← request/response types
  internal/                        ← приватные sub-services
    <subdomain>.service.ts         ← узкий sub-service
  __tests__/                       ← test fixtures
  *.spec.ts                        ← unit tests рядом с файлами
```

## Шаг 3. public.ts — обязательный barrel

External code обязан ходить через `@/{module}/public` (или эквивалентный alias стека).

```typescript
// public.ts
export { <Module>Service } from './<module>.service';
export type { <Public>Dto } from './dto/<public>.dto';
// НЕ экспортировать internal/* — private implementation
```

## Шаг 4. Не нарушить forbidden directions

Перед импортом проверь по таблице (§1.2 core):

| Откуда | Куда | Можно? |
|---|---|---|
| shared | upper layers | ❌ (только через bridge module с обоснованием) |
| infra | domain/orchestration/adapter | ❌ |
| domain | orchestration/adapter | ❌ |
| orchestration | adapter | ❌ (используй interface в `shared/common/interfaces/`) |
| adapter | orchestration | ❌ (используй EventEmitter / pub-sub) |
| adapter | adapter | ❌ (каждый изолирован) |

Если нужно нарушить — это значит, что нужен **bridge module** или **shared interface**. Не нарушай — спроси.

## Шаг 5. Зарегистрировать в композиционном root

Если модуль относится к aggregate-only модулю (см. `docs/reference/module-routing.md`) — импортируй туда. Иначе — в root composition.

`@Global()` (или эквивалент стека) — только с обоснованием в `docs/reference/architecture-exemptions.md`.

## Шаг 6. Обновить документацию

Параллельно с созданием модуля:

- [ ] `docs/modules/<module-name>.md` по template `docs/DOCS_RULES.md`
- [ ] Добавить модуль в `docs/reference/module-routing.md` (zone + status marker `active`)
- [ ] Если новые контракты → `docs/reference/contracts.md`
- [ ] Если REST endpoints → `docs/reference/api-endpoints.md`

## Шаг 7. Контрольный прогон

Stack-specific команды — в `overlays/<stack>.md` § "Command map":

- [ ] format check
- [ ] linter (включая boundaries, sonarjs/complexity)
- [ ] cross-module imports check
- [ ] deps cycles check
- [ ] docs lint
- [ ] tests green

Если хоть один gate падает — фиксить сразу, не накапливать.

## Контрольные вопросы перед merge

1. Модуль ≤600 LOC во всех файлах?
2. Все методы ≤80 LOC, CC ≤15?
3. Конструктор / function signature ≤8 params?
4. Есть `public.ts` если модуль публичный?
5. Нет cross-module relative imports (`../other-module/*`)?
6. Документация обновлена + дата верификации?
7. Тесты есть для каждого нового метода?

Если «нет» хоть на один — модуль не готов.

## Антипаттерны

- ❌ Создать один большой `<module>.service.ts` на 800 LOC «потом разделим»
- ❌ Экспортировать всё через `index.ts` вместо `public.ts` (теряется enforcement)
- ❌ Импортировать `../other-module/internal/foo` напрямую (нарушение barrel)
- ❌ Положить модуль в неправильный слой, чтобы «обойти» правило DAG
- ❌ Забыть регистрацию в композиционном root → модуль не подхватится
- ❌ Создать модуль без `public.ts` если он используется снаружи

## Связанные skills

- `facade-decomposition` — если сервис вырос ≥500 LOC
- `add-bridge-module` — если нужен `@Global()` с upper-layer токеном (если skill установлен)
- `docs-sync-after-change` — обновление documentation reference
- `route-new-logic` — если непонятно в какой слой/zone класть модуль
