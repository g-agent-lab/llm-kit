# Data Migration Discipline (Core §16 details)

> **Conditional:** применимо если у проекта есть БД с моделями / persistent state (миграции). CLI-tools без БД — skip.
> **Принцип:** миграция — это **код**, который должен пройти ralphex pipeline как любой другой код, плюс отдельная transactional discipline.

## Migration files как code

| Правило | Что значит для LLM |
|---|---|
| Migration файл — versioned in git | Никаких ручных DB изменений вне migration flow |
| Migration filename = sortable timestamp | `20260512100000_<short_desc>` или эквивалент ORM |
| Каждая migration атомарна и rollback-able | До commit'а проверь, что `rollback`/`down` корректно отменяет `up` |
| Большие миграции через несколько шагов | Add column NULL → backfill в фоне → set NOT NULL → drop старое (5+ deploys для критичных колонок) |

## Tx-aware outbox pattern (для event-driven systems)

> Применимо если используется outbox pattern для гарантии atomicity «commit row + emit event». Без outbox — этот раздел skip.

При записи в outbox внутри транзакции — **два-этапный pattern**, иначе outbox row пишется ВНЕ tx boundary (race condition, потеря на rollback).

```typescript
// Псевдокод (универсальный, конкретные API — overlay):
// Внутри $transaction(tx):
const { record, shouldEmit } = await outboxService.enqueueInTx(tx, data);

// ПОСЛЕ commit транзакции:
if (shouldEmit) {
  outboxService.emitEnqueued(data); // wake-up hint для processor
}
```

| Method | Когда |
|---|---|
| `enqueueInTx(tx, data)` | Внутри транзакции — пишет через `tx`, возвращает `shouldEmit` flag |
| `emitEnqueued(data)` | ПОСЛЕ commit — event bus hint для immediate processor wake-up |
| `enqueue(data)` (no tx) | Standalone, не в транзакции — root client + emit вместе |

**Anti-pattern:** `enqueue()` внутри `$transaction` — записывает outbox **снаружи** tx, при rollback outbox остаётся → ghost events.

## Backfill scripts

Большие миграции данных (>10K rows) — НЕ в migration файле, а в **отдельный backfill script**:

| Правило | Реализация |
|---|---|
| Script идемпотентен | Многократный запуск даёт одинаковый результат |
| Batched | Process N rows at a time, не SELECT * + UPDATE * |
| Progress checkpoint | Записывает прогресс в logs / state file для resume |
| `--dry-run` flag | Просчитать без edits, для validate перед apply |
| `--apply` flag | Только при явном flag производить changes |
| Lockable | Multiple instances не должны конкурировать (advisory lock или state file) |

## Schema change discipline для large tables

При изменениях схемы на больших таблицах (>1M rows):

1. **Lock-free add:** `ADD COLUMN` без `NOT NULL` без default (instant в Postgres/MySQL современных).
2. **Backfill async** в background script (см. backfill scripts выше).
3. **Verify completeness:** все rows имеют correct value.
4. **Set constraint:** `SET NOT NULL` после backfill (lock-light в современных DBs).
5. **Switch readers:** код читает новую колонку.
6. **Drop старое:** только после soak period с новой колонкой.

Каждый из 6 шагов — отдельная migration / deploy. Не сливать в одну «огромную» миграцию.

## Anti-patterns

- ❌ Manual DB changes (через `psql`, GUI) вне migration framework
- ❌ Backfill 5M rows внутри migration файла (lock на минуты)
- ❌ `enqueue()` outbox внутри `$transaction` (race condition при rollback)
- ❌ `ALTER COLUMN NOT NULL` на large table сразу (long lock)
- ❌ Migration без rollback (`down` empty / неправильный)
- ❌ Edit existing migration file после deploy (broken history)
- ❌ Skip backfill verification «обычно работает» (data corruption невидим до production)

## Связь с другими секциями

| Связь | Куда смотреть |
|---|---|
| Конкретный outbox API (TS+NestJS+Prisma) | `overlays/typescript-nestjs.md` §11 |
| Конкретные migration tools per stack | `overlays/<stack>.md` |
| Audit / approval для production migrations | core §14 (Security baseline) + project's ops procedures |
