# Tests — LLM Discipline Kit smoke harness

Цель: защита kit'а от silent drift. Сейчас покрыты template scripts из `bootstrap/templates/scripts/`. Запускается локально или в CI любого репо, где kit развёрнут.

## Запуск

```bash
bash docs/llm-kit/tests/run-smoke.sh
```

Требует только `node` (≥18). Прогон ~1-2 секунды. Exit 0 = OK, 1 = failure.

## Что покрыто (v1.1.1)

**33 cases pass**: 26 unit + 7 integration.

| Файл | Что проверяет |
|---|---|
| [identity-stability.test.js](identity-stability.test.js) | Unit-уровень для всех 3 scripts (architecture-diff-guard, check-cross-module-relative-imports, boundary-check): canonical identity `<file>:<rule>:<target>` line-stable; legacy v1.0 (with line) и v1.1 brief (без rule segment) baselines нормализуются при чтении; line-shifted violation НЕ репортится как new (Codex round-5 + round-6 regressions). **26 cases**, включая 9 для boundary-check (новое в v1.1.1) и module-aware identification в diff-guard. |
| [cross-module-detection.test.js](cross-module-detection.test.js) | Integration: spawns real `check-cross-module-relative-imports.js` в temp fixture с двумя модулями, прогоняет полный workflow (default → --update → --ci → add violation → line-shift). **7 cases**, включая 3 regression cases (v1.0 line-shift, v1.0 legacy baseline normalization, v1.1 brief baseline normalization). |

## Что НЕ покрыто

- `architecture-diff-guard.js` end-to-end (full git fixture с двумя коммитами + ESLint setup) — dependency overhead не оправдан для smoke. Identity и normalization functions покрыты unit-уровнем (`identity-stability.test.js`).
- `arch-report.js`, `docs-lint.js` — TODO для следующей итерации.

## Когда добавлять test

| Триггер | Action |
|---|---|
| Меняешь identity scheme (формат строк baseline) | Добавь case в `identity-stability.test.js` ИЛИ обнови существующие cases на новый формат |
| Меняешь exit codes / output сriпта | Обнови integration test |
| Codex round находит regression в identity / baseline / detection | Сначала test, потом fix (TDD-стиле) |

## Когда НЕ добавлять test

- Документ-only изменения в core / overlays / bootstrap
- Стилистические правки в scripts без изменения behavior

## CI integration (optional)

Любой проект, который use'ит kit, может вставить smoke harness в CI:

```yaml
- name: LLM Discipline Kit smoke
  run: bash docs/llm-kit/tests/run-smoke.sh
```

Не блокирует чужие builds — это самопроверка kit'а, не gate для проекта.
