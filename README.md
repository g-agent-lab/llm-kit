# LLM Discipline Kit

> Portable kit для развёртывания LLM-driven development discipline на любом новом или legacy проекте.

**Status:** v1.3 (2026-05-13). Production-validated на двух проектах (internal NestJS platform backend, loom CLI orchestrator).

**Repository:** https://github.com/g-agent-lab/llm-kit

---

## Audience

**LLM-first reading.** Этот kit — agent instructions, не human tutorial. Format optimised для LLM context: triggers / protocols / anti-patterns, минимум prose, максимум structured rules. Human developers могут читать (особенно `bootstrap/`), но primary reader — LLM, заходящая в проект cold.

**Operator profile (by design, не abstracted):**
- **Primary developer:** Claude Code (Anthropic)
- **Orchestrator:** ralphex (autonomous plan executor, 5-phase pipeline)
- **External reviewer:** Codex (OpenAI) через ralphex Phase 3

Это **осознанный выбор стека**, не временное допущение. Замена tools требует переписать §6 (CLAUDE.md), §7 (Ralphex pipeline), §15.1 (review pipeline) в UNIVERSAL_CORE. См. шапку `UNIVERSAL_CORE.md` для anti-cycling note.

---

## What this is

Kit решает одну проблему: **при vibe-coding LLM с другой LLM объём кода растёт быстрее, чем человек успевает осознавать**. Без жёсткой структуры LLM начинает «путаться»: читает не то, складывает логику не туда, дублирует существующее, ломает невидимые контракты.

Kit фиксирует **5 layers DAG + cognitive budget + maximalist enforcement + ralphex mandatory + security/observability/cost discipline** как **first-class invariants** проекта, с baseline mechanic делающим их применимыми и к greenfield (MVP), и к brownfield (50K+ LOC legacy).

**Why not just write good code:** human developer может удерживать invariants дисциплиной. LLM забывает между sessions. Kit делает invariants **machine-checkable** через 9 enforcement gates (ESLint + dep-cruiser + custom scripts + docs-lint + ralphex review pipeline).

---

## How to use

### LLM workflow при заходе в новый проект

1. **Read `UNIVERSAL_CORE.md`** — hot-path, читай ВСЕГДА первым (19 sections, ~890 строк)
2. **Read `overlays/<detected-stack>.md`** — конкретный стек reference. Сейчас доступны:
   - `typescript-nestjs.md` — backend (NestJS 11 + Prisma 7 + Express 5 + SWC + Jest)
   - `typescript-node-cli.md` — CLI / orchestrator (ESM Node 22 + Vitest + commander + execa)
3. **Decide bootstrap path:**
   - New project (zero discipline) → `bootstrap/greenfield.md` (13 шагов)
   - Existing legacy → `bootstrap/brownfield.md` (13 шагов, baseline freeze + cleanup-on-touch)
   - Discipline already deployed → skip оба, proceed с feature work

### Installing into a project

**Option 1 — git submodule (recommended):**
```bash
cd <your-project>
git submodule add https://github.com/g-agent-lab/llm-kit external/llm-kit
git commit -m "chore: add llm-kit submodule"
# Reference kit как external/llm-kit/ в CLAUDE.md
```

Periodically update:
```bash
git submodule update --remote external/llm-kit
git commit -am "chore: bump llm-kit to v1.X"
```

**Option 2 — copy:**
```bash
cd <your-project>
git clone --depth 1 https://github.com/g-agent-lab/llm-kit /tmp/llm-kit
cp -r /tmp/llm-kit/* docs/llm-kit/
rm -rf /tmp/llm-kit/.git
git add docs/llm-kit
git commit -m "chore: copy llm-kit v1.X"
```

Choose **submodule** если хочешь easy upgrades. **Copy** если хочешь fully self-contained repo без external dependencies.

---

## Repository structure

