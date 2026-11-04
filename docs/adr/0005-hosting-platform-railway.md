# 0005 — Размещение Booking API v1 на Railway.io

ADR-0004 выбрал Fly.io платформой production-размещения booking-api v1. Размещение
не состоялось: в окружении владельца релиза нет Fly-аккаунта, `flyctl` не установлен,
`FLY_API_TOKEN` не выдан, а MCP-коннект к Fly.io отдавал только read-скоупы для
Managed Postgres — операций создания приложения и деплоя в нём не было. Платформа
меняется на **Railway.io**, где у владельца есть рабочий аккаунт и авторизованный
MCP-коннект.

Этот ADR **supersede'ит** ADR-0004: структурное решение (managed-платформа, native
Docker, single-region, managed TLS, env-vars вне репозитория) сохраняется, меняются
платформа, формат конфигурации и способ доставки.

## Status

accepted (supersedes [ADR-0004](0004-hosting-platform.md))

## Контекст

- На репо один пакет `booking-api` (cart #1), один Docker image (cart #42:
  `Dockerfile` + `.dockerignore`), один владелец релиза (cart #52).
- Карта #52 «Production deployment for booking-api v1 (post-image)» — шаг от
  «image собран» до «URL поднят и обслуживает трафик». Её AC:
  - deploy-конфиг в репозитории, версионируется, одна из единых точек PR-review (#54);
  - secrets через платформу, credentials **не** в репо (#55);
  - публичный DNS + TLS-сертификат, `https://…` → 200 на `/`, `/health`, `/config` (#56);
  - post-deploy smoke против **реального** URL (#57);
  - канонический URL выводится машинно из deploy-конфига, без ручного копирования (#62);
  - проектная MCP-конфигурация агента без токенов в репо (#63).
- ADR-0001/ADR-0002: состояние — в памяти процесса, запись — single-writer. Значит
  горизонтальный autoscale структурно исключён: ровно одна реплика.
- AC #54: min/max инстансов 1/1, scale-to-zero вне scope, RAM ≤ 1GB, health-check
  `GET /health`, build из корневого `Dockerfile`, single primary region.
- Переход на Railway вызван не «улучшением платформы», а **доступностью**: только
  на Railway владелец может выполнить живой деплой и закрыть AC #56/#57 фактом, а не
  процедурой.

### Что изменилось в платформе по сравнению с ADR-0004

| Фактор                | Fly.io (ADR-0004)                                 | Railway.io (этот ADR)                                                   |
| --------------------- | ------------------------------------------------- | ----------------------------------------------------------------------- |
| Формат конфига в репо | `fly.toml` (Config as Code, TOML)                 | `.railway/railway.ts` — **Infrastructure as Code** (TypeScript)         |
| Авторинг              | `flyctl` + `FLY_API_TOKEN`                        | `railway login` (OAuth) + официальный Railway MCP                       |
| Managed TLS           | Let's Encrypt вручную (`fly certs add`)           | Managed TLS на `*.up.railway.app` — автоматически                       |
| Публичный адрес       | `https://<app>.fly.dev`, имя глобально-уникально  | `https://<project>-<env>-<suffix>.up.railway.app`, генерирует платформа |
| Restart policy        | autostart Machines                                | `restartPolicyType: ON_FAILURE`, `restartPolicyMaxRetries: 10`          |
| Лимиты                | `[[vm]] size/memory`                              | `limitOverride.containers.cpu/memoryBytes`                              |
| Регион                | `primary_region = "iad"`                          | `replicas: { "us-east4-eqdc4a": 1 }`                                    |
| Always-on             | `min_machines_running = 1` + `auto_stop_machines` | `sleepApplication: false`                                               |
| Секреты               | `fly secrets set`                                 | `railway variable set` / `set-variables` (sealed variables)             |

## Решение

Принимаем **Railway.io** как платформу production-размещения booking-api v1.

### Формат конфигурации: Infrastructure as Code, а не Config as Code

Конфиг production-размещения — [`../../.railway/railway.ts`](../../.railway/railway.ts)
(официальный Railway IaC, TypeScript). Обоснование:

- Railway **deprecated** Config as Code (`railway.toml` / `railway.json`): сервисы,
  уже управляемые таким файлом, перестанут его читать **2026-12-01** (hard cutoff),
  а новые сервисы не поддерживают его вовсе. Держать в репо умирающий формат — значит
  через полгода получить молчаливо неприменяемый конфиг.
- IaC описывает **проект целиком** (сервисы, домены, переменные, реплики, группы) в
  одном файле, применяется через `railway config plan` → `railway config apply`, и
  умеет `--detailed-exit-code` — то есть пригоден для CI-gate на drift.
- Файл **типизируется**: пакет `railway` (devDependency) даёт типы `railway/iac`, а
  отдельный `tsconfig.railway.json` + `tsc --noEmit -p tsconfig.railway.json` в шаге
  `typecheck` ловят опечатку в конфиге на CI. Это закрывает находку F2 аудита
  карты #52, где `fly.toml` проверялся на _наличие_ ключей, но не на _отсутствие_
  неизвестных: flyctl игнорирует незнакомые ключи молча, и опечатка в
  `min_machines_running` проходила зелёной.

Файл `.railway/railway.ts` — **не generated-артефакт** (AGENTS.md rule #9 касается
`openapi.yaml`, SDK, `CHANGELOG.md` и `package.json#version`); его правят руками.

### Что зафиксировано в `.railway/railway.ts`

- **Source:** GitHub-репозиторий `OrdinaryMagic/ai-for-developers-project-386`, ветка
  `main` — деплой по коммиту в `main`.
- **Build:** `builder: "DOCKERFILE"`, `dockerfilePath: "Dockerfile"` — корневой
  multi-stage image из cart #42.
- **Health-check:** `healthcheckPath: "/health"`, `healthcheckTimeout: 30`. Railway
  не пускает трафик на реплику, пока health-check не отдаёт 2xx.
- **Always-on:** `sleepApplication: false` — scale-to-zero вне scope (AC #54).
- **Restart policy:** `ON_FAILURE` / 10 попыток.
- **Лимиты:** 0.5 vCPU / 500 MB (`limitOverride.containers`) — с запасом меньше
  лимита AC #54 (≤ 1GB). Free-план Railway ограничивает сервис 1 vCPU / 0.5 GB и
  1 репликой — наш конфиг в него укладывается ровно.
- **Регион и реплики:** `replicas: { "us-east4-eqdc4a": 1 }` — US East (Virginia),
  единственный регион, ровно одна реплика (single-writer, ADR-0001/ADR-0002).
- **Переменные:** `env` содержит только несекретные значения — `HOST`, `NODE_ENV` и
  публичные `OWNER_*` (см. ниже). `PORT` не задаётся: Railway инжектит его сам,
  приложение читает `process.env.PORT` (`src/server.ts`).

### Канонический URL: манифест окружения

Railway генерирует платформенный домен `*.up.railway.app` сам, и **сгенерированные
домены в IaC-файл не попадают** (так же и при `railway config pull` — импортёр их
выкидывает). Поэтому единственным источником канонического адреса в репозитории
стал собственный манифест окружения — [`.railway/production.json`](../../.railway/production.json):

```json
{
  "platform": "railway",
  "projectId": "dcdc3e6c-f49c-4040-83b8-2ced035325a4",
  "serviceId": "0032d152-af0a-48b4-96e2-4feff1eb2c9a",
  "environmentId": "3fce1cf2-7cd3-42f2-8288-993f1b07c0d2",
  "region": "us-east4-eqdc4a",
  "publicUrl": "https://booking-api-production-b3a4.up.railway.app"
}
```

Манифест — не конфиг платформы, а **факт**: идентификаторы окружения и фактический
публичный адрес. Из него читают default-URL для `scripts/production-smoke.sh` (#57) и
на него ссылается README (#62). Drift-тест сверяет манифест с README и с
`.railway/railway.ts`.

### Секреты: модель OWNER_* пересмотрена

Находка F1 аудита карты #52: четыре артефакта описывали две несовместимые модели —
README и `fly.toml` требовали выставлять `OWNER_*` через `fly secrets set` («это
секреты»), а runbook по секретам утверждал обратное («секретов в v1 нет, `OWNER_*`
публикуются в `GET /config`»).

Выбранная модель, единая во всех артефактах:

- **`OWNER_*` — не секреты.** `GET /config` отдаёт их всем анонимно, значит
  «секретность» им ничего не даёт. Они живут в `env` в `.railway/railway.ts` и
  перечислены в `.env.example`.
- **Настоящих секретов в v1 нет.** Механизм на будущее — `railway variable set` /
  MCP `set-variables`; на платформе есть **sealed variables** (значение не читается
  обратно), и в выводе `railway config plan` значения по умолчанию редактируются
  (`«hidden»`).
- Секреты **никогда** не попадают в репозиторий: `.gitignore` это блокирует,
  `gitleaks` сканирует репозиторий в CI.

### Graceful shutdown

`src/server.ts` теперь обрабатывает `SIGTERM`/`SIGINT` → `app.close()` с
10-секундным таймаутом. Railway шлёт `SIGTERM` контейнеру и перед заменой реплики;
без обработчика in-flight запросы обрываются на полуслове. Это закрывает находку F3
аудита.

### MCP-конфигурация агента

`.opencode/opencode.json` объявляет `railway-mcp` — remote-сервер
`https://mcp.railway.com` (OAuth). Команды: `opencode mcp add --global railway-mcp
--url https://mcp.railway.com` и `opencode mcp auth railway-mcp`. Токенов в репо
нет — только публичный URL (#63).

### Как Railway совпадает с AC карты #52

| AC-фактор (#53 / карта #52)           | Railway.io                                                    | Подтверждение                                       |
| ------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------- |
| Native Docker support                 | Да: `builder: "DOCKERFILE"` + `dockerfilePath`                | `.railway/railway.ts`, живой деплой из `Dockerfile` |
| Managed TLS + auto-renew              | Да: managed TLS на `*.up.railway.app`, сертификат платформы   | `domain-status` → `railwayManaged: true`            |
| Env-vars (secrets) через dashboard    | `railway variable set`, sealed variables, MCP `set-variables` | docs.railway.com/variables                          |
| Single-region                         | Да: один регион `us-east4-eqdc4a`                             | docs.railway.com/deployments/regions                |
| Health check / auto-restart on crash  | `healthcheckPath` + `restartPolicyType: ON_FAILURE`           | docs.railway.com/deployments/healthchecks           |
| Deploy time <5 min от push до running | Да: живой деплой — build + старт <1 min                       | наблюдение 2026-11-04                               |
| Sleep/scale-to-zero vs always-on      | `sleepApplication: false` — always-on (AC #54)                | docs.railway.com                                    |
| MCP-паритет                           | Да: официальный Railway MCP (71 инструмент)                   | docs.railway.com/guides/mcp                         |

### Стоимость

Railway — usage-based: **\$10/GB-month за память**, **\$20/vCPU-month за CPU**,
per-second, stopped-сервисы не тарифицируются. Наш конфиг: 0.5 vCPU / 500 MB,
всегда онлайн (sleep выключен) ⇒ потолок **~\$15/мес** при полной загрузке
(память \$5 + CPU \$10), реально меньше — считается фактическое потребление.
Плюс тариф плана: Free (\$0, лимит сервиса 1 vCPU / 0.5 GB / 1 реплика — наш конфиг
укладывается ровно) или Hobby (\$5/мес, включая \$5 кредитов). Маркер
**#verify-pricing**: числа сверены **2026-11-04** по <https://railway.com/pricing>;
структурное решение (Railway, single-region, in-memory store) от price drift
не зависит.

## Альтернативы

### Отвергнуты

- **kubernetes** (GKE/EKS/DO/AKS) — over-engineering для single-service; control-plane
  от \$70-100/мес за пустой кластер.
- **single VPS + docker-compose** — manual ops, SPOF: сертификаты, обновления OS,
  restart-on-crash и мониторинг health-check'а — всё руками.
- **Остаться на Fly.io** — отвергнут не по качеству платформы, а по доступности:
  нет аккаунта/`FLY_API_TOKEN`/`flyctl`, MCP-коннект без скоупов на деплой. AC #56
  и #57 физически не выполнимы.
- **Render** — валидный вариант (Docker, env-vars, custom domains, auto-TLS), но
  free-tier со scale-to-zero и cold-start ~30s на каждом гостевом запросе, always-on
  Web Service от \$7/мес. Не выбран: у владельца нет активного Render-проекта, а
  Railway даёт и живой деплой, и MCP.

### Рассмотрены и отвергнуты структурно

- **Vercel (Container option)** — заточен под Functions/Edge/serverless; long-running
  контейнер с in-memory state не first-class.
- **Cloud Run / AWS App Runner** — managed-контейнеры и scale-to-zero есть, но
  ценообразование по invocation'ам неудобно для профиля «редкие длинные соединения».
- **Self-hosted k3s на VPS** — добавляет manifest/YAML-ревью, не решая SPOF.

## Следствия

- Конфиг production-размещения — [`.railway/railway.ts`](../../.railway/railway.ts);
  он коммитится в репозиторий и правятся руками. Рядом — `Dockerfile` и
  `.railway/production.json` (манифест окружения с фактическим `publicUrl`).
- `fly.toml` удалён из репозитория; формат deprecated самой платформой, и
  поддерживать его в репо незачем.
- Контракт конфигурации закреплён тестом `test/railway-config.test.ts`: source/branch,
  builder, health-check, `sleepApplication: false`, restart policy, лимиты ≤ 1GB,
  единственный регион с одной репликой, состав `env` (без `PORT` и без секретов),
  совпадение региона с манифестом, UUID-формат идентификаторов, форма `publicUrl`,
  наличие `tsconfig.railway.json` в скрипте `typecheck` и ссылка на этот ADR.
- Дрейф-шиты переписаны под Railway: `test/production-url.test.ts` (манифест ↔
  README), `test/production-smoke.test.ts` (default-URL из манифеста),
  `test/production-secrets.test.ts` (модель `OWNER_*` = не секрет, sealed
  variables), `test/project-mcp-config.test.ts` (`railway-mcp`).
- Runbook'и переписаны: `docs/agents/production-secrets.md`,
  `docs/agents/production-dns-tls.md`, `docs/agents/production-mcp.md`.
- **Кастомный домен `booking.example.com` (AC #56) — вне scope v1.** Делегировать
  `example.com` владелец не может; процедура подключения custom domain с CNAME и
  managed-сертификатом описана в runbook'е, но фактически развёрнут платформенный
  домен `*.up.railway.app` с managed TLS. Это отклонение от буквы AC #56, зафиксированное
  в комментарии к тикету #56 и в session-манифесте.
- Single-region, single-replica, in-memory store — без изменений (ADR-0001/ADR-0002).
- Backup/restore, observability (Sentry/Datadog) — out-of-scope, как и в ADR-0004.
- Multi-region/failover — отдельная будущая карта.

## Что НЕ меняется этим ADR

- AGENTS.md rule #9 (не править `openapi.yaml`, SDK, `CHANGELOG.md`,
  `package.json#version`).
- AGENTS.md rule #1 (`make check` — единая точка входа для проверок).
- ADR-0001 (in-memory store), ADR-0002 (single-writer), ADR-0003 (release-please).

## Trace

- **Принятое решение:** cart #52 «Production deployment for booking-api v1
  (post-image)»; решение владельца релиза — **2026-11-04**.
- **Предыдущее решение:** [ADR-0004](0004-hosting-platform.md) (Fly.io) —
  superseded этим ADR.
- **Файлы:** [`.railway/railway.ts`](../../.railway/railway.ts) (конфиг, #54),
  [`.railway/production.json`](../../.railway/production.json) (манифест окружения,
  #62), [`tsconfig.railway.json`](../../tsconfig.railway.json) (типизация IaC),
  [`scripts/production-smoke.sh`](../../scripts/production-smoke.sh) (#57),
  [`src/server.ts`](../../src/server.ts) (graceful shutdown).
- **Source-of-truth для цифр:** <https://railway.com/pricing>,
  <https://docs.railway.com/infrastructure-as-code>,
  <https://docs.railway.com/deployments/regions> — сверено 2026-11-04.
- **Живое окружение:** проект `booking-api` (`dcdc3e6c-f49c-4040-83b8-2ced035325a4`),
  окружение `production` (`3fce1cf2-7cd3-42f2-8288-993f1b07c0d2`), сервис
  `booking-api` (`0032d152-af0a-48b4-96e2-4feff1eb2c9a`), домен
  `booking-api-production-b3a4.up.railway.app` (managed TLS).
