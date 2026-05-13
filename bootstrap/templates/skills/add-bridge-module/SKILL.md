---
name: add-bridge-module
description: Use when the shared/infra layer needs access to a token or service that lives in an upper layer (orchestration/adapter), and you cannot resolve it through normal DAG-allowed direction. Triggers on "global token", "@Global() service", "shared needs upper-layer token", "create bridge module", "DI bridge", "поднять токен в shared", "Global сервис". Requires explicit entry in architecture-exemptions.md.
---

# Add Bridge Module (DI exemption for shared → upper-layer token access)

> **Когда применяется:** shared/infra layer нужно использовать сервис/токен из upper layer (orchestration / adapter). Normal DAG forbids это direction.
> **Цель:** создать **explicit, documented bridge module** который повышает токен в shared layer, без нарушения DAG.
> **Канон:** `UNIVERSAL_CORE.md` §1.4 (Bridge modules) + `docs/reference/architecture-exemptions.md`.

## Когда НЕ применять (попробуй другие подходы сначала)

| Альтернатива | Когда лучше bridge |
|---|---|
| EventEmitter / pub-sub | Если возможно асинхронное взаимодействие (event-based) |
| Interface в `shared/common/interfaces/` + concrete impl в upper layer | Если token нужен type-only / contract-only |
| Inject через caller (constructor param) | Если scope маленький — один сервис, один call site |
| Перенести логику в lower layer | Если upper-layer feature на самом деле belongs to domain/shared |

Bridge module = последняя опция. Если можешь без него — без него.

## Шаги создания bridge module

### Step 1: Identify the exact token to bridge

Что именно нужно lower layer'у? Конкретный класс? DI injection token (string/Symbol)? Interface?

Минимизируй surface — bridge должен expose **минимум**.

### Step 2: Создать bridge module в shared layer

Путь: `<src>/common/<feature>-bridge/` (или эквивалент стека). Bridge:
- Импортирует upper-layer module/service
- Re-exports token в shared scope с globally-injectable scope (framework-specific decorator/registration)
- Использует **useExisting** semantics (token resolves to same instance, не new injection)

Framework-specific concrete examples — в overlay (`overlays/<stack>.md` §12.3 для NestJS, или эквивалент).

Минимальная shape (framework-agnostic):

```
shared/common/<feature>-bridge/
  <feature>-bridge.module.<ext>         ← composition file (DI wiring)
  index.<ext>                            ← exports TOKEN type/symbol
```

Composition rules:
1. Module imports upper-layer module
2. Provider registration uses **useExisting** (alias) — не **useClass** (new instance)
3. Token exposed via shared barrel
4. Mark globally-accessible через framework idiom (NestJS `@Global()`, Spring `@Component(scope=singleton)`, Django `INSTALLED_APPS` global, etc.)

### Step 3: Document в architecture-exemptions.md

**Без этого записи bridge невалиден.** В `docs/reference/architecture-exemptions.md` добавить:

```markdown
## <Feature>BridgeModule

**Path:** `<src>/common/<feature>-bridge/<feature>-bridge.module.ts`
**Reason:** <one sentence — why this exemption is needed>
**Token exposed:** `<TOKEN>` (resolves to `<UpperService>`)
**Consumers in shared/infra:** `<list of services that use this token>`
**Date introduced:** YYYY-MM-DD
**Alternative considered:** <which alt was tried and why it didn't work>
```

### Step 4: Register в композиционном root

`AppModule.imports`:

```typescript
@Module({
  imports: [
    // ...
    <UpperModuleThatExportsToken>,
    <Feature>BridgeModule,    // <-- after the upper module so token is available
    // ...
  ],
})
```

### Step 5: Update linter exemptions (если нужно)

Если dependency-cruiser / boundaries plugin flag'ит import upper → bridge → shared как violation, добавить bridge module в **explicit allowlist** в `<linter>.config` с link на `architecture-exemptions.md`.

### Step 6: Tests

- Spec для bridge module: token resolves correctly.
- Integration test: consumer service в shared/infra успешно получает token.

## Anti-patterns

- ❌ Создать bridge module **без записи** в `architecture-exemptions.md`. Без записи bridge невалиден.
- ❌ Использовать bridge module для удобства, когда EventEmitter / interface работает.
- ❌ Bridge exposes больше чем нужно (whole service вместо одного token).
- ❌ Bridge module **в той же** layer как target token (нет смысла — нет cross-layer).
- ❌ Множество bridge modules для одной upper-layer feature (consolidate).
- ❌ Bridge module без `@Global()` или эквивалент — теряется suitability для shared layer.

## Контрольные вопросы

1. Альтернативы (event / interface / inject through caller) реально не подходят?
2. Token surface минимальный (один token, не whole service)?
3. Запись в `architecture-exemptions.md` создана с reason + date + consumers list?
4. Bridge зарегистрирован в композиционном root **после** upper module?
5. Linter exemption added если нужно?
6. Specs для bridge resolution + consumer integration?

## Связанные skills

- `add-new-module` — если bridge — реально новый модуль на shared layer
- `route-new-logic` — если непонятно нужен ли bridge или есть лучшая опция
- `docs-sync-after-change` — для обновления `architecture-exemptions.md` обязательно
