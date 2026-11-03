# 2026-11-04 — Deploy to-tickets

`@to-tickets` для карты «Production deployment for booking-api v1» — естественная continuation cart #42 «Dockerize booking-api v1 backend».

## Контекст

Cart #42 чартована в прошлой сессии (manifest `docker-chart-and-tickets.md`) и с тех пор имеет 8 активных child tickets — 4 для Dockerfile/image (#43, #45, #46) и 4 для gitleaks adoption (#47–#50). В Out-of-scope раздел карты #42 явно перечислено: «Production deployment manifests (`fly.toml`, `docker-compose.yml`, helm chart). Multi-platform builds. Image signing. Remote secrets vault.»

Эта сессия делает восходящий cart — deployment — потому что после image в production всё равно стоять, и ADR-0004 / platform config / secrets / DNS / smoke — это связанный коммит решений, не individual internal-implementation-tickets. Несколько чат-разговор с пользователем не было — пользователь дал только `@to-tickets` без аргумента, и мне пришлось выбрать «что разделять на tickets» из контекста. Cart #42's Out-of-scope был самым явным следующим шагом.

## Что сделано

Map issue **#52** «Production deployment for booking-api v1 (post-image)» с `wayfinder:map` label, body в формате wayfinder skill.

5 child tickets под #52:

- **#53** `wayfinder:research` — «Pick hosting platform + ADR-0004». **Frontier, no blockers.** Research уже начат (как паттерн: subagent push'ит throwaway `research/deploy-platform` branch, пишет ADR, comments на #53).
- **#54** `ready-for-agent` — «Production-deploy config (platform config file)». Depends #53.
- **#55** `ready-for-agent` — «Production secrets management documentation». Depends #53.
- **#56** `ready-for-agent` — «Public DNS + TLS». Depends #54 + #55.
- **#57** `ready-for-agent` — «Post-deploy smoke check script». Depends #54 + #55 + #56.

Граф:

```
            ┌─→ #54 ─┐
#53 ──→ ───→├─→ #55 ─┼─→ #56 ─→ #57
            └───────┘
```

Поскольку #53 — research single-shard, и #54 и #55 зависят только от него, они могут идти параллельно после research-резолюции #53. #56 ожидает оба. #57 — верхушка после #56.

Per to-tickets «Each slice cuts a narrow but COMPLETE path through every layer». Я проверил: каждый ticket —

- #53: research complete когда ADR-0004 написан. Демо: `cat docs/adr/0004-*.md`.
- #54: config complete когда файл `fly.toml` (или эквивалент) accepted portal. Демо: `platform deploy`.
- #55: docs complete. Демо: README раздел `Secrets` shipped.
- #56: DNS+TLS complete когда end-to-end curl on production URL возвращает 200. Демо: `curl https://booking.example.com/health`.
- #57: smoke-script runs against production as `scripts/production-smoke.sh $URL` с exit code 0 (=pass). Демо: запуск скрипта.

Каждый — в один свежий context window.

## Non-obvious drift

### Out-of-scope explicitly перечислены в map body

Cart #42 уже listing «production deployment manifests» в "Out of scope". Положив на новую карту #52, я сохранил эту границу. ADR-style: scope boundary — это не route-step, и поэтому #42 не имеет regression.

Scale-to-zero, multi-region, monitoring, observability, auto-deploy on push — тоже out-of-scope этой карты. v2-tickets если нужно будет.

### Convention apply `ready-for-agent` vs `wayfinder:task`

#53 — `wayfinder:research` (research ticket type per skill), но #54–#57 — `ready-for-agent` per to-tickets step 5 («Apply the ready-for-agent triage label unless instructed otherwise»). Это потому, что они будут решаться implement-spec subagent, а не wayfinder research subagent. Различие в типе тикета — это тип работы, не тип агента.

### Maps are mutable indexes, leaves are tickets

Я не разделил #42 (Dockerize) и #52 (Deploy) в одну карту, потому что они имеют разные destinations. Правильнее иметь sub-map для разных выходов, чем одну карту с большим телом где trace в блёр.

## Trace

- 6 issues созданных (map + 5 leaves). All `Part of #52` links в body.
- Frontier: #53 (research, AFK).
- Graph inversed: maps of cart #42's Out-of-scope продолжаются в этой карте.

## Open follow-ups

После landing фронтира cart #52 (т.е. deploy running production), возможны следующие carts:

- **Observability** — Datadog / Sentry / UptimeRobot integration.
- **Multi-region / failover** — ADR-0001 deferral.
- **Auto-deploy on push to main** — GH Action → `fly deploy`, отдельный ticket в новой карте.
- **UI deploy card** — отдельный workflow для `web/dist` standalone deploy frontend.

Следующий iteration: пользователь может выбрать одну из этих карт, или продолжить с cart #42 (#47 #50 — gitleaks adoption) или запустить `@implement-spec / 53` для research платформы.
