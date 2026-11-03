# 2026-11-04 — Docker chart + gitleaks to-tickets

В этой сессии последовательно две формулировки одного и того же scope:

1. **`@wayfinder <requirements>`** — charted карта #42 «Dockerize booking-api v1 backend with PORT-driven listen and no secrets» + 4 child tickets (#43 Dockerfile, #44 audit+tooling, #45 docs, #46 CI image-build+smoke).
2. **`@to-tickets`** — после того, как research subagent вернул notes для #44, разбил gitleaks-adoption из §6 research-notes на 4 child tickets (#47 .gitleaks.toml, #48 hk.pkl, #49 ci.yml, #50 smoke-test) под `#44`.

Оба вызова — в одной OpenCode-сессии. Один manifest для обоих.

## Контекст и особенности

Пользователь задал 5 конкретных requirements (Dockerfile at root, автостарт, PORT env, no secrets). Я начал делать без wayfinder-плана (написал Dockerfile + .dockerignore в WIP worktree) — нарушение skill-инварианта «Plan, don't do». При `@wayfinder` остановился, удалил WIP, чартовал карту. Часть wayfinder-a — research subagent для #44.

После research-findings (clean audit, recommended `gitleaks`) пользователь применил `@to-tickets`. Я перевёл §6 implementation plan в 4 child tickets. Это второй шаг той же сессии.

## Что сделано

### Шаг 1 (`@wayfinder`)

Map issue #42 с `wayfinder:map` label, body в формате skill:

- `## Destination` — 1-paragraph punchline of v1 Dockerization.
- `## Notes` — domain (backend src/), conventions (AGENTS.md rules), соседи (cart #1/#26/spec #10).
- `## Decisions so far` — пусто при chart-time.
- `## Not yet specified` — fog (image architecture, HOST binding, EXPOSE, CI smoke, audit tool).
- `## Out of scope` — production deployment, multi-platform, image signing, secrets vault.

4 child issues:

- **#43** wayfinder:task — «Dockerfile + .dockerignore at repo root».
- **#44** wayfinder:research — «Audit repo history for secrets + pick scanning tool».
- **#45** wayfinder:task — «Document Docker usage in README / AGENTS».
- **#46** wayfinder:task — «CI image-build job + smoke test».

Research subagent (background) для **#44**:

- Worktree: `.worktrees/secret-audit`, branch `research/secret-audit`, push без PR.
- Subagent wrote `docs/agents/security/secret-audit-2026-11-04.md` (240 lines).
- Manual scan + gitleaks 8.18.4 на `git log -p --all` (37 reachable commits). Result: **CLEAN**, 0 hits на AWS / GCP / OpenAI / GitHub / Slack / JWT / PEM / `password=`.
- Recommended `gitleaks` (vs trufflehog / ggshield / detect-secrets).
- Placement: **BOTH** (pre-commit + CI).
- Posted research-finding comment на #44 (informational, не closing).

### Шаг 2 — после `@to-tickets`

Прочёл research notes (`docs/agents/security/secret-audit-2026-11-04.md`) на ветке `research/secret-audit`. §6 даёт готовую implementation plan. Превратил в 4 child tickets под #44 с правильными blockers:

- **#47** ready-for-agent — «Add .gitleaks.toml at repo root» (depends on #44 research = no blocker, frontier).
- **#48** ready-for-agent — «Wire gitleaks into hk.pkl pre-commit» (depends #47).
- **#49** ready-for-agent — «Wire gitleaks into .github/workflows/ci.yml» (depends #47, parallel to #48).
- **#50** ready-for-agent — «Smoke test gitleaks end-to-end» (depends #48 + #49).

Граф:

```
#47 ─┬─→ #48 ─→ #50
     └─→ #49 ─→ #50
```

Updated map #42 body — добавлен «Decisions so far» (clean audit, gitleaks, BOTH placement) и расширен «Граф тикетов (frontier)».

## Non-obvious drift

### «Plan, don't do» был нарушен в первом ответе

До `@wayfinder` я уже начал делать (написал Dockerfile + .dockerignore, пробежал `make check`). Это нарушение skill-а. Исправил через clean-up WIP worktree и switch на planning-then-doing.

### Maps are mutable indexes, leaves are tickets

`gh issue edit 42` для обновления body карты по skill: «The map is an index, not a store». После добавления #47–#50 я обновил body карты с cumulative state (decisions so far + frontier tickets). Это правильно — карта эволюционирует.

### Blockers не реализованы через native issue dependencies

Per AGENTS.md / env constraint: в этой среде `gh 2.4` без `--add-sub-issue`/`--add-blocked-by` (GitHub-edges feature). Использован body-секция «Blocked by» convention. Frontier-вычисление в этой репо — manual на основании dependency-graph в body каждого тикета.

### A 30-секундная grep-задача получила полноценный research subagent

Manual secret-scan можно было сделать инлайн. Но skill говорит «Fire the research subagents» для research-тикетов, и я следовал. Output — throwaway branch + notes file + comment. Это slightly overkill для текущего scope, но устанавливает convention: future research leaves durable audit trail.

## Trace

- Map #42 OPEN (`wayfinder:map`).
- 4 chart-time children #43, #44, #45, #46 — все OPEN (`wayfinder:task` / `wayfinder:research`).
- 4 to-tickets children #47, #48, #49, #50 — все OPEN (`ready-for-agent`).
- Map body updated после #47–#50 creation (Decisions so far populated; frontier list refreshed).
- Research subagent: branch `research/secret-audit` @ `0b7ee50`, push to `origin`, no PR.

## Open follow-ups

Нет — обе последовательности закончены.

Frontier сейчас (next implement-spec-able):

- **#43** Dockerfile + .dockerignore at repo root — no blocker.
- **#47** Add .gitleaks.toml at repo root — no blocker.

После #43 lands: #45 и #46. После #47 lands: #48 и #49 (parallel), затем #50.

Если пользователь сейчас идёт в `@implement-spec / <issue-number>` для любого из #43/#47, implement-spec автоматически подключает research notes (для #47) через `git show origin/research/secret-audit:docs/agents/security/secret-audit-2026-11-04.md`.

Следующая интересная итерация — выбор между cart-brand: continue с Docker implementation (по cart #42), или другие wayfinder-open карты (deploy, observability, multi-owner).
