# Cost Discipline (Core §19 details)

> **Conditional:** mandatory если LLM используется в **product runtime** (агент отвечает пользователю, classification, AI-генерация). Для dev-only LLM (Claude Code / Codex review) — skip.

## Зачем

LLM API — переменная стоимость без потолка. Без discipline:
- Один runaway loop за ночь burn'ит monthly budget
- Malicious prompt injection через user input → unbounded generation
- New prompt template 10x cost'а проходит незаметно
- Один tenant drain'ит budget остальных (multi-tenant)

Discipline = **multiple layers protection** (per-call cap + per-feature budget + per-tenant limit + cost tracking + alerts + regression CI gate).

## Компоненты (все mandatory)

### 1. Per-request token cap (hard limit)

Каждый LLM call имеет explicit token budget (input + output). Если model API поддерживает `max_tokens` — set it. Если нет — pre-flight validation на input length, post-call validation на output length.

```typescript
// Pseudo:
const MAX_INPUT_TOKENS = 8000;
const MAX_OUTPUT_TOKENS = 2000;

if (estimateTokens(prompt) > MAX_INPUT_TOKENS) {
  throw new InputTooLargeError();  // или truncate с user notification
}

const response = await llm.complete(prompt, { max_tokens: MAX_OUTPUT_TOKENS });
```

**Per-feature override:** некоторые features нужно более длинных ответов (e.g. code generation). Cap per feature in config, не universal constant.

### 2. Per-feature daily budget

Cumulative cost per feature per day с **mandatory durability requirements**:

| Requirement | Что значит |
|---|---|
| **Survives process restart** | Counter persists across container/pod restarts. In-memory storage без backing — НЕ valid. |
| **Atomic across workers** | Multiple worker processes incrementing concurrently must not lose updates (CAS / atomic increment). |
| **Daily reset deterministic** | Day boundary clear (UTC by default; document timezone if different). |

**Valid storage choices:**

| Storage | Valid if |
|---|---|
| Redis | **Persistence configured** (`appendonly yes` или RDB snapshots). Без persistence — НЕ valid (restart wipes state, budget bypassed). |
| Postgres / MySQL | Default ACID. Use `UPDATE ... RETURNING` или transaction with row lock. |
| Cloud KV (DynamoDB / Firestore / Cloudflare KV) | Built-in durable; atomic increment via service-specific API. |

**Anti-pattern:** in-memory Map в Node.js process / Python global — restart bypasses budget. Detected as critical regression.

```typescript
// Postgres example (durable, atomic):
async function checkAndIncrement(feature: string, costUsd: number): Promise<boolean> {
  return await prisma.$transaction(async (tx) => {
    const today = new Date().toISOString().slice(0, 10);
    const row = await tx.costCounter.upsert({
      where: { feature_date: { feature, date: today } },
      update: { totalUsd: { increment: costUsd } },
      create: { feature, date: today, totalUsd: costUsd },
    });
    if (row.totalUsd > DAILY_BUDGET[feature]) {
      // Rolled forward; budget hit. Return false to trigger fallback.
      return false;
    }
    return true;
  });
}
```

### 3. Per-tenant rate limit (multi-tenant only)

Если проект serve'ит multiple tenants — independent limit per tenant.

**Critical security requirements** (fail-closed, not user-supplied):

| Rule | Reason |
|---|---|
| `tenant_id` derives from **trusted server-side auth context**, never from request body / headers blindly | Spoofed `X-Tenant-ID` header → tenant пишет в чужой budget bucket / drains victim's budget |
| Missing `tenant_id` в multi-tenant runtime → **fail-closed** (reject LLM call с error logged) | "Anonymous"/null tenant key → bypass budget entirely |
| Storage key: `cost:${tenant_id}:${feature}:${date}` (NOT just feature/date) | Tenant isolation at storage layer |
| `tenant_id` validation: matches active tenant set; unknown tenant → reject | Prevents tenant_id enumeration / new-tenant abuse |

**Implementation pattern:**

```typescript
function getTenantIdOrFail(req: AuthenticatedRequest): string {
  // tenant_id comes from server-side resolved auth (JWT claims, session lookup),
  // NEVER directly from request input.
  const tenantId = req.authContext?.tenantId;
  if (!tenantId) {
    logger.error('llm.cost.missing_tenant_id', { userId: req.authContext?.userId });
    throw new BudgetSecurityError('Missing tenant context — LLM call rejected');
  }
  if (!activeTenants.has(tenantId)) {
    logger.error('llm.cost.unknown_tenant_id', { tenantId });
    throw new BudgetSecurityError('Unknown tenant — LLM call rejected');
  }
  return tenantId;
}
```

Storage аналогична #2 (same durability requirements), key extended with `tenant_id`.

### 4. Cost tracking storage

Persist каждый LLM call. Минимум полей:

| Field | Тип |
|---|---|
| `id` | UUID |
| `timestamp` | datetime UTC |
| `tenant_id` | string (nullable если single-tenant) |
| `feature` | enum (e.g. `agent_reply`, `classification`, `summary`) |
| `model_id` | string (e.g. `claude-opus-4-7`) |
| `provider` | enum (`anthropic`, `openai`, `openrouter`, etc.) |
| `input_tokens` | int |
| `output_tokens` | int |
| `cost_usd` | decimal (precision 6) |
| `request_id` / `correlation_id` | string (link to trace) |
| `outcome` | enum (`success`, `cap_hit`, `budget_hit`, `error`) |

### 5. Alert thresholds

| Threshold | Action |
|---|---|
| 50% daily budget | Notify via low-priority channel (Slack #ops, email digest) |
| 80% daily budget | Notify via high-priority channel (paging if 24/7) + recommend fallback enabled |
| 100% daily budget | Auto-trigger fallback mode для affected feature + page on-call |
| 50% monthly budget at <15-th day | Investigate — likely abnormal usage |
| Unusual cost spike (10x avg) | Immediate alert, freeze feature pending review |

### 6. Regression cost report (CI gate)

CI runs eval suite (см. core §9.3) AND tracks cost per request. New prompt / new model / new flow.

**Configuration:**
- **Threshold:** project-configured in `.cost-regression.json` (or equivalent). Default if absent: 25%.
- **Approval:** breaking the threshold requires **explicit cost-approval entry в plan/PR metadata**, NOT a commit-message tag.

**Why not commit-message tags:** `[cost-ok]` tag в commit'е тривиально добавляется LLM при retry/iteration — это rubber-stamp. Approval must be a separate, intentional human (or authoritative agent) artifact tied to the plan or PR.

**Approval mechanic (choose one):**

| Approach | Implementation |
|---|---|
| **Plan metadata** | Active plan (`docs/plans/active/<plan>.md`) contains `Cost approval: <threshold>% — <reason> — <approver>` block. CI script parses this when guarding the branch's diff. |
| **PR labels** | GitHub PR carries `cost-approved-30pct` label set by authorized reviewer. CI reads via `gh api`. |
| **External approval ticket** | URL to JIRA/Linear ticket referenced in PR description. CI fetches and verifies status. |

```bash
# Compare cost per request: current branch vs base ref
npm run eval -- --report-cost > eval-current.json
git stash
git checkout "$BASE_REF"
npm run eval -- --report-cost > eval-base.json
git checkout -
git stash pop
node scripts/cost-regression.js eval-current.json eval-base.json
# Script reads:
#   - .cost-regression.json for threshold (default 25%)
#   - Plan metadata / PR labels / external ticket for approval (per project choice)
# Fails CI if delta > threshold AND no valid approval.
```

`.cost-regression.json` example:

```json
{
  "thresholdPct": 25,
  "approvalSource": "plan-metadata",
  "planMetadataField": "Cost approval"
}
```

## Fallback strategies (при budget hit)

| Strategy | Когда |
|---|---|
| **Template reply** | Простые ответы где template работает (e.g. "currently I can't help, please contact support") |
| **Skip + queue** | Async work where deferred is OK (notify user "we'll respond when capacity opens") |
| **Route to cheaper model** | Если есть acceptable Haiku/Mini-class fallback. Quality degrades но feature остаётся functional |
| **Hard cutoff** | Last resort — feature disabled с user-facing notice. Never silent fail |

Never:
- ❌ Silent fail (user видит generic error)
- ❌ Raise exception в product flow (breaks UI)
- ❌ Continue with no limit (defeats discipline)

## Anti-patterns

- ❌ LLM call без `max_tokens` — runaway iteration жрёт unbounded
- ❌ No daily budget tracking — incident burn'ит month's budget overnight
- ❌ Cost tracking только в provider dashboard — lag, нет alerts, нет per-feature
- ❌ Hard exception при budget exceeded — feature ломается с error пользователю
- ❌ Skip CI cost regression — new prompt 10x cost проходит
- ❌ Per-tenant budget без tenant isolation — один drain'ит все

## Связь с другими секциями

| Связь | Куда |
|---|---|
| Eval coverage (regression detection) | core §9.3 |
| Observability (LLM call tracing) | core §15.4 / [`observability.md`](observability.md) |
| MCP error tracker (alert delivery) | core §17 / [`mcp.md`](mcp.md) |

## Tools per stack

Конкретные libraries и configurations — `overlays/<stack>.md` § "LLM cost discipline".

Recommended:
- **LangFuse** (open-source, self-host) — tracking + budgets + dashboards
- **Helicone** (SaaS) — drop-in proxy, automatic tracking
- **OpenLLMetry** (open-source, OTel-based) — для multi-vendor LLM observability
- **Custom** — store в Postgres / Redis, custom dashboard на Grafana
