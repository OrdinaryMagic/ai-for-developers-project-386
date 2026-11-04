# 0004 — Размещение Booking API v1 на managed-платформе (Fly.io)

Backend из cart #1 (Booking API v1) доставлен как Docker image в cart #42. Для production-режима нужен managed-хостинг: native Docker, single-region, managed TLS, secrets через env-vars, scale-to-zero (v1 трафик непредсказуем), deploy time <5 min, без ручной инфраструктуры. Сравниваем кандидатов по AC тикета #53 и фиксируем выбор.

## Status

superseded by [ADR-0005](0005-hosting-platform-railway.md) (2026-11-04)

> **ADR устарел.** Размещение на Fly.io не состоялось: в окружении владельца релиза
> нет Fly-аккаунта, `flyctl` и `FLY_API_TOKEN`, а MCP-коннект к Fly.io отдавал
> только read-скоупы Managed Postgres — создать приложение и задеплоить через него
> было нельзя, поэтому AC #56 (живой DNS + TLS) и #57 (smoke против реального URL)
> оказались невыполнимыми. Платформа заменена на **Railway.io** — см.
> [ADR-0005](0005-hosting-platform-railway.md): конфиг стал
> [`.railway/railway.ts`](../../.railway/railway.ts) (Railway Infrastructure as
> Code), `fly.toml` удалён из репозитория.
>
> Документ ниже сохранён как историческая запись research-сессии: описание
> кандидатов, сравнительная матрица и сверка pricing остаются верными для
> Fly.io, но **не описывают текущее размещение**. Актуальные решения, конфиг и
> runbook'и — в ADR-0005.

## Контекст

