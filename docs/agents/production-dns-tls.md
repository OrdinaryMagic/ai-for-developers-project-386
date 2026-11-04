# Public DNS + TLS — booking-api v1 (Railway.io)

Runbook для владельца релиза: как booking-api v1 получает публичный домен и
HTTPS-сертификат на Railway, как проверить результат и что делать, если
сертификат не выпустился или DNS не сошёлся.

- **Платформа:** Railway.io — решение принято в
  [ADR-0005](../adr/0005-hosting-platform-railway.md) (ADR-0004 про Fly.io
  помечен как superseded).
- **Конфиг приложения:** [`.railway/railway.ts`](../../.railway/railway.ts) —
  health-check, лимиты, реплики (тикет #54).
- **Манифест окружения:** [`.railway/production.json`](../../.railway/production.json) —
  IDs окружения и фактический публичный адрес.

Тикет: #56 «Public DNS + TLS». Соседние тикеты карты #52: #54 — deploy-конфиг,
#55 — секреты, #57 — post-deploy smoke.

> **Статус процедуры.** Production-окружение **развёрнуто**: сервис `booking-api`
> в окружении `production`, платформенный домен с managed TLS отвечает 200 на
> `/`, `/health` и `/config`. Кастомный домен `booking.example.com` (placeholder
> из AC #56) **не делегируется** владельцем, поэтому в v1 развёрнут
> платформенный домен Railway; процедура подключения custom domain описана
> ниже и срабатывает, когда появится реальный домен.

## Коротко (Railway)

```bash
# 1. Платформенный домен: Railway выдаёт *.up.railway.app с managed TLS сам.
railway domain                       # сгенерировать домен для сервиса
railway domain list --service booking-api
railway domain status <домен>        # статус домена и DNS-детали

# 2. Custom domain (когда появится реальный домен): Railway сам скажет,
#    какие DNS-записи поставить (CNAME + TXT на подтверждение владения).
railway domain booking.example.com

# 3. Проверки живого окружения.
scripts/production-smoke.sh
```

Railway терминирует TLS на своём edge и сам выпускает и обновляет сертификат
для платформенного домена. Отдельный ACME-cron не нужен: ренью делает платформа.

## Предусловия

- Аккаунт Railway с доступом к проекту `booking-api` и окружению `production`.
- Сервис уже задеплоен (`railway config apply` / `railway redeploy`) — без
  работающей реплики домен не будет отдавать трафик.
- Для custom domain: доступ к DNS-зоне регистратора.

## Шаг 0. Канонический публичный адрес

Railway генерирует платформенный домен сам, и **сгенерированные домены в
IaC-конфиг не попадают** (то же и при `railway config pull` — импортёр их
выкидывает). Поэтому в репозитории адрес зафиксирован отдельно — в манифесте
окружения [`.railway/production.json`](../../.railway/production.json), поле
`publicUrl`:

```json
{
  "platform": "railway",
  "projectId": "dcdc3e6c-f49c-4040-83b8-2ced035325a4",
  "serviceId": "0032d152-af0a-48b4-96e2-4feff1eb2c9a",
  "environmentId": "3fce1cf2-7cd3-42f2-8288-993f1b07c0d2",
  "environmentName": "production",
  "region": "us-east4-eqdc4a",
  "publicUrl": "https://booking-api-production-b3a4.up.railway.app"
}
```

Манифест — источник истины для default-URL smoke-скрипта
([`scripts/production-smoke.sh`](../../scripts/production-smoke.sh), тикет #57) и
для README. Сверка манифеста с README — drift-тест
[`test/production-url.test.ts`](../../test/production-url.test.ts).

## Шаг 1. Платформенный домен (managed TLS)

Railway выдаёт сервису бесплатный домен `*.up.railway.app` сразу при первом
деплое. Если домена нет — генерируем:

```bash
railway domain                       # без аргумента — сгенерировать домен
railway domain list --service booking-api
railway domain status <домен>
```

Ограничение платформы: **один платформенный домен на сервис** (плюс сколько
угодно custom domains).

`railway domain status` показывает:

- `railwayManaged: true` — домен платформенный, сертификат выпускает Railway;
- `certificate` — состояние сертификата (`issued` / `pending` / `failed`);
- DNS-записи — для custom domain (для платформенного пусто: он не требует
  записей в чужой зоне).

Через Railway MCP то же самое: `generate-domain` (создать), `domain-status`
(статус и DNS-детали), `delete-domain` (удалить).

## Шаг 2. Custom domain (вне scope v1)

Кастомный домен в v1 **не развёрнут**: `booking.example.com` из AC #56 —
placeholder, который владелец не может делегировать. Процедура на будущее:

```bash
railway domain booking.example.com
```

Railway покажет **две** DNS-записи, и **обе** обязательны:

| Тип записи | Назначение                                   | Обязательна |
| ---------- | -------------------------------------------- | ----------- |
| `CNAME`    | маршрутизация трафика на платформенный домен | да          |
| `TXT`      | подтверждение владения доменом               | да          |

- Записи ставятся **точно как показал CLI** — иначе проверка владения не
  пройдёт.
- До появления `TXT`-записи и верификации домен отдаёт `404`.
- Распространение DNS может занять до 72 часов.
- CNAME на apex-домен (`example.com`) невозможен — нужен поддомен
  (`booking.example.com`).

Выпуск сертификата для custom domain Railway делает сам; если проверка не
прошла — после исправления DNS:

```bash
railway domain certificate retry booking.example.com
```

## Шаг 3. Проверки

```bash
# Скрипт smoke (тикет #57) — берёт URL из манифеста окружения.
scripts/production-smoke.sh

# Или вручную:
curl -sS -o /dev/null -w '%{http_code}\n' https://booking-api-production-b3a4.up.railway.app/
curl -sS https://booking-api-production-b3a4.up.railway.app/health
curl -sS -o /dev/null -w '%{http_code}\n' https://booking-api-production-b3a4.up.railway.app/config
# UI на том же домене (ADR-0006): браузерный Accept → оболочка SPA.
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' \
  -H 'Accept: text/html' https://booking-api-production-b3a4.up.railway.app/
```

Ожидания:

| Эндпоинт                      | Ожидание                                      |
| ----------------------------- | --------------------------------------------- |
| `GET /`                       | 200                                           |
| `GET /health`                 | 200, тело содержит `"status":"ok"`            |
| `GET /config`                 | 200, тело — валидный JSON                     |
| `GET /meeting-types`          | 200, тело — валидный JSON-массив              |
| `GET /` (`Accept: text/html`) | 200, `content-type: text/html` — оболочка SPA |

Сверка с фактическим деплоем:

```bash
railway status                  # проект и окружение, к которым привязан каталог
railway logs                    # логи рантайма
railway logs --build            # логи сборки
```

Через MCP: `environment-status` (состояние сервиса и реплик), `get-logs`
(`types: ["build"]` / `["deploy"]`), `describe-service` (конфиг + домены),
`get-service-config` (конфигурация сервиса).

## Шаг 4. Обновление адреса в репозитории

Если платформенный домен пересоздан (или проект переименован) — адрес меняется.
Тогда **в том же PR** правим:

1. [`.railway/production.json`](../../.railway/production.json) — поле `publicUrl`;
2. [README.md](../../README.md), раздел «Production deploy» — тот же URL.

До синхронизации записей drift-тест `test/production-url.test.ts` падает: адрес
в репозитории и фактический деплой разойдутся.

## Диагностика

### Сертификат в статусе pending / failed

```bash
railway domain status <домен>        # состояние сертификата и DNS-записи
railway domain certificate retry <домен>   # повтор после исправления DNS
```

Для custom domain чаще всего не сошёлся `TXT`-подтверждающий рекорд или
`CNAME` ведёт не на тот сервис. Для платформенного домена причина обычно
другая: сервис ещё не прошёл health-check — Railway не выпускает сертификат
неработающему сервису.

### 502 / 503 от edge Railway

- `railway logs` — логи рантайма; `railway logs --build` — логи сборки.
- `railway status` / MCP `environment-status` — состояние сервиса и число
  реплик. Ожидается `online` и **1** реплика: больше одной нельзя (state в
  памяти процесса, [ADR-0001](../adr/0001-in-memory-store-with-restart-reset.md)).
- Health-check в [`.railway/railway.ts`](../../.railway/railway.ts) — `GET /health`
  с таймаутом 30 с. Жёсткий health-check: пока реплика не ответила 2xx, трафик
  на неё не идёт.
- Пока старая реплика вытесняется новой, edge может коротко отдавать 502 —
  smoke-скрипт повторяет проверки (retry-loop, `SMOKE_RETRIES` /
  `SMOKE_RETRY_DELAY`).

### Приложение не слышит порт

Railway инжектит `PORT` сам; приложение читает `process.env.PORT`
([`src/server.ts`](../../src/server.ts)). В контейнере должен быть
`HOST=0.0.0.0` — иначе опубликованный порт недостижим снаружи.

### Откат

Custom domain можно снять, не трогая платформенный:

```bash
railway domain list --service booking-api
railway domain delete booking.example.com --yes
```

Платформенный домен удалять не нужно: он и есть публичная точка входа v1.
Если адрес перевёрнут на старый — откат = восстановить прежний `publicUrl` в
`.railway/production.json` и README.

## Ссылки

- [`.railway/railway.ts`](../../.railway/railway.ts) — deploy-конфиг: health-check,
  лимиты, реплики (тикет #54).
- [`.railway/production.json`](../../.railway/production.json) — манифест
  окружения с каноническим `publicUrl` (тикет #62).
- [production-secrets.md](production-secrets.md) — переменные окружения и секреты.
- [production-mcp.md](production-mcp.md) — Railway MCP из агента.
- [ADR-0005 — Размещение Booking API v1 на Railway.io](../adr/0005-hosting-platform-railway.md).
- Документация Railway (сверено **2026-11-04**):
  [Domains](https://docs.railway.com/networking/domains),
  [`railway domain`](https://docs.railway.com/cli/domain),
  [Healthchecks](https://docs.railway.com/deployments/healthchecks),
  [Regions](https://docs.railway.com/deployments/regions).
