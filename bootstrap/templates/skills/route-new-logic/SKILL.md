---
name: route-new-logic
description: Use BEFORE editing any non-trivial code in this repo to decide which module owns the change. Triggers on "where should X live", "куда положить", "в какой модуль", "this should go into", "add logic for", "extend module", "add behaviour", any task that adds a new method/route/handler/listener. Loads the canonical routing zones, status markers (aggregate-only, frozen, legacy), and decision rules.
---

# Route New Logic — где должна жить новая логика

> Запускайся ДО редактирования кода. Цель — выбрать единственный правильный модуль за 3 шага.
> Канон: `docs/reference/module-routing.md`. Этот skill — short-form классификатор.

## Шаг 1. Определи zone

Universal минимум 4 zones (`UNIVERSAL_CORE.md` §8.1):

| Zone | Признак задачи |
|---|---|
| `platform` | infra: db, auth, config, common types, contracts, health |
| `domain` | бизнес-сущности и domain logic (любого типа) |
| `connectors` | внешние API adapters (изолированные per provider) |
| `orchestration` | runtime: brain/agent, scheduler, workflows, actions |

Если проект имеет специфические zones (`workspace`, `knowledge`, `workforce`, etc.) — они в `docs/reference/module-routing.md`. Использовать только zones из живой проектной route-map, не выдумывать.

**Правило:** выбирай **самый узкий реальный домен**, не aggregate wrapper.

## Шаг 2. Проверь статус целевого модуля

В `docs/reference/module-routing.md` каждый модуль имеет один из status markers:

| Маркер | Что значит для LLM |
|---|---|
| **active** | Normal module, новую логику класть можно |
| **aggregate-only** | Composition shell (wiring), бизнес-логику не добавлять — только DI / re-export |
| **frozen-pending-transform** | Read-only, ожидает рефакторинга — новые edits запрещены |
| **frozen-pending-removal** | Read-only, ожидает удаления — новые edits запрещены |
| **legacy-confirmed** | Superseded — использовать canonical replacement (указано рядом) |
| **support-shrinking** | Functionality сокращается — расширять запрещено |
| **transition-only** | Migration / cutover — расширять только если задача explicitly transitional |

Если модуль НЕ `active` — идти на canonical replacement (или спросить user).

## Шаг 3. Decision overrides (приоритет над инерцией)

В `docs/reference/module-routing.md` § "Decision overrides" / "Agent-First decisions" — явные правила приоритета. Проверь их перед выбором финального модуля.

Примеры универсальных override-паттернов:

| Задача | Не туда (легаси) | Туда (canonical) |
|---|---|---|
| Agent execution logic | старый workflow engine | brain + tools |
| Action creation | bypass центрального сервиса | canonical create entrypoint |
| Channel send | legacy adapter | canonical connector |
| Metrics endpoint | старый metrics модуль | typed event log |

Конкретный список — в проектной route-map.

## Шаг 4. Cross-zone — write set + crossings

Если изменение реально пересекает zones:

- **Write set** держи в **owning zone** (где живёт бизнес-смысл).
- **Crossings** — через events (`EventEmitter2` / pub-sub), interfaces в `platform/common/interfaces/`, или bridge module (см. skill `add-bridge-module` если есть).
- Не тащи прямой импорт через 3 forbidden directions: `adapter → orchestration`, `orchestration → adapter`, `adapter → adapter`.

## Антипаттерны

- ❌ Положить новую логику в aggregate-only потому что «там уже есть похожее»
- ❌ Расширять legacy-confirmed модуль вместо canonical replacement
- ❌ Bypass canonical creation entrypoint «для скорости»
- ❌ Импортировать через aggregate (CompositionModule) вместо child (concrete module's public.ts)
- ❌ Edit'ить frozen-* модуль без явного user authorization

## Контрольные вопросы

1. Zone определена однозначно из universal 4 или проектных?
2. Целевой модуль `active`, не aggregate-only / frozen / legacy?
3. Decision overrides проверены, нет правила которое перенаправляет?
4. Write set в owning zone, crossings через events / interfaces / bridge?

Если хоть один «нет» — перечитай `docs/reference/module-routing.md` полностью.

## Связанные skills

- `add-new-module` — если zone выбрана и нужен новый модуль
- `facade-decomposition` — если целевой сервис уже ≥500 LOC
- `docs-sync-after-change` — после edit'а с триггерами model/controller/env/contract
