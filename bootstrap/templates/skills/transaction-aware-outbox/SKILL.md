---
name: transaction-aware-outbox
description: Use when working with the outbox pattern (event sourcing) and writing outbox records inside a database transaction. Triggers on "outbox in transaction", "enqueue event", "send event after commit", "outbox pattern", "tx-aware outbox", "запись в outbox", "event-driven write". Loads the two-step enqueueInTx + emitEnqueued pattern that prevents race conditions and ghost events on rollback.
---

# Transaction-Aware Outbox (event-driven writes)

> **Когда:** проект использует outbox pattern для гарантии atomicity «commit DB row + emit event».
> **Проблема:** наивная запись outbox внутри транзакции пишет row **вне** tx boundary → race condition (event seen by consumer до того как main row committed) + ghost events на rollback (outbox row остаётся когда tx failed).
> **Решение:** **two-step pattern** — `enqueueInTx(tx, data)` внутри транзакции + `emitEnqueued(data)` ПОСЛЕ commit.
> **Канон:** `UNIVERSAL_CORE.md` §16 + `core/details/data-migration.md`.

## Когда триггерится skill

| Trigger | Источник |
|---|---|
| Code edits в transaction block + outbox interaction | LLM при write проверяет |
| User: «add event emission after this commit» | Direct |
| User: «outbox in tx» | Direct |
| Refactor old `enqueue()` calls inside `$transaction` | Cleanup |

## Two-step pattern (mandatory)

### Step 1: Inside transaction

```typescript
// Внутри $transaction(tx => { ... }):
const { record, shouldEmit } = await outboxService.enqueueInTx(tx, {
  type: 'order.created',
  payload: { orderId: order.id },
  idempotencyKey: `order.created.${order.id}`,
});
```

- `enqueueInTx(tx, data)` — пишет outbox row через переданный `tx` (а не через root client).
- Возвращает `{ record, shouldEmit }`.
- `shouldEmit` — флаг: was outbox row **inserted** (true) или **deduped** by `idempotencyKey` (false).

### Step 2: After transaction commits

```typescript
// ПОСЛЕ $transaction завершилась (вышли из callback):
if (shouldEmit) {
  outboxService.emitEnqueued({ type: 'order.created' });
}
```

- `emitEnqueued(data)` — wake-up hint для processor (EventEmitter / event bus).
- НЕ duplicates DB write — это только notification что outbox row есть.
- Если processor работает на cron — `emitEnqueued` опционально (processor podберёт через polling). Если нужна low-latency обработка — обязательно.

## Полный flow

```typescript
const result = await prisma.$transaction(async (tx) => {
  const order = await tx.order.create({ data: { ... } });
  const { shouldEmit } = await outboxService.enqueueInTx(tx, {
    type: 'order.created',
    payload: { orderId: order.id },
    idempotencyKey: `order.created.${order.id}`,
  });
  return { order, shouldEmit };
});

if (result.shouldEmit) {
  outboxService.emitEnqueued({ type: 'order.created' });
}
```

## Conditional: idempotency key

| Когда |
|---|
| Operation повторяется (e.g. retry) → нужно деduping outbox |
| Multiple writers → race condition |
| Webhook handlers (могут retries) |

Без `idempotencyKey` каждый `enqueueInTx` создаёт **новую row** → дубликаты event'ов consumer'у.

Format key: `<event-type>.<unique-source-id>` (e.g. `order.created.123`, `payment.confirmed.<paymentId>`).

## Standalone calls (no transaction)

Если нет транзакции (single op):

```typescript
await outboxService.enqueue({ type: 'health.check', payload: {} });
// Internally: root client + emit вместе.
```

`enqueue(data)` (без tx) — для standalone случаев. **Никогда не использовать `enqueue()` внутри `$transaction`** — это нарушение pattern'а.

## Anti-patterns (LLM никогда)

- ❌ **`enqueue()` внутри `$transaction`** — row пишется outside tx boundary, при rollback остаётся → ghost event.
- ❌ Skip step 2 (`emitEnqueued`) когда нужна low-latency обработка — event пропадёт до следующего processor cron.
- ❌ Emit event **до** commit транзакции — consumer может прочитать stale state.
- ❌ Использовать `emitEnqueued` без `shouldEmit` check — duplicate emits для deduped writes.
- ❌ Изменить `idempotencyKey` после первого write — break dedup.
- ❌ Multiple `enqueueInTx` calls для one logical event — break dedup.
- ❌ Outbox без processor (orphan rows накапливаются — leak memory / disk).

## Контрольные вопросы

1. `enqueueInTx(tx, ...)` использует переданный `tx`, а не root client?
2. `emitEnqueued` вызывается ПОСЛЕ exit из `$transaction` callback?
3. `shouldEmit` flag проверяется до `emitEnqueued`?
4. `idempotencyKey` детерминирован (одинаковый для retry)?
5. Tests покрывают: success path, rollback, retry, dedup?
6. Outbox processor существует и работает (не orphan rows)?

## Связанные skills

- `add-new-module` — если outbox module ещё не существует
- `route-new-logic` — определить где живёт outbox-related logic
- `docs-sync-after-change` — обновить `docs/reference/contracts.md` для event payloads

## Stack-specific API

Конкретный API outbox service (method signatures, return shapes, idempotency mechanics) — в `overlays/<stack>.md` § "Transaction-aware outbox" (e.g. TS+NestJS+Prisma overlay §11).
