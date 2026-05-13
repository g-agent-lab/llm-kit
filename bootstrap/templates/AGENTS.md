# AGENTS.md — Operational Contract for External Agents

> **Audience:** external agents (Codex via ralphex Phase 3, GitHub Copilot, other AI reviewers).
> **Location:** **project root** (not `docs/`). External agents read this file directly.
> **Source of truth:** this file is **canonical**; any `docs/AGENTS.md` copy is generated/reference-only.
> **Derived from:** root `CLAUDE.md` + `docs/llm-kit/UNIVERSAL_CORE.md` (operational subset).
>
> ⚠ **HARD REQUIREMENT:** все `<placeholder>` блоки ниже **должны быть заполнены реальными значениями ДО первого запуска ralphex**. Unresolved placeholders invalidate bootstrap — Codex Phase 3 не может выполнять review без concrete validation command.

---

## Architecture constraints (мини-summary)

**5 layers DAG (one direction):**

| Kind | May import from |
|---|---|
| shared | shared |
| infra | shared + infra |
| domain | shared + infra + domain |
| orchestration | shared + infra + domain |
| adapter | shared + infra + domain |

**3 forbidden directions (absolute):**
1. adapter → orchestration
2. orchestration → adapter
3. adapter → adapter

**Cognitive budget thresholds:**

| Metric | Threshold |
|---|---|
| Cognitive complexity (per function) | 15 |
| Cyclomatic complexity (per function) | 20 |
| File LOC | 600 |
| Function LOC | 80 |
| Nesting depth | 5 |
| Constructor/function params | 8 |

---

## Required validation command

Before any merge:

```
<REPLACE-WITH-STACK-CMD>     # e.g. for TS+NestJS: cd api && npm run lint:arch:diff
                              # for Python: poetry run python scripts/architecture-diff-guard.py
                              # adapt per overlays/<stack>.md § "Command map"
```

This is the **agent-driven gate**. Failing this command blocks merge.

**Setup verification:** перед commit'ом этого AGENTS.md, выполнить заполненную команду локально и убедиться что она run'ится без error. Если `<REPLACE-WITH-STACK-CMD>` остался — bootstrap не завершён, см. `docs/llm-kit/bootstrap/greenfield.md` Шаг 12 или `brownfield.md` Шаг 4.

---

## Default context boundary (what NOT to read)

- `business/` (strategy / positioning / sales — out of engineering scope)
- `docs/archive/` (historical documents)
- `docs/plans/active/completed/` (auto-managed by ralphex CLI; not authoritative)
- `node_modules/`, `dist/`, `build/`, `coverage/`, `.ralphex/worktrees/`

---

## Source files for full rules

- `docs/llm-kit/UNIVERSAL_CORE.md` — all architecture invariants
- `CLAUDE.md` — project-specific operational contract (≤100 lines)
- `docs/reference/module-routing.md` — where new logic belongs
- `docs/reference/architecture-exemptions.md` — documented bridge modules and exceptions

---

## Review focus (Phase 3 external review priorities)

1. **Architecture invariants** — 5-layer DAG + 3 forbidden directions not violated by changes
2. **Cognitive budget** — new functions stay under thresholds
3. **Module routing** — new logic placed in correct kind/module per `module-routing.md`
4. **Contract integrity** — public.ts barriers respected, contracts in `contracts/` not invented
5. **Tx-aware patterns** — outbox writes use `enqueueInTx` inside transactions (if outbox used)
6. **Security baseline** — no secrets in commits, no plaintext credentials in code
7. **Test discipline** — every code task includes tests; eval coverage if LLM in product runtime
8. **Documentation sync** — model count / endpoints / env vars / contracts current after changes

---

## What this file is NOT

- ❌ Not a full architecture spec — see `docs/llm-kit/UNIVERSAL_CORE.md`
- ❌ Not project documentation — see `docs/CONTEXT.md`
- ❌ Not the LLM agent contract — see root `CLAUDE.md`

This file is **only** an operational subset for external review agents who don't read the full doc-family.