```
llm-kit/
├── README.md                          ← (этот файл) entry point
├── CHANGELOG.md                       ← version history
├── CONTRIBUTING.md                    ← how to add overlays / templates / patterns
├── UNIVERSAL_CORE.md                  ← hot-path, hardcore invariants (19 sections)
├── BACKLOG.md                         ← open items / verdicts / future overlays
├── core/
│   └── details/                       ← load-on-demand details
│       ├── memory.md                  ← §10 Memory layer detail
│       ├── skills.md                  ← §12 Claude Code Skills detail
│       ├── hooks.md                   ← §13 Hooks detail
│       ├── security.md                ← §14 Security baseline
│       ├── observability.md           ← §15 Observability baseline
│       ├── data-migration.md          ← §16 Migration discipline
│       ├── mcp.md                     ← §17 MCP servers
│       ├── codebase-map.md            ← §18 Codebase map
│       └── cost-discipline.md         ← §19 Cost discipline (LLM-runtime projects)
├── overlays/                          ← stack-specific (commands, configs, file patterns)
│   ├── typescript-nestjs.md           ← extracted из the NestJS host (production-validated)
│   └── typescript-node-cli.md         ← extracted из loom (production-validated)
├── bootstrap/
│   ├── greenfield.md                  ← 13-step playbook for new projects
│   ├── brownfield.md                  ← 13-step playbook for legacy
│   └── templates/
│       ├── AGENTS.md                  ← template (external agents contract)
│       ├── DOCS_RULES.md              ← template (docs structure rules)
│       ├── ralphex-plan-template.md   ← parser-strict template (iteration plans)
│       ├── hooks/                     ← 3 hook scripts (.sh)
│       ├── scripts/                   ← 6 universal Node.js gates (.cjs)
│       │   ├── boundary-check.cjs
│       │   ├── check-cross-module-relative-imports.cjs
│       │   ├── architecture-diff-guard.cjs
│       │   ├── arch-report.cjs
│       │   ├── dep-cruiser-baseline.cjs
│       │   ├── docs-lint.cjs
│       │   └── README.md              ← scripts contract + adapter schema
│       └── skills/                    ← 8 Claude Code Skills (load-on-demand)
└── tests/
    ├── run-smoke.sh                   ← entrypoint
    ├── identity-stability.test.cjs    ← unit tests для identity model + normalization
    ├── cross-module-detection.test.cjs ← integration tests
    └── README.md                      ← test harness contract
```

---

## Quick start commands

**Verify kit integrity** (run after upgrades):
```bash
bash tests/run-smoke.sh
# expected: 31 passed, 0 failed
```

**Apply kit gates in your project** (after bootstrap):
```bash
# baseline current state (one-time, brownfield)
node scripts/check-cross-module-relative-imports.cjs --update
node scripts/dep-cruiser-baseline.cjs --update
<eslint-json-cmd> | node scripts/boundary-check.cjs --update

# CI mode (every PR)
node scripts/check-cross-module-relative-imports.cjs --ci
node scripts/dep-cruiser-baseline.cjs
<eslint-json-cmd> | node scripts/boundary-check.cjs
node scripts/architecture-diff-guard.cjs --base origin/main
node scripts/docs-lint.cjs
```

---

## Core invariants (don't reopen)

Эти invariants — **by design**, проверены на двух production проектах + 7 раундах Codex review. Не пытайся reopen в новых сессиях/round'ах:

1. **Operator profile** — Claude + ralphex + Codex hardcoded. Не tool-agnostic. См. `UNIVERSAL_CORE.md` шапка.
2. **No escape hatch для cleanup-on-touch** — baseline единственная амнистия. Любой формальный escape hatch becomes default. См. §4.3.
3. **Canonical identity model v1.1.1** — `<file>:<rule>:<target>` (line-stable). Все 4 kit scripts используют один format. См. `bootstrap/templates/scripts/README.md`.
4. **`.cjs` extension для kit scripts** — explicit CommonJS, works в host projects с `"type": "module"` и без. Не переименовывать обратно в `.js`. См. v1.2.1 changelog.
5. **Maximalist enforcement day-1** — 9 gates обязательны независимо от размера проекта. Baseline mechanic делает painless для brownfield. См. §4.

---

## What's NOT here

- **Generic «good code practices»** — kit не учит писать хороший код. Он фиксирует **machine-checkable invariants**, оставляя style и approach to overlay/project decision.
- **Tool comparisons** — kit hardcoded на Claude + ralphex + Codex. Не сравнивает с GitHub Copilot, Cursor, Aider и т.д.
- **Language tutorials** — overlays — это reference, не learning material. TypeScript / Node knowledge предполагается.
- **Project ideas** — kit это infrastructure, не product roadmap.
- **CI/CD platform specific stuff** — minimal GitHub Actions skeleton в overlays. Не Jenkins / CircleCI / Buildkite специфика.

---

## Roadmap

См. `BACKLOG.md` для current state. Highlights:

**Done:**
- Universal core + 9 detail files
- 2 production-validated overlays (typescript-nestjs, typescript-node-cli)
- 6 universal scripts (canonical identity, .cjs ESM-compat)
- Bootstrap playbooks (greenfield + brownfield), brownfield validated end-to-end on loom
- 31 smoke tests
- 11 iterations (v1.0 → v1.3), 6 Codex review rounds, 3 real-world findings

**Pending (awaiting real projects on these stacks):**
- `python-fastapi` overlay
- `python-aiogram` overlay
- `go-stdlib` overlay
- `next-react` overlay
- `serverless-worker` overlay

**Validation gap:**
- Greenfield bootstrap end-to-end (на throwaway project)
- Step 13 — first ralphex iteration через kit pipeline на real plan

---

## License

MIT (или whatever you choose). Adjust before public release.

---

## Acknowledgements

Kit extracted from two production codebases:

- A company-internal NestJS platform — source of the `typescript-nestjs` overlay (NestJS + Prisma + HTTP backend).
- A personal Node CLI orchestrator — source of the `typescript-node-cli` overlay (ESM Node 22 + Vitest + commander + execa).

Kit lives as a separate repo for cross-project reuse. Updates flow from consumer projects → kit repo (PR-style) → other consumers (submodule update).
