# Observability Baseline (Core §15 details)

> **Conditional на наличие production deployment.** Если у проекта есть deployed environment (production / staging / live runtime), observability обязательна с day-1.
>
> CLI tools / one-shot scripts без runtime — observability не требуется.

## Three pillars (универсальный минимум)

| Pillar | Что |
|---|---|
| **Logs** | Structured JSON logging с redaction (не plaintext, не raw strings) |
| **Errors** | Error tracking — uncaught exceptions, unhandled rejections captured |
| **Metrics** | Service health signals: uptime, basic resource usage |

## Mandatory baseline (production проект)

| Component | Tool category | LLM requirement |
|---|---|---|
| Structured logger | JSON logger с PII redaction | Никаких `console.log` / `print` в production code — только через logger |
| Error tracker | Sentry / Rollbar / Datadog APM / эквивалент | Capture uncaught exceptions globally, привязать к user/session/request id когда есть |
| Health check endpoint | `/health` или `/healthz` | Возвращает 200 если service ready, 503 если deps degraded |
| Log redaction | Auto-mask credentials, tokens, PII fields | По name patterns (`password`, `token`, `email`, `phone`, etc.) — НЕ commit raw в logs |

Конкретные tools — `overlays/<stack>.md` § "Observability tooling".

## Conditional: API surface (REST/gRPC/WebSocket)

Если есть API endpoints — дополнительно:

| Component | Что capture'ить |
|---|---|
| Request/response logging | Sampled (1-10%), with request ID для correlation |
| Latency metrics | p50 / p95 / p99 per endpoint |
| Error rate | Per endpoint, per status code |
| 4 Golden Signals (Google SRE) | Latency / Traffic / Errors / Saturation |

## Conditional: LLM в product runtime

Если LLM используется в продуктовом runtime (агент отвечает пользователю, classification на live data, etc.):

| Component | Tool category |
|---|---|
| LLM call tracing | LangFuse / Helicone / OpenLLMetry / Sentry AI |
| Token usage metrics | Per model, per feature, per user/session |
| Cost tracking | Aggregated cost per day / per feature |
| Eval coverage (core §9.3) | Regression tests на quality |

## Conditional: Background jobs / async work

Если есть scheduled jobs / queue workers / cron:

| Component | Что |
|---|---|
| Job execution logging | Start / end / duration / outcome |
| Queue depth metrics | Backlog size, processing rate |
| Failure tracking | DLQ size, retry counts |

## Anti-patterns

- ❌ **`console.log` / `print` в production code** (не structured, не redacted, не collected)
- ❌ **Logs с PII / secrets** (нет redaction — попадают в storage, доступны support / leaked)
- ❌ **Swallow errors silently** (`try { } catch (e) {}` без logging / re-throw — баги невидимы)
- ❌ **No health check endpoint** (Kubernetes / load balancer не знает state)
- ❌ **Один global logger без context** (request ID / user ID / session ID нужны для debug production incidents)
- ❌ **Logging в файл локально вместо external service** (потеря logs при container restart / scale-down)
- ❌ **Skip eval coverage для AI features** (regression невидима без eval pipeline)

## Связь с другими секциями

| Связь | Куда смотреть |
|---|---|
| Eval coverage для AI | core §9.3 (Tests as architecture) |
| Secret redaction в logs | core §14 (Security baseline) → [`security.md`](security.md) |
| Required validation per-task | core §7 (Ralphex) + overlay command map |
