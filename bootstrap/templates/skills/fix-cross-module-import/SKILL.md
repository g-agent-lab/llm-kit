---
name: fix-cross-module-import
description: Use whenever you edit a file with cross-module relative imports (`../other-module/*`) detected in `.cross-module-import-baseline.json` (brownfield discipline) or as part of cleanup-on-touch policy. Triggers automatically via the `post-edit-lint` hook for any baselined file. Loads the conversion pattern (relative → public.ts barrel or alias) and the baseline update workflow.
---

# Fix Cross-Module Import (Cleanup-on-Touch)

> Запускается когда LLM редактирует файл с baselined cross-module relative imports (`../other-module/*`).
> Цель — конвертировать в `@/{module}/public` (или эквивалент стека) + обновить baseline.
> Канон: `UNIVERSAL_CORE.md` §1.1, §4.3 (baseline mechanic), §6.2 (cleanup-on-touch).

## Когда триггерится

| Trigger | Источник |
|---|---|
| Edit/Write/MultiEdit на файле в `.cross-module-import-baseline.json` | Auto через `post-edit-lint` hook |
| Manual user request: «fix cross-module imports in X» | Direct |
| User упомянул baseline / cleanup-on-touch | Direct |

## Шаг 1. Найти violations

В отредактированном файле найди все импорты вида:

```
from '../<other-module>/...'
from '../../<other-module>/...'
import * from '../<other-module>'
```

**Что НЕ violation:**
- Intra-module relative imports: `from './internal/X'`, `from '../dto/Y'` (внутри того же module)
- Library imports: `from 'react'`, `from '@nestjs/common'`
- Path alias: `from '@/<module>/public'` (это уже правильно)

## Шаг 2. Решить replacement

Для каждого violation:

| Случай | Replacement |
|---|---|
| Target module имеет `public.ts` | `from '@/<target-module>/public'` |
| Target module без `public.ts` | `from '@/<target-module>/<specific-file>'` (path alias на конкретный файл) |
| Cross-module type-only import | `import type { X } from '@/<target-module>/public'` |
| Target module — aggregate-only | ❌ Не импортируй из aggregate — найди конкретный child module |
| Target module — legacy/frozen | ❌ Stop, найди canonical replacement (см. skill `route-new-logic`) |

### Stack-specific note

Конкретный path alias может отличаться:
- TS/Node: `@/<module>/public` (per `tsconfig.json paths`)
- Python: `from <project>.<module>.public import X` (absolute import)
- Go: `<module-path>/public` (canonical package path)

Точная форма — в `overlays/<stack>.md` § "Path alias".

## Шаг 3. Применить replacement

```typescript
// До:
import { FooService } from '../foo/internal/foo.service';
import type { FooDto } from '../foo/dto/foo.dto';

// После (если foo имеет public.ts):
import { FooService } from '@/foo/public';
import type { FooDto } from '@/foo/public';
```

## Шаг 4. Update baseline

После fix'а — запустить stack-specific update command:

```bash
# Stack-specific, см. overlays/<stack>.md § "Command map":
<command>:imports:update-baseline
```

Это перегенерирует `.cross-module-import-baseline.json` без исправленных нарушений.

## Шаг 5. Commit fix + baseline вместе

```bash
git add <fixed-file> .cross-module-import-baseline.json
git commit -m "refactor(<module>): cleanup-on-touch cross-module imports"
```

Один commit = fix + updated baseline. **Не split на два commit'а** — baseline должен соответствовать code.

## Шаг 6. Verify

```bash
# Stack-specific commands:
<format-check>
<linter>
<imports-ci-check>  # должно pass: baseline updated
<tests>             # zero regression
```

## Антипаттерны

- ❌ **Обновить baseline без fix'а** — добавляем долг без работы (cheating). Baseline должен МОНОТОННО уменьшаться.
- ❌ **Split fix + baseline на два commit'а** — review увидит inconsistency.
- ❌ **Convert через aggregate** (`from '@/AiModule/public'` когда нужно `from '@/brain/public'`). Aggregates НЕ для импортов.
- ❌ **Игнорировать `post-edit-lint` warning** «file has baselined violations» — fix должен быть в том же edit-цикле.
- ❌ **Convert в `@/<other-module>/internal/*`** — это снова violation (нарушение `public.ts` barrier).
- ❌ **Auto-fix скриптом без review каждого случая** — replacement зависит от target module status (`public.ts` или нет, aggregate-only или нет, frozen или нет).

## Контрольные вопросы

1. Все `../other-module/*` в файле конвертированы?
2. Target module reach'нут через `public.ts` если он есть?
3. Baseline file обновлён через canonical script (не ручкой)?
4. Fix + baseline в одном commit?
5. Tests green?

## Связанные skills

- `route-new-logic` — если target module frozen/legacy, нужен canonical replacement
- `add-new-module` — если target module нужно создать `public.ts` (отсутствует)
- `docs-sync-after-change` — если изменился public contract
