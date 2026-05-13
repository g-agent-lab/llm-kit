# Security Baseline (Core §14 details)

> **Mandatory с day-1** — все 9 enforcement gates обязательны с первого commit'а, security не исключение. Secret leak один раз = не «исправляется потом» (credentials уже compromised).

## Что ловится

| Категория | Что |
|---|---|
| **Secret leaks** | Committed credentials, API keys, tokens, private keys |
| **Vulnerable dependencies** | Known CVEs в installed packages |
| **Static analysis (SAST)** | Source code vulnerabilities (SQL injection, XSS, path traversal, etc.) |
| **License compliance** | Forbidden licenses (если есть commercial constraints) |
| **ENV management** | `.env` committed, plaintext secrets в коде |

## Обязательные gates (в CI, blocking)

| Gate | Когда runs |
|---|---|
| **Secret scan (pre-commit)** | Local pre-commit hook + CI на push |
| **Secret scan (CI)** | Every push, scan all changed files против known patterns |
| **Dependency CVE check** | Every push (lightweight, кешируется) |
| **SAST** | Every push, scoped на changed files |
| **License check** | Every push (если есть policy) |

Конкретные tools — `overlays/<stack>.md` § "Security tooling". Universal минимум:
- Secret scan: `gitleaks` / `trufflehog` / GitHub Advanced Security
- CVE: `npm audit` / `pip-audit` / `cargo audit` / `govulncheck`
- SAST: stack-specific (semgrep universal, или native — bandit / gosec)

## ENV management (universal rules)

| Правило | Реализация |
|---|---|
| `.env` файлы НЕ commit'ятся | В `.gitignore` всегда |
| `.env.example` commit'ится с placeholder values | Документирует требуемые ENV vars |
| Prod credentials в managed secret store | Vault / AWS Secrets Manager / GCP Secret Manager / Doppler / 1Password |
| Все `process.env.X` reads документированы | `docs/reference/env-variables.md` (см. core §5.2 docs lint) |
| Secrets никогда в `docs/` / `SESSION.md` / `CLAUDE.md` / commits | LLM при write проверяет — не вставляет plaintext credentials |

## Anti-patterns (LLM не делает никогда)

- ❌ Commit `.env` файл с реальными credentials
- ❌ Plaintext API keys / tokens / passwords в исходном коде
- ❌ Disable secret scan «временно» / «для CI скорости»
- ❌ Skip CVE check «обновим dependencies в следующем спринте»
- ❌ Записать credentials в `SESSION.md` / `CLAUDE.md` / `MEMORY.md` («чтобы помнить»)
- ❌ Использовать `console.log(env.SECRET)` для дебага (попадает в logs)
- ❌ В CI artifact / cache class сохранять secret-containing файлы

## Если secret leak обнаружен

LLM **немедленно**:
1. **Не commit'ит** дальнейшие изменения.
2. **Сообщает user** что произошёл leak.
3. **НЕ удаляет secret** просто из истории (git history — не source of truth для leak; secret уже compromised если был push'нут).
4. **Просит user** rotate credentials (новый API key, новый token, новый password) в provider'е.
5. **Только после rotation** removes leak from code и commits clean version.
