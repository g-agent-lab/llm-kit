# MCP Servers (Core §17 details)

> **Принцип:** доступ к внешним системам (DB, error tracker, version control, messaging) — через **MCP (Model Context Protocol)**, не через raw bash. MCP даёт type-safe, auditable, безопасный доступ.

## Что такое MCP в одной фразе

MCP — открытый протокол (Anthropic, 2024), стандартизирующий доступ LLM к external systems. Каждый MCP server expose'ит набор tools/resources/prompts через JSON-RPC. Claude Code / Codex / Cursor — все клиенты MCP.

## Mandatory MCPs (по surface проекта)

MCP обязательность определяется **что есть в проекте**, не «универсально для всех». Логика:

| MCP | Mandatory если | Альтернатива (если MCP недоступен) |
|---|---|---|
| **GitHub / GitLab MCP** | Есть git remote + используется GitHub/GitLab для PRs/issues | `gh` / `glab` CLI через bash (более громоздко) |
| **DB MCP** (Postgres / MySQL / SQLite) | Есть persistent БД в стеке | DB CLI через bash в read-only режиме |
| **Error tracker MCP** (Sentry / Rollbar / Datadog) | Есть production deployment + observability (core §15) | API через `curl` (lossy, нет structured access) |
| **Filesystem MCP** | LLM нужен access к файлам вне repo (rare) | Native Read tool внутри repo |

**CLI-tools без git remote / БД / production** — MCP не обязательны, но preferred если доступны.

## Conditional MCP servers

| MCP | Когда устанавливать |
|---|---|
| **Slack / Discord MCP** | Если есть team chat для async коллаборации |
| **Calendar MCP** | Если нужно scheduling / agenda для проекта |
| **Linear / Jira MCP** | Если есть project tracker для product management |
| **Cloudflare MCP** | Если есть Cloudflare infrastructure (Workers / R2 / D1) |
| **Stripe MCP** | Если есть Stripe integration |
| **Anthropic-skills MCP** | Если используются shared skills (docx / pdf / xlsx) |

Список MCP servers и установка — `~/.claude/settings.json` или эквивалент клиента.

## Правила использования MCP (LLM)

| Правило | Что значит |
|---|---|
| **MCP > raw bash** для external systems | Если для нужного API есть MCP — использовать его |
| **Read-only first** | Default использовать read MCP tools; write tools только с явным user authorization |
| **Не invent'ить tool names** | Если MCP tool не возвращается из tool list — попросить user установить MCP, не пытаться через bash |
| **Permissions explicit** | Destructive MCP actions (delete issue, force push, drop table) — явное user approval каждый раз |

## Anti-patterns

- ❌ `curl https://api.github.com/...` когда GitHub MCP доступен
- ❌ `psql -c "DROP TABLE..."` без user authorization
- ❌ Использовать MCP write tool «потому что доступен» — нужен explicit user intent
- ❌ Confidentially share MCP secrets / tokens в commits / docs / chat