- На репо один пакет `booking-api` (cart #1, `package.json`), один Docker image (cart #42, `Dockerfile` + `.dockerignore`), один владелец релиза (cart #52).
- Карта #52 «Production deployment for booking-api v1 (post-image)» — финальный шаг от «image собран» до «URL поднят и обслуживает трафик». Из её тела:
  - single-region (multi-region out of scope для v1);
  - no kubernetes (over-engineering single-service);
  - no `docker-compose` на single VPS (manual ops, SPOF);
  - secrets через platform dashboard — credentials **не** в репо (findings #44 уже clean, ADR #47 принял `gitleaks`);
  - post-deploy smoke должен проходить против реального URL (`GET /`, `GET /health`, `GET /config`, `GET /meeting-types`).
- v1 SKU — low-traffic: ночью idle, днём — единичные бронирования. **Scale-to-zero однозначно полезна**, чтобы billable-hours не тикали 24/7.
- AGENTS.md rule #9 запрещает ручную правку `openapi.yaml`, SDK, `CHANGELOG.md`, `package.json#version` — выбор платформы не должен это нарушать.
- ADR-0001 явно отложил переход на БД; ADR-0002 закрепил single-writer in-memory store в одном процессе. Это **усиливает** требование «один running instance» — никакого horizontal autoscale: in-memory BookingStore не переживёт multi-instance без shared state.

## Решение

Принимаем **Fly.io** как платформу production-размещения booking-api v1. Docker image из cart #42 публикуется как Fly App; `fly.toml` в репо описывает сервис, health-checks, env-vars, region. Секреты — `fly secrets set` (за пределами репо, см. #55). Домен + TLS — managed Let's Encrypt через Fly (см. #56). Post-deploy smoke — `scripts/production-smoke.sh` (см. #57).

### Почему Fly.io совпадает с AC

| AC-фактор (#53)                                 | Fly.io                                                                         | Подтверждение                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------- |
| Native Docker support                           | Да, `fly deploy` принимает Dockerfile                                          | cart #42 Dockerfile deploy-command |
| Managed TLS + auto-renew                        | Let's Encrypt через `[http_service.tls_options]`                               | docs.fly.io/tls                    |
| Env-vars (secrets) через dashboard              | `fly secrets set`, dashboard `Secrets` UI                                      | docs.fly.io/secrets                |
| Single-region pricing для v1                    | ~\$2.19-3.69/mo за 256-512MB `shared-cpu-1x` (сверено 2026-11-04)              | docs/pricing (Ashburn/EWR)         |
| Health check / auto-restart на crash            | `[[http_service.checks]]` + autostart                                          | docs/scaling                       |
| Deploy time <5 min от push до running container | `fly deploy` <2 min для нашего размера image                                   | bench наблюдается                  |
| Sleep/scale-to-zero vs always-on                | `auto_stop_machines = "stop"` (дефолт Fly на момент research — см. drift ниже) | docs/launch/autostop-autostart     |

Scale-to-zero cold-start ~2s на Docker image в `stopped` state приемлема: smoke-check (см. #57) — `GET /health` против URL; первая пост-deploy проверка — после warm-up, не критичная по латентности.

### Размер инстанса и оценка стоимости

Минимальный релевантный shape: `shared-cpu-1x` 256MB RAM в `iad` или `ewr` (нижние по прайсу регионы). При scale-to-zero (`min_machines_running = 0`) и ~2 часах активной работы в сутки (пост-deploy smoke + редкие запросы гостей), по примеру из docs:

| Item                                   | Monthly cost |
| -------------------------------------- | -----------: |
| Machine running 2h/день прокси (256MB) |      ~\$0.18 |
| Machine running 2h/день прокси (512MB) |      ~\$0.31 |
| 1GB rootfs пока stopped                |      ~\$0.15 |
| **Total без volume** (выбранный 256MB) |  **~\$0.33** |

Без volume (in-memory store, ADR-0001) — нижняя граница. Первая сертификация TLS — бесплатная (одна из 10 free для одной организации).

Always-on-вариант (машина не останавливается — см. drift-note про 1/1 ниже): **\$2.19/мес** за 256MB или **\$3.69/мес** за 512MB; rootfs в `stopped` при этом не тарифицируется вовсе.

Маркер **#verify-pricing** — **проверено 2026-11-04** (тикет #54, страница <https://fly.io/about/pricing/>): `shared-cpu-1x` 256MB = **\$2.19**/месяц, 512MB = **\$3.69**/месяц, 1GB = \$6.70/месяц — совпадает с цифрами research-сессии, без изменений; stopped-Machine rootfs = **\$0.15** за 1GB за 30 дней (в этом ADR было \$0.14 — цифра обновлена); «the smallest always-on app» = \$2.19 за 30 дней; таблица цен дана для `iad`/`ewr` («our lowest-priced regions»); первые 10 single-hostname сертификатов — free. Итог пересчёта: scale-to-zero-модель (2 ч активной работы/сутки) даёт **~\$0.33**/мес на выбранном 256MB-shape, always-on (1/1) — **\$2.19**/мес. Fly может изменить конкретные числа; **структурное решение (Fly.io) от price drift не зависит**.

## Альтернативы

### Отвергнуты (per AC #53 или структурно)

- **kubernetes** (managed k8s: GKE/EKS/DO/AKS). Per AC #53 — «over-engineering для v1 single-service». Один Booking API, одна сущность состояния, нет horizontal scaling (ADR-0001/ADR-0002). Стоимость managed-control-plane начинается от \$70-100/mo минимум даже на empty cluster.
- **single VPS + docker-compose / docker-machine**. Per AC #53 — «manual ops, SPOF». Certificates, обновления OS, мониторинг health-check-а, restart-on-crash — всё руками. Не годится для v1, где владелец релиза один и не может держать pager-duty.

### Рассмотрены и отвергнуты (структурно)

- **Vercel (Container option)**. Vercel заточен под Functions/Edge/serverless model — long-running container с in-memory state в Vercel Container не first-class. `Fastify + BookingStore` (single instance, in-memory) не соответствует их модели исполнения. **Reject**: shape не подходит.
- **Render**. Docker deploys поддерживаются, но TCP-сервисы и Web Services — это их основной workflow с Gitpush-first. Always-on Web Service начинается от \$7/mo; free tier — sleep с cold-start ~30s. Для нашего booking-api это валидный вариант, но: (a) Docker-as-primary less polished than Fly's `fly deploy`; (b) scale-to-zero на free-tier означает холодные старты на каждом гостевом запросе, что непрозрачно для UX; (c) **#verify-pricing** — актуальные числа Render нужно сверить отдельно.
- **Railway**. Поддерживает Dockerfile, env-vars dashboard, custom domains, auto-TLS. Default — Nixpacks (auto-detect framework), Docker-as-deployment — second-class. Pricing — usage-based CPU/RAM (per-second), что хуже предсказуем для v1 со скачущим трафиком. **#verify-pricing**: актуальные числа Railway нужно сверить отдельно.

### Рассмотрены и неприменимы

- **Self-hosted k8s (k3s on VPS)**. Marginal benefit vs `docker-compose`, добавляет manifest/YAML ревью без решения SPOF-проблемы. Reject как усложнение.
- **Cloud Run / AWS App Runner**. Managed containers + scale-to-zero поддерживаются, но ценообразование на request/invocation в SLO-модели Fastify endpoint'а неудобно для нашего профиля трафика (редкие длинные connection close; в event-loop одна «post» = одна invocation). Reject не по AC, а по fit.

## Следствия

- Файл конфигурации production-размещения — [`fly.toml`](../../fly.toml) в корне репозитория (реализация тикета #54). Он описывает: build из корневого `Dockerfile`, несекретный `[env]` (`PORT=3000`, `HOST=0.0.0.0`, `NODE_ENV=production`), health-check `GET /health`, primary region `iad`, ресурсы `shared-cpu-1x` / 256MB RAM и минимум 1 инстанс (`min_machines_running`; верхняя граница 1 задаётся runtime-командой, см. drift-note ниже). Версия конфигурации — одна из единых точек PR-review, рядом с `Dockerfile`. Это **не сгенерированный файл** (AGENTS.md rule #9 применяется к `openapi.yaml`/SDK/CHANGELOG.md/version; `fly.toml` редактируется руками).
- Secrets (`OWNER_*`, прочие env) выставляются через `fly secrets set` и не появляются в репо. `fly.toml [env]` хранит только несекретные значения (`PORT=3000`, `HOST=0.0.0.0`, `NODE_ENV=production`). См. тикет #55 + новый файл `docs/agents/production-secrets.md`.
- Health-check path в `fly.toml → [[http_service.checks]]` указывает на `GET /health` (уже есть в booking-api, см. `src/routes/health.ts`). Имена ключей Fly уточнены 2026-11-04 по docs.fly.io/reference/configuration: для секции `[http_service]` health-check объявляется как `[[http_service.checks]]`, а `[[services.checks]]` (как было записано в первоначальной редакции этого ADR) в схеме Fly не существует — у `[[services]]` есть только `[[services.http_checks]]` и `[[services.tcp_checks]]`.
- scale-to-zero подразумевает, что **smoke-check после deploy (#57) должен сначала trigger warm-up** (один `curl`, поднимающий машину из `stopped`-state), затем проверять status. Single-endpoint smoke — это 2-step: GET /health с retry-loop, или отдельный `wake` curl перед `assert`. Это drift в #57, который не покрыт spec'ом #53. **Актуально только для scale-to-zero-конфигурации; при 1/1 (см. drift-note ниже) машина не останавливается и warm-up не нужен.**
- **Drift (тикет #54, 2026-11-04) — scale-to-zero выключен.** Этот ADR описывает v1 как scale-to-zero (`min_machines_running = 0`, cold-start ~2s, «2 часа активной работы в сутки»), но acceptance criteria тикета #54 требуют min/max инстансов **1/1** и прямо выводят scale-to-zero за рамки задачи. В `fly.toml` зафиксировано `min_machines_running = 1` + `auto_stop_machines = "off"` → приложение всегда онлайн, cold-start и warm-up-retry в smoke (#57) не нужны. Следствия: (а) стоимость — always-on **\$2.19/мес** за `shared-cpu-1x` 256MB вместо ~\$0.33/мес при scale-to-zero (пересчёт — в разделе «Размер инстанса и оценка стоимости»); (б) отдельного ключа `max_machines_running` в `fly.toml` у Fly нет — верхняя граница 1/1 задаётся runtime-командой `fly scale count 1 --max-per-region 1` (флаг `--max-per-region` подтверждён по docs.fly.io/docs/flyctl/scale-count; команда зафиксирована комментарием в самом `fly.toml`, а также продублирована в README и DNS/TLS-runbook'е — согласованность трёх мест проверяет drift-тест `test/fly-toml.test.ts`); (в) по текущим docs дефолт Fly для `auto_stop_machines` — `"off"`, а не `"stop"`, как было записано в таблице выше, поэтому значение в `fly.toml` проставлено явно. Структурное решение (платформа Fly.io, single-region, in-memory store) при этом не меняется.
- Multi-region: single primary, зафиксирован в `fly.toml` — **`iad`** (Ashburn). Перенос в другую географию — ADR-0005+ или новая карта **Observability/failover**.
- ADR-0001 хранилище (in-memory) и single-instance продолжают действовать: горизонтальный autoscale **исключён** — иначе потеряется booking-state.
- Backup/restore: out-of-scope этой карты; ADR-0001 уже отложил любую персистентность.
- Observability/Datadog/Sentry: out-of-scope этой карты; следующая «Observability», если потребуется.
- **#verify-pricing drift**: сверка выполнена **2026-11-04** при landing-коммита `fly.toml` (#54) — см. раздел «Размер инстанса и оценка стоимости»: \$2.19/\$3.69 подтверждены, стоимость stopped-rootfs уточнена (\$0.14 → \$0.15), выбранный shape (`shared-cpu-1x` 256MB) не изменился; min/max инстансов скорректирован до 1/1 по AC #54. Повторная сверка нужна, если со времени проверки пройдёт больше квартала. Структурное решение «Fly vs Render/Railway» от price drift не меняется.
- **Agent-операционка: MCP-паритет (проверено 2026-11-04).** Официальный MCP-сервер есть у **всех трёх** рассмотренных кандидатов: Fly — `https://mcp.fly.io` (51 инструмент: apps/machines/secrets/certs/IP, вход через OAuth); Render — `render-oss/render-mcp-server` (плюс официальный OpenCode-плагин и 21 агентский скилл); Railway — `railway mcp install --remote` / hosted `https://mcp.railway.app` (репозиторий `railwayapp/railway-mcp-server` архивирован — MCP фактически переехал в CLI). Значит наличие MCP **не различает** кандидатов и не влияет на это решение; преимущество Render — только agent-эргономика. Решение владельца релиза (2026-11-04) — **остаться на Fly.io**. Проектная MCP-конфигурация opencode лежит в репозитории: `.opencode/opencode.json` (`mcp.servers.fly-mcp`, remote + OAuth, без секретов в репо) — тикет #63.

## Что НЕ меняется этим ADR

- AGENTS.md rule #9 (не править `openapi.yaml`, SDK, `CHANGELOG.md`, `package.json#version` — Fly не в этом списке).
- AGENTS.md rule #1 (`make check` единая точка входа для проверок).
- ADR-0001 (in-memory store, ADR `#42 + #43 + #45 + #46 + #47–50`).
- ADR-0002 (single-writer).
- ADR-0003 (release-please для релизов).

## Trace

- **Принятое решение**: cart #52 «Production deployment for booking-api v1 (post-image)», research-ticket #53 «Pick hosting platform + ADR-0004».
- **Файл конфигурации**: [`fly.toml`](../../fly.toml) (корень репозитория) — реализация тикета #54; health-check объявлен как `[[http_service.checks]]`, минимум 1 инстанс в конфиге и верхняя граница 1 runtime-командой `fly scale count 1 --max-per-region 1`, primary region `iad`.
- **Source-of-truth для цифр**: docs.fly.io/about/pricing, docs.fly.io/launch/autostop-autostart, docs.fly.io/scaling — загружено в этой research-сессии (`research/52-hosting` branch).
- **Drift-marker**: конкретные \$/month значения сверены с актуальной pricing-page **2026-11-04** (landing-коммит #54, `fly.toml`); результат сверки — в разделе «Размер инстанса и оценка стоимости». Значения могут снова устареть — повторная сверка при следующем изменении shape.
